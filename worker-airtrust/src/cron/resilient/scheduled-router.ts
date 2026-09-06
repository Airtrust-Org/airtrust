import type { Env } from '../../types';
import { createStructuredConsole } from '../../utils/logger';
import { alertasDiariosHandler } from '../alertasDiarios';
import { logCronHealthSnapshot } from './cron-health';
import { runDailyFrmsOperations } from './daily-frms';
import { runDomainEventDispatchJob } from './domain-events';
import { runEadRenewalJob } from './ead-renewal';
import { runLmsReminderJob } from './lms-reminders';
import { runSigvoosFrmsJobs } from './sigvoos-frms';

const TEN_MINUTE_CRON = '*/10 * * * *';
const DAILY_UTC_CRON = '0 8 * * *';
const LEGACY_DELEGATED_CRON = '__airtrust_resilient_delegated__';

type LegacyScheduledHandler = (
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) => Promise<void>;

export interface ResilientCronPlan {
  useResilientJobs: boolean;
  runDailyAlerts: boolean;
  runLmsReminders: boolean;
  runEadRenewal: boolean;
  runDailyFrms: boolean;
  runSigvoosFrms: boolean;
  runDomainEvents: boolean;
  runCronHealth: boolean;
  delegateLegacy: boolean;
}

export function getResilientCronPlan(cron: string, now = new Date()): ResilientCronPlan {
  const isTenMinute = cron === TEN_MINUTE_CRON;
  const isDaily = cron === DAILY_UTC_CRON;
  return {
    useResilientJobs: isTenMinute || isDaily,
    runDailyAlerts: isDaily,
    runLmsReminders: isDaily || (isTenMinute && now.getUTCHours() === 8),
    runEadRenewal: isTenMinute || isDaily,
    runDailyFrms: isDaily,
    runSigvoosFrms: isTenMinute,
    runDomainEvents: isTenMinute,
    runCronHealth: isTenMinute || isDaily,
    // The legacy handler contains broad daily maintenance blocks. It is not
    // called for every ten-minute tick anymore; backup triggers remain fully
    // delegated through the non-resilient branch above.
    delegateLegacy: isDaily,
  };
}

function withDelegatedCron(event: ScheduledEvent): ScheduledEvent {
  return new Proxy(event, {
    get(target, property, receiver) {
      if (property === 'cron') return LEGACY_DELEGATED_CRON;
      return Reflect.get(target, property, receiver);
    },
  });
}

function isMissingCronStateSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('no such table: cron_job_state') ||
    message.includes('no such table: cron_job_items') ||
    message.includes('no such table: cron_job_runs')
  );
}

export function buildCronStateSchemaProbeQuery(): string {
  return `SELECT
            EXISTS(SELECT 1 FROM cron_job_state LIMIT 1) AS state_available,
            EXISTS(SELECT 1 FROM cron_job_items LIMIT 1) AS items_available,
            EXISTS(SELECT 1 FROM cron_job_runs LIMIT 1) AS runs_available`;
}

async function assertCronStateSchemaAvailable(db: D1Database): Promise<void> {
  await db.prepare(buildCronStateSchemaProbeQuery()).first();
}

export async function runResilientScheduledJobs(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
  legacyHandler: LegacyScheduledHandler,
): Promise<void> {
  const logger = createStructuredConsole('ResilientScheduledRouter', env.ENVIRONMENT);
  const now = new Date();
  const plan = getResilientCronPlan(event.cron, now);

  if (!plan.useResilientJobs) {
    await legacyHandler(event, env, ctx);
    return;
  }

  // Decide fallback before alerts, e-mails or any other side effect.
  try {
    await assertCronStateSchemaAvailable(env.DB);
  } catch (error) {
    if (isMissingCronStateSchema(error)) {
      logger.warn('[CRON_ROUTER] Schema resiliente ausente; usando handler legado nesta execução', {
        trigger: event.cron,
        error_code: 'CRON_STATE_SCHEMA_UNAVAILABLE',
      });
      await legacyHandler(event, env, ctx);
      return;
    }
    throw error;
  }

  const failures: Array<{ job: string; error: string }> = [];
  const runStep = async (job: string, enabled: boolean, task: () => Promise<unknown>) => {
    if (!enabled) return;
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ job, error: message });
      logger.error('[CRON_ROUTER] Job falhou; demais jobs do tick continuarão em ordem', {
        trigger: event.cron,
        job,
        error_code: message,
      });
    }
  };

  // Preserve the existing ordering. Isolation is sequential rather than
  // Promise.allSettled because SIGVOOS/domain-event/FRMS jobs can have
  // operational dependencies and must not be made concurrent by a reliability fix.
  await runStep('daily-alerts', plan.runDailyAlerts, () => alertasDiariosHandler(event, env));
  await runStep('lms-reminders', plan.runLmsReminders, () => runLmsReminderJob(env.DB, logger, now));
  await runStep('ead-renewal', plan.runEadRenewal, () => runEadRenewalJob(env.DB, env, logger));
  await runStep('sigvoos-frms', plan.runSigvoosFrms, () =>
    runSigvoosFrmsJobs(env.DB, env, logger, now),
  );
  await runStep('domain-events', plan.runDomainEvents, () =>
    runDomainEventDispatchJob(env.DB, logger),
  );
  await runStep('daily-frms', plan.runDailyFrms, () => runDailyFrmsOperations(event, env, logger));
  await runStep('cron-health', plan.runCronHealth, () => logCronHealthSnapshot(env.DB, logger, now));

  if (plan.delegateLegacy) {
    // Keep daily generic maintenance, while neutralizing the functional blocks
    // already executed by the resilient router.
    await runStep('legacy-delegated', true, () => legacyHandler(withDelegatedCron(event), env, ctx));
  }

  if (failures.length > 0) {
    throw new Error(
      `CRON_TICK_PARTIAL_FAILURE: ${failures.map((failure) => failure.job).join(', ')}`,
    );
  }
}

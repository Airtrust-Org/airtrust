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

  try {
    // Decide fallback before alerts, e-mails or any other side effect.
    await assertCronStateSchemaAvailable(env.DB);

    if (plan.runDailyAlerts) {
      await alertasDiariosHandler(event, env);
    }

    if (plan.runLmsReminders) {
      await runLmsReminderJob(env.DB, logger, now);
    }

    if (plan.runEadRenewal) {
      await runEadRenewalJob(env.DB, env, logger);
    }

    if (plan.runSigvoosFrms) {
      await runSigvoosFrmsJobs(env.DB, env, logger, now);
    }

    if (plan.runDomainEvents) {
      await runDomainEventDispatchJob(env.DB, logger);
    }

    if (plan.runDailyFrms) {
      await runDailyFrmsOperations(event, env, logger);
    }

    if (plan.runCronHealth) {
      await logCronHealthSnapshot(env.DB, logger, now);
    }
  } catch (error) {
    if (isMissingCronStateSchema(error)) {
      logger.warn('[CRON_ROUTER] Schema resiliente ausente; usando handler legado nesta execução', {
        trigger: event.cron,
        error_code: 'CRON_STATE_SCHEMA_UNAVAILABLE',
      });
      await legacyHandler(event, env, ctx);
      return;
    }

    logger.error('[CRON_ROUTER] Falha não recuperável antes da delegação legada', {
      trigger: event.cron,
      error_code: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (plan.delegateLegacy) {
    // Keep daily generic maintenance, while neutralizing the functional blocks
    // already executed by the resilient router.
    await legacyHandler(withDelegatedCron(event), env, ctx);
  }
}

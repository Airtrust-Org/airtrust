import type { Env } from '../../types';
import { createStructuredConsole } from '../../utils/logger';
import { alertasDiariosHandler } from '../alertasDiarios';
import { processarNotificacoes, TRAINING_ALERT_DAILY_CRON } from '../notificacoes';
import { refreshTrainingComplianceSnapshots } from '../training-compliance-notifications';
import { processTrainingComplianceReportAutomation } from '../training-compliance-reports';
import { logCronHealthSnapshot } from './cron-health';
import { runDailyFrmsOperations } from './daily-frms';
import { runDomainEventDispatchJob } from './domain-events';
import { runEadRenewalJob } from './ead-renewal';
import { runTrainingComplianceRosterJob } from './compliance-roster';
import { runSigvoosFrmsJobs } from './sigvoos-frms';
import { processLicenseAlerts } from '../license-alerts';
import { cleanupExpiredRefreshTokens } from '../../services/auth-refresh-token';
import { purgeOldCronJobRuns } from './cron-runs-retention';
import { isCronD1Overloaded } from './job-runner';

const TEN_MINUTE_CRON = '*/10 * * * *';
const DAILY_UTC_CRON = TRAINING_ALERT_DAILY_CRON;
const LEGACY_DELEGATED_CRON = '__airtrust_resilient_delegated__';

type LegacyScheduledHandler = (
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) => Promise<void>;

export interface ResilientCronPlan {
  useResilientJobs: boolean;
  runDailyAlerts: boolean;
  runLicenseAlerts: boolean;
  runRefreshTokenCleanup: boolean;
  runComplianceReports: boolean;
  runEadRenewal: boolean;
  runComplianceRoster: boolean;
  runDailyFrms: boolean;
  runSigvoosFrms: boolean;
  runDomainEvents: boolean;
  runCronHealth: boolean;
  delegateLegacy: boolean;
}

export function getResilientCronPlan(cron: string, scheduledAt = new Date()): ResilientCronPlan {
  const isTenMinute = cron === TEN_MINUTE_CRON;
  const isDaily = cron === DAILY_UTC_CRON;
  // Separate the two expensive D1 consumers across adjacent 10-minute ticks.
  // The same fixed UTC slot is chosen on every Worker isolate; a slow trigger
  // cannot drift into a different phase or process both sources accidentally.
  // Durable per-tenant cursors/leases preserve resumable work across phases.
  const minute = Math.floor(scheduledAt.getUTCMinutes() / 10) * 10;
  const sigvoosSlot = minute % 20 === 0;
  const domainSlot = minute % 20 === 10;
  const healthSlot = minute % 30 === 20;
  return {
    useResilientJobs: isTenMinute || isDaily,
    runDailyAlerts: isDaily,
    runLicenseAlerts: isDaily,
    runRefreshTokenCleanup: isDaily,
    runComplianceReports: isTenMinute || isDaily,
    runEadRenewal: isTenMinute || isDaily,
    runComplianceRoster: isTenMinute || isDaily,
    runDailyFrms: isDaily,
    runSigvoosFrms: isTenMinute && sigvoosSlot,
    runDomainEvents: isTenMinute && domainSlot,
    runCronHealth: isDaily || (isTenMinute && healthSlot),
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
  const scheduledAt =
    Number.isFinite(event.scheduledTime) && event.scheduledTime > 0
      ? new Date(event.scheduledTime)
      : now;
  const plan = getResilientCronPlan(event.cron, scheduledAt);

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
  let saturated = false;
  const runStep = async (job: string, enabled: boolean, task: () => Promise<unknown>) => {
    if (!enabled) return;
    if (saturated) {
      logger.warn('[CRON_ROUTER] Job adiado até o próximo tick por sobrecarga D1', {
        trigger: event.cron,
        job,
        error_code: 'D1_OVERLOADED_TICK_BREAKER',
      });
      return;
    }
    try {
      const result = await task();
      // The durable runner catches and returns FAILED instead of throwing.
      // Propagate its persisted overload code before running the next D1 job.
      const summary = result as { outcome?: unknown; errorCode?: unknown } | null;
      if (summary?.outcome === 'FAILED' && isCronD1Overloaded(summary.errorCode)) {
        throw new Error('D1_DB_IS_OVERLOADED');
      }
    } catch (error) {
      const overloaded = isCronD1Overloaded(error);
      if (overloaded) saturated = true;
      const errorCode = overloaded ? 'D1_OVERLOADED' : 'CRON_STEP_FAILURE';
      failures.push({ job, error: errorCode });
      logger.error('[CRON_ROUTER] Job falhou; estado conservador preservado', {
        trigger: event.cron,
        job,
        error_code: errorCode,
      });
    }
  };

  // Preserve the existing ordering. Isolation is sequential rather than
  // Promise.allSettled because SIGVOOS/domain-event/FRMS jobs can have
  // operational dependencies and must not be made concurrent by a reliability fix.
  // In the delegated legacy handler the cron label is intentionally replaced.
  // These daily-only jobs were silently skipped without explicit routing.
  await runStep('refresh-token-cleanup', plan.runRefreshTokenCleanup, () =>
    cleanupExpiredRefreshTokens(env.DB),
  );
  await runStep('cron-runs-retention', plan.runRefreshTokenCleanup, () =>
    purgeOldCronJobRuns(env.DB),
  );
  await runStep('training-compliance-snapshots', plan.runDailyAlerts, () =>
    refreshTrainingComplianceSnapshots(env),
  );
  await runStep('training-compliance-reports', plan.runComplianceReports, () =>
    processTrainingComplianceReportAutomation(env, now),
  );
  await runStep('training-alerts', plan.runDailyAlerts, () => processarNotificacoes(env));
  await runStep('daily-alerts', plan.runDailyAlerts, () => alertasDiariosHandler(event, env));
  await runStep('ead-renewal', plan.runEadRenewal, () => runEadRenewalJob(env.DB, logger));
  await runStep('lms-compliance-roster', plan.runComplianceRoster, () => runTrainingComplianceRosterJob(env.DB, logger));
  await runStep('sigvoos-frms', plan.runSigvoosFrms, () =>
    runSigvoosFrmsJobs(env.DB, env, logger, now),
  );
  await runStep('domain-events', plan.runDomainEvents, () =>
    runDomainEventDispatchJob(env.DB, logger),
  );
  await runStep('daily-frms', plan.runDailyFrms, () => runDailyFrmsOperations(event, env, logger));
  await runStep('license-alerts', plan.runLicenseAlerts, () => processLicenseAlerts(env));
  await runStep('cron-health', plan.runCronHealth, () =>
    logCronHealthSnapshot(env.DB, logger, now),
  );

  if (plan.delegateLegacy) {
    // Keep daily generic maintenance, while neutralizing the functional blocks
    // already executed by the resilient router.
    await runStep('legacy-delegated', true, () =>
      legacyHandler(withDelegatedCron(event), env, ctx),
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `CRON_TICK_PARTIAL_FAILURE: ${failures.map((failure) => failure.job).join(', ')}`,
    );
  }
}

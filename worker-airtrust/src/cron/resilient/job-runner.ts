import {
  acquireCronJobLease,
  createCronLeaseOwner,
  finishCronJobRun,
  getCronJobState,
  heartbeatCronJobLease,
  markCronJobFailure,
  markCronJobSuccess,
  releaseCronJobLease,
  startCronJobRun,
  updateCronJobCheckpoint,
  type CronJobOutcome,
  type CronJobStateRow,
} from '../job-state';
import { emitOperationalMetric } from '../../observability/operational-metrics';

/**
 * Preventive limits deliberately stay below the Worker platform ceiling.
 * They include D1 statements performed by the durable state/lease machinery.
 * Jobs must stop and checkpoint before consuming the reserve.
 */
export const CRON_D1_OPERATION_LIMIT = 700;
export const CRON_EXTERNAL_CALL_LIMIT = 20;
export const CRON_D1_OPERATION_RESERVE = 30;
export const CRON_EXTERNAL_CALL_RESERVE = 2;

export interface CronJobLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface CronOperationBudgetSnapshot {
  planned_d1: number;
  planned_external: number;
  executed_d1: number;
  executed_external: number;
  remaining_d1: number;
  remaining_external: number;
  stop_reason: string | null;
}

export interface CronJobExecutionContext {
  db: D1Database;
  jobName: string;
  scopeKey: string;
  owner: string;
  runId: string;
  state: CronJobStateRow | null;
  deadlineMs: number;
  hasBudget: (reserveMs?: number) => boolean;
  hasOperationalBudget: (d1?: number, external?: number) => boolean;
  consumeD1: (count?: number) => boolean;
  consumeExternal: (count?: number) => boolean;
  planOperations: (d1: number, external?: number) => void;
  stopForBudget: (reason: string) => void;
  budgetSnapshot: () => CronOperationBudgetSnapshot;
  heartbeat: () => Promise<void>;
  checkpoint: (input: {
    cursorValue: string | null;
    watermarkFrom?: string | null;
    watermarkTo?: string | null;
    metadata?: Record<string, unknown> | null;
    processedDelta?: number;
    failedDelta?: number;
  }) => Promise<void>;
}

export interface CronJobExecutionResult {
  outcome: Exclude<CronJobOutcome, 'RUNNING' | 'SKIPPED_LEASE'>;
  processedCount?: number;
  failedCount?: number;
  cursorAfter?: string | null;
  watermarkFrom?: string | null;
  watermarkTo?: string | null;
  metadata?: Record<string, unknown> | null;
  markStateSuccess?: boolean;
}

export interface CronJobRunSummary {
  outcome: Exclude<CronJobOutcome, 'RUNNING'>;
  processedCount: number;
  failedCount: number;
  errorCode?: string;
}

function normalizeErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'CRON_JOB_FAILED');
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return normalized || 'CRON_JOB_FAILED';
}

function boundedCount(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

export function createCronOperationBudget(input?: {
  d1Limit?: number;
  externalLimit?: number;
  d1Reserve?: number;
  externalReserve?: number;
}) {
  const d1Limit = boundedCount(
    input?.d1Limit ?? CRON_D1_OPERATION_LIMIT,
    CRON_D1_OPERATION_LIMIT,
    5000,
  );
  const externalLimit = boundedCount(
    input?.externalLimit ?? CRON_EXTERNAL_CALL_LIMIT,
    CRON_EXTERNAL_CALL_LIMIT,
    1000,
  );
  const d1Reserve = Math.min(
    d1Limit - 1,
    Math.max(0, Math.trunc(input?.d1Reserve ?? CRON_D1_OPERATION_RESERVE)),
  );
  const externalReserve = Math.min(
    externalLimit - 1,
    Math.max(0, Math.trunc(input?.externalReserve ?? CRON_EXTERNAL_CALL_RESERVE)),
  );

  let plannedD1 = 0;
  let plannedExternal = 0;
  let executedD1 = 0;
  let executedExternal = 0;
  let stopReason: string | null = null;

  const has = (d1 = 0, external = 0) =>
    executedD1 + Math.max(0, d1) <= d1Limit - d1Reserve &&
    executedExternal + Math.max(0, external) <= externalLimit - externalReserve;

  return {
    plan(d1: number, external = 0) {
      plannedD1 = Math.max(plannedD1, Math.max(0, Math.trunc(d1)));
      plannedExternal = Math.max(plannedExternal, Math.max(0, Math.trunc(external)));
    },
    has,
    consumeD1(count = 1) {
      const normalized = Math.max(0, Math.trunc(count));
      if (!has(normalized, 0)) {
        stopReason = stopReason || 'D1_PREVENTIVE_LIMIT';
        return false;
      }
      executedD1 += normalized;
      return true;
    },
    consumeExternal(count = 1) {
      const normalized = Math.max(0, Math.trunc(count));
      if (!has(0, normalized)) {
        stopReason = stopReason || 'EXTERNAL_PREVENTIVE_LIMIT';
        return false;
      }
      executedExternal += normalized;
      return true;
    },
    stop(reason: string) {
      stopReason = String(reason || 'PREVENTIVE_LIMIT').slice(0, 120);
    },
    snapshot(): CronOperationBudgetSnapshot {
      return {
        planned_d1: plannedD1,
        planned_external: plannedExternal,
        executed_d1: executedD1,
        executed_external: executedExternal,
        remaining_d1: Math.max(0, d1Limit - executedD1),
        remaining_external: Math.max(0, externalLimit - executedExternal),
        stop_reason: stopReason,
      };
    },
  };
}

export async function runCronJobWithLease(input: {
  db: D1Database;
  jobName: string;
  scopeKey: string;
  logger: CronJobLogger;
  execute: (context: CronJobExecutionContext) => Promise<CronJobExecutionResult>;
  ttlSeconds?: number;
  budgetMs?: number;
  operationBudget?: {
    d1Limit?: number;
    externalLimit?: number;
    d1Reserve?: number;
    externalReserve?: number;
  };
  metadata?: Record<string, unknown> | null;
}): Promise<CronJobRunSummary> {
  const ttlSeconds = Math.max(30, Math.min(3600, Math.trunc(input.ttlSeconds ?? 180)));
  const budgetMs = Math.max(1000, Math.min(10 * 60_000, Math.trunc(input.budgetMs ?? 25_000)));
  const owner = createCronLeaseOwner(input.jobName);
  const startedAt = Date.now();
  const operationBudget = createCronOperationBudget(input.operationBudget);

  // Reserve the durable runner overhead: acquire, state read, run insert,
  // checkpoint, success/failure update, run finish and lease release.
  operationBudget.consumeD1(8);

  const acquired = await acquireCronJobLease(input.db, {
    jobName: input.jobName,
    scopeKey: input.scopeKey,
    owner,
    ttlSeconds,
  });

  if (!acquired) {
    input.logger.log('[CRON_JOB] Execução ignorada por lease ativo', {
      job_name: input.jobName,
      scope_key: input.scopeKey,
      outcome: 'SKIPPED_LEASE',
    });
    emitOperationalMetric({
      event: 'operational_metric',
      operation: 'cron',
      tenant_scope: input.scopeKey,
      status: 200,
      partial: true,
      stop_reason: 'LEASE_ACTIVE',
    });
    return { outcome: 'SKIPPED_LEASE', processedCount: 0, failedCount: 0 };
  }

  const runId = crypto.randomUUID();
  let runStarted = false;

  try {
    const state = await getCronJobState(input.db, input.jobName, input.scopeKey);
    await startCronJobRun(input.db, {
      runId,
      jobName: input.jobName,
      scopeKey: input.scopeKey,
      owner,
      cursorBefore: state?.cursor_value ?? null,
      metadata: input.metadata,
    });
    runStarted = true;

    const context: CronJobExecutionContext = {
      db: input.db,
      jobName: input.jobName,
      scopeKey: input.scopeKey,
      owner,
      runId,
      state,
      deadlineMs: startedAt + budgetMs,
      hasBudget: (reserveMs = 750) =>
        Date.now() + Math.max(0, reserveMs) < startedAt + budgetMs && operationBudget.has(),
      hasOperationalBudget: operationBudget.has,
      consumeD1: operationBudget.consumeD1,
      consumeExternal: operationBudget.consumeExternal,
      planOperations: operationBudget.plan,
      stopForBudget: operationBudget.stop,
      budgetSnapshot: operationBudget.snapshot,
      heartbeat: async () => {
        if (!operationBudget.consumeD1()) {
          throw new Error('CRON_D1_PREVENTIVE_LIMIT');
        }
        const renewed = await heartbeatCronJobLease(input.db, {
          jobName: input.jobName,
          scopeKey: input.scopeKey,
          owner,
          ttlSeconds,
        });
        if (!renewed) throw new Error('CRON_LEASE_LOST');
      },
      checkpoint: async (checkpoint) => {
        if (!operationBudget.consumeD1()) {
          throw new Error('CRON_D1_PREVENTIVE_LIMIT');
        }
        const updated = await updateCronJobCheckpoint(input.db, {
          jobName: input.jobName,
          scopeKey: input.scopeKey,
          owner,
          ...checkpoint,
        });
        if (!updated) throw new Error('CRON_LEASE_LOST');
      },
    };

    const result = await input.execute(context);
    const processedCount = Math.max(0, Math.trunc(result.processedCount ?? 0));
    const failedCount = Math.max(0, Math.trunc(result.failedCount ?? 0));
    const budgetSnapshot = operationBudget.snapshot();
    const metadata = {
      ...(result.metadata || {}),
      operation_budget: budgetSnapshot,
    };

    await context.checkpoint({
      cursorValue: result.cursorAfter ?? state?.cursor_value ?? null,
      watermarkFrom: result.watermarkFrom ?? state?.watermark_from ?? null,
      watermarkTo: result.watermarkTo ?? state?.watermark_to ?? null,
      metadata,
      processedDelta: processedCount,
      failedDelta: failedCount,
    });

    if (result.outcome === 'SUCCEEDED' && result.markStateSuccess !== false) {
      const marked = await markCronJobSuccess(input.db, {
        jobName: input.jobName,
        scopeKey: input.scopeKey,
        owner,
        cursorValue: result.cursorAfter ?? null,
        watermarkFrom: result.watermarkFrom ?? null,
        watermarkTo: result.watermarkTo ?? null,
        metadata,
      });
      if (!marked) throw new Error('CRON_LEASE_LOST');
    }

    await finishCronJobRun(input.db, {
      runId,
      outcome: result.outcome,
      durationMs: Date.now() - startedAt,
      processedCount,
      failedCount,
      cursorAfter: result.cursorAfter ?? null,
      metadata,
    });

    input.logger.log('[CRON_JOB] Execução concluída', {
      correlation_id: runId,
      job_name: input.jobName,
      scope_key: input.scopeKey,
      duration_ms: Date.now() - startedAt,
      outcome: result.outcome,
      processed_count: processedCount,
      failed_count: failedCount,
      operation_budget: budgetSnapshot,
    });
    emitOperationalMetric({
      event: 'operational_metric',
      operation: 'cron',
      tenant_scope: input.scopeKey,
      status: result.outcome === 'FAILED' ? 500 : 200,
      latency_ms: Date.now() - startedAt,
      processed_count: processedCount,
      failed_count: failedCount,
      partial: result.outcome === 'PARTIAL',
      d1_operations: budgetSnapshot.executed_d1,
      external_calls: budgetSnapshot.executed_external,
      cursor: result.cursorAfter ?? null,
      stop_reason: budgetSnapshot.stop_reason,
      job_name: input.jobName,
    });

    return { outcome: result.outcome, processedCount, failedCount };
  } catch (error) {
    const errorCode = normalizeErrorCode(error);
    try {
      await markCronJobFailure(input.db, {
        jobName: input.jobName,
        scopeKey: input.scopeKey,
        owner,
        errorCode,
        metadata: {
          ...(input.metadata || {}),
          operation_budget: operationBudget.snapshot(),
        },
      });
    } catch (stateError) {
      input.logger.warn('[CRON_JOB] Falha ao registrar estado de erro', {
        job_name: input.jobName,
        scope_key: input.scopeKey,
        error_code: normalizeErrorCode(stateError),
      });
    }

    if (runStarted) {
      try {
        await finishCronJobRun(input.db, {
          runId,
          outcome: 'FAILED',
          durationMs: Date.now() - startedAt,
          failedCount: 1,
          errorCode,
          metadata: { operation_budget: operationBudget.snapshot() },
        });
      } catch (runError) {
        input.logger.warn('[CRON_JOB] Falha ao encerrar run', {
          correlation_id: runId,
          error_code: normalizeErrorCode(runError),
        });
      }
    }

    input.logger.error('[CRON_JOB] Execução falhou', {
      correlation_id: runId,
      job_name: input.jobName,
      scope_key: input.scopeKey,
      duration_ms: Date.now() - startedAt,
      outcome: 'FAILED',
      error_code: errorCode,
    });
    emitOperationalMetric({
      event: 'operational_metric',
      operation: 'cron',
      tenant_scope: input.scopeKey,
      status: 500,
      latency_ms: Date.now() - startedAt,
      failed_count: 1,
      error_category: errorCode,
      d1_operations: operationBudget.snapshot().executed_d1,
      external_calls: operationBudget.snapshot().executed_external,
      stop_reason: operationBudget.snapshot().stop_reason,
      job_name: input.jobName,
    });

    return { outcome: 'FAILED', processedCount: 0, failedCount: 1, errorCode };
  } finally {
    try {
      await releaseCronJobLease(input.db, {
        jobName: input.jobName,
        scopeKey: input.scopeKey,
        owner,
      });
    } catch (releaseError) {
      input.logger.warn('[CRON_JOB] Falha ao liberar lease', {
        job_name: input.jobName,
        scope_key: input.scopeKey,
        error_code: normalizeErrorCode(releaseError),
      });
    }
  }
}

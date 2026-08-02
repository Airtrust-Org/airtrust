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

export interface CronJobLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
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

export async function runCronJobWithLease(input: {
  db: D1Database;
  jobName: string;
  scopeKey: string;
  logger: CronJobLogger;
  execute: (context: CronJobExecutionContext) => Promise<CronJobExecutionResult>;
  ttlSeconds?: number;
  budgetMs?: number;
  metadata?: Record<string, unknown> | null;
}): Promise<CronJobRunSummary> {
  const ttlSeconds = Math.max(30, Math.min(3600, Math.trunc(input.ttlSeconds ?? 180)));
  const budgetMs = Math.max(1000, Math.min(10 * 60_000, Math.trunc(input.budgetMs ?? 25_000)));
  const owner = createCronLeaseOwner(input.jobName);
  const startedAt = Date.now();

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
      hasBudget: (reserveMs = 750) => Date.now() + Math.max(0, reserveMs) < startedAt + budgetMs,
      heartbeat: async () => {
        const renewed = await heartbeatCronJobLease(input.db, {
          jobName: input.jobName,
          scopeKey: input.scopeKey,
          owner,
          ttlSeconds,
        });
        if (!renewed) throw new Error('CRON_LEASE_LOST');
      },
      checkpoint: async (checkpoint) => {
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

    await context.checkpoint({
      cursorValue: result.cursorAfter ?? state?.cursor_value ?? null,
      watermarkFrom: result.watermarkFrom ?? state?.watermark_from ?? null,
      watermarkTo: result.watermarkTo ?? state?.watermark_to ?? null,
      metadata: result.metadata,
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
        metadata: result.metadata,
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
      metadata: result.metadata,
    });

    input.logger.log('[CRON_JOB] Execução concluída', {
      correlation_id: runId,
      job_name: input.jobName,
      scope_key: input.scopeKey,
      duration_ms: Date.now() - startedAt,
      outcome: result.outcome,
      processed_count: processedCount,
      failed_count: failedCount,
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
        metadata: input.metadata,
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

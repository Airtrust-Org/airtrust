export type CronJobOutcome = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED_LEASE';

export interface CronJobStateRow {
  job_name: string;
  scope_key: string;
  cursor_value: string | null;
  watermark_from: string | null;
  watermark_to: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_started_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  consecutive_failures: number;
  processed_total: number;
  failed_total: number;
  metadata_json: string | null;
}

export interface CronJobItemRow {
  job_name: string;
  scope_key: string;
  item_key: string;
  stage: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  payload_json: string | null;
  available_at: string;
  last_error_code: string | null;
  last_error_message: string | null;
}

export interface CronJobLeaseInput {
  jobName: string;
  scopeKey: string;
  owner: string;
  ttlSeconds: number;
}

export interface CronJobCheckpointInput {
  jobName: string;
  scopeKey: string;
  owner: string;
  cursorValue: string | null;
  watermarkFrom?: string | null;
  watermarkTo?: string | null;
  metadata?: Record<string, unknown> | null;
  processedDelta?: number;
  failedDelta?: number;
}

function boundedPositiveInteger(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

function serializeMetadata(value: Record<string, unknown> | null | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

function sanitizeErrorMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

export function buildCronScopeKey(empresaId?: number | null): string {
  return empresaId != null && Number.isFinite(Number(empresaId)) && Number(empresaId) > 0
    ? `empresa:${Number(empresaId)}`
    : 'global';
}

export function createCronLeaseOwner(jobName: string): string {
  const normalizedJob = jobName.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
  return `${normalizedJob}:${crypto.randomUUID()}`;
}

export async function getCronJobState(
  db: D1Database,
  jobName: string,
  scopeKey: string,
): Promise<CronJobStateRow | null> {
  return db
    .prepare(
      `SELECT job_name,
              scope_key,
              cursor_value,
              watermark_from,
              watermark_to,
              lease_owner,
              lease_expires_at,
              last_started_at,
              last_success_at,
              last_error_at,
              last_error_code,
              consecutive_failures,
              processed_total,
              failed_total,
              metadata_json
         FROM cron_job_state
        WHERE job_name = ? AND scope_key = ?
        LIMIT 1`,
    )
    .bind(jobName, scopeKey)
    .first<CronJobStateRow>();
}

export async function acquireCronJobLease(
  db: D1Database,
  input: CronJobLeaseInput,
): Promise<boolean> {
  const ttlSeconds = boundedPositiveInteger(input.ttlSeconds, 120, 3600);

  await db
    .prepare(
      `INSERT OR IGNORE INTO cron_job_state (
         job_name, scope_key, created_at, updated_at
       ) VALUES (?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(input.jobName, input.scopeKey)
    .run();

  const acquired = await db
    .prepare(
      `UPDATE cron_job_state
          SET lease_owner = ?,
              lease_expires_at = datetime('now', ?),
              last_started_at = datetime('now'),
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND (
            lease_owner IS NULL
            OR datetime(lease_expires_at) <= datetime('now')
            OR lease_owner = ?
          )`,
    )
    .bind(input.owner, `+${ttlSeconds} seconds`, input.jobName, input.scopeKey, input.owner)
    .run();

  return Number(acquired.meta.changes || 0) === 1;
}

export async function heartbeatCronJobLease(
  db: D1Database,
  input: CronJobLeaseInput,
): Promise<boolean> {
  const ttlSeconds = boundedPositiveInteger(input.ttlSeconds, 120, 3600);
  const updated = await db
    .prepare(
      `UPDATE cron_job_state
          SET lease_expires_at = datetime('now', ?),
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND lease_owner = ?
          AND datetime(lease_expires_at) > datetime('now')`,
    )
    .bind(`+${ttlSeconds} seconds`, input.jobName, input.scopeKey, input.owner)
    .run();

  return Number(updated.meta.changes || 0) === 1;
}

export async function releaseCronJobLease(
  db: D1Database,
  input: Pick<CronJobLeaseInput, 'jobName' | 'scopeKey' | 'owner'>,
): Promise<boolean> {
  const released = await db
    .prepare(
      `UPDATE cron_job_state
          SET lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND lease_owner = ?`,
    )
    .bind(input.jobName, input.scopeKey, input.owner)
    .run();

  return Number(released.meta.changes || 0) === 1;
}

export async function updateCronJobCheckpoint(
  db: D1Database,
  input: CronJobCheckpointInput,
): Promise<boolean> {
  const updated = await db
    .prepare(
      `UPDATE cron_job_state
          SET cursor_value = ?,
              watermark_from = ?,
              watermark_to = ?,
              metadata_json = ?,
              processed_total = processed_total + ?,
              failed_total = failed_total + ?,
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND lease_owner = ?
          AND datetime(lease_expires_at) > datetime('now')`,
    )
    .bind(
      input.cursorValue,
      input.watermarkFrom ?? null,
      input.watermarkTo ?? null,
      serializeMetadata(input.metadata),
      Math.max(0, Math.trunc(input.processedDelta ?? 0)),
      Math.max(0, Math.trunc(input.failedDelta ?? 0)),
      input.jobName,
      input.scopeKey,
      input.owner,
    )
    .run();

  return Number(updated.meta.changes || 0) === 1;
}

export async function markCronJobSuccess(
  db: D1Database,
  input: Pick<CronJobLeaseInput, 'jobName' | 'scopeKey' | 'owner'> & {
    cursorValue?: string | null;
    watermarkFrom?: string | null;
    watermarkTo?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const updated = await db
    .prepare(
      `UPDATE cron_job_state
          SET cursor_value = ?,
              watermark_from = ?,
              watermark_to = ?,
              metadata_json = ?,
              last_success_at = datetime('now'),
              last_error_code = NULL,
              consecutive_failures = 0,
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND lease_owner = ?`,
    )
    .bind(
      input.cursorValue ?? null,
      input.watermarkFrom ?? null,
      input.watermarkTo ?? null,
      serializeMetadata(input.metadata),
      input.jobName,
      input.scopeKey,
      input.owner,
    )
    .run();

  return Number(updated.meta.changes || 0) === 1;
}

export async function markCronJobFailure(
  db: D1Database,
  input: Pick<CronJobLeaseInput, 'jobName' | 'scopeKey' | 'owner'> & {
    errorCode: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const updated = await db
    .prepare(
      `UPDATE cron_job_state
          SET last_error_at = datetime('now'),
              last_error_code = ?,
              consecutive_failures = consecutive_failures + 1,
              metadata_json = ?,
              failed_total = failed_total + 1,
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND lease_owner = ?`,
    )
    .bind(
      input.errorCode.slice(0, 120),
      serializeMetadata(input.metadata),
      input.jobName,
      input.scopeKey,
      input.owner,
    )
    .run();

  return Number(updated.meta.changes || 0) === 1;
}

export async function startCronJobRun(
  db: D1Database,
  input: {
    runId: string;
    jobName: string;
    scopeKey: string;
    owner: string;
    cursorBefore?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cron_job_runs (
         id, job_name, scope_key, lease_owner, outcome, started_at,
         cursor_before, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'RUNNING', datetime('now'), ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      input.runId,
      input.jobName,
      input.scopeKey,
      input.owner,
      input.cursorBefore ?? null,
      serializeMetadata(input.metadata),
    )
    .run();
}

export async function finishCronJobRun(
  db: D1Database,
  input: {
    runId: string;
    outcome: Exclude<CronJobOutcome, 'RUNNING'>;
    durationMs: number;
    processedCount?: number;
    failedCount?: number;
    cursorAfter?: string | null;
    errorCode?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE cron_job_runs
          SET outcome = ?,
              finished_at = datetime('now'),
              duration_ms = ?,
              processed_count = ?,
              failed_count = ?,
              cursor_after = ?,
              error_code = ?,
              metadata_json = ?,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      input.outcome,
      Math.max(0, Math.trunc(input.durationMs)),
      Math.max(0, Math.trunc(input.processedCount ?? 0)),
      Math.max(0, Math.trunc(input.failedCount ?? 0)),
      input.cursorAfter ?? null,
      input.errorCode?.slice(0, 120) ?? null,
      serializeMetadata(input.metadata),
      input.runId,
    )
    .run();
}

export async function enqueueCronJobItem(
  db: D1Database,
  input: {
    jobName: string;
    scopeKey: string;
    itemKey: string;
    stage?: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cron_job_items (
         job_name, scope_key, item_key, stage, status, attempts,
         payload_json, available_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'PENDING', 0, ?, datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(job_name, scope_key, item_key) DO UPDATE SET
         stage = excluded.stage,
         payload_json = excluded.payload_json,
         status = CASE
           WHEN cron_job_items.status = 'SUCCEEDED' THEN 'SUCCEEDED'
           ELSE 'PENDING'
         END,
         available_at = CASE
           WHEN cron_job_items.status = 'SUCCEEDED' THEN cron_job_items.available_at
           ELSE datetime('now')
         END,
         last_error_code = CASE
           WHEN cron_job_items.status = 'SUCCEEDED' THEN cron_job_items.last_error_code
           ELSE NULL
         END,
         last_error_message = CASE
           WHEN cron_job_items.status = 'SUCCEEDED' THEN cron_job_items.last_error_message
           ELSE NULL
         END,
         updated_at = datetime('now')`,
    )
    .bind(
      input.jobName,
      input.scopeKey,
      input.itemKey,
      (input.stage ?? 'PENDING').slice(0, 80),
      serializeMetadata(input.payload),
    )
    .run();
}

export async function listRunnableCronJobItems(
  db: D1Database,
  input: { jobName: string; scopeKey: string; limit: number },
): Promise<CronJobItemRow[]> {
  const limit = boundedPositiveInteger(input.limit, 50, 500);
  const rows = await db
    .prepare(
      `SELECT job_name,
              scope_key,
              item_key,
              stage,
              status,
              attempts,
              payload_json,
              available_at,
              last_error_code,
              last_error_message
         FROM cron_job_items
        WHERE job_name = ?
          AND scope_key = ?
          AND status IN ('PENDING', 'FAILED')
          AND datetime(available_at) <= datetime('now')
        ORDER BY item_key ASC
        LIMIT ?`,
    )
    .bind(input.jobName, input.scopeKey, limit)
    .all<CronJobItemRow>();

  return rows.results || [];
}

export async function markCronJobItemProcessing(
  db: D1Database,
  input: { jobName: string; scopeKey: string; itemKey: string; stage: string },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'PROCESSING',
              stage = ?,
              attempts = attempts + 1,
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND item_key = ?
          AND status IN ('PENDING', 'FAILED')`,
    )
    .bind(input.stage.slice(0, 80), input.jobName, input.scopeKey, input.itemKey)
    .run();

  return Number(result.meta.changes || 0) === 1;
}

export async function markCronJobItemSucceeded(
  db: D1Database,
  input: { jobName: string; scopeKey: string; itemKey: string; stage?: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'SUCCEEDED',
              stage = ?,
              last_error_code = NULL,
              last_error_message = NULL,
              completed_at = datetime('now'),
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND item_key = ?`,
    )
    .bind((input.stage ?? 'COMPLETED').slice(0, 80), input.jobName, input.scopeKey, input.itemKey)
    .run();
}

export async function markCronJobItemFailed(
  db: D1Database,
  input: {
    jobName: string;
    scopeKey: string;
    itemKey: string;
    stage: string;
    errorCode: string;
    errorMessage?: string | null;
    retryDelaySeconds?: number;
  },
): Promise<void> {
  const retryDelay = boundedPositiveInteger(input.retryDelaySeconds ?? 300, 300, 86400);
  await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'FAILED',
              stage = ?,
              last_error_code = ?,
              last_error_message = ?,
              available_at = datetime('now', ?),
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND item_key = ?`,
    )
    .bind(
      input.stage.slice(0, 80),
      input.errorCode.slice(0, 120),
      sanitizeErrorMessage(input.errorMessage),
      `+${retryDelay} seconds`,
      input.jobName,
      input.scopeKey,
      input.itemKey,
    )
    .run();
}

export async function recoverStaleCronJobItems(
  db: D1Database,
  input: { jobName: string; scopeKey: string; staleMinutes?: number },
): Promise<number> {
  const staleMinutes = boundedPositiveInteger(input.staleMinutes ?? 30, 30, 1440);
  const result = await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'FAILED',
              stage = 'RECOVERED_AFTER_TIMEOUT',
              last_error_code = COALESCE(last_error_code, 'JOB_ITEM_TIMEOUT'),
              last_error_message = COALESCE(last_error_message, 'Item interrompido antes da conclusão.'),
              available_at = datetime('now'),
              updated_at = datetime('now')
        WHERE job_name = ?
          AND scope_key = ?
          AND status = 'PROCESSING'
          AND datetime(updated_at) <= datetime('now', ?)`,
    )
    .bind(input.jobName, input.scopeKey, `-${staleMinutes} minutes`)
    .run();

  return Number(result.meta.changes || 0);
}

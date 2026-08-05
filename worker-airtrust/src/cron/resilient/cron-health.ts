import type { CronJobLogger } from './job-runner';

export const CRON_HEALTH_STATE_LIMIT = 250;
export const CRON_HEALTH_BACKLOG_THRESHOLD = 500;
export const CRON_HEALTH_FAILURE_THRESHOLD = 3;
export const CRON_HEALTH_RETRY_THRESHOLD = 5;
export const CRON_HEALTH_RUNNING_STALE_MINUTES = 20;

interface CronHealthRow {
  job_name: string;
  scope_key: string;
  last_started_at: string | null;
  last_success_at: string | null;
  updated_at: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  pending_items: number;
  exhausted_items: number;
  latest_outcome: string | null;
  latest_started_at: string | null;
  latest_cursor: string | null;
  previous_cursor: string | null;
  latest_processed: number;
  previous_processed: number;
}

export interface CronHealthSnapshot {
  checkedScopes: number;
  repeatedFailureScopes: number;
  expiredLeaseScopes: number;
  backlogScopes: number;
  exhaustedItemScopes: number;
  delayedScopes: number;
  stalledCursorScopes: number;
  staleRunningScopes: number;
  tenantErrorScopes: number;
  pendingItems: number;
  exhaustedItems: number;
  affectedScopes: Array<{
    job_name: string;
    scope_key: string;
    error_code: string | null;
    signals: string[];
  }>;
}

export function buildCronHealthQuery(): string {
  return `WITH ranked_runs AS (
            SELECT
              r.job_name,
              r.scope_key,
              r.outcome,
              r.started_at,
              r.cursor_after,
              r.processed_count,
              ROW_NUMBER() OVER (
                PARTITION BY r.job_name, r.scope_key
                ORDER BY datetime(r.started_at) DESC, r.id DESC
              ) AS rn
            FROM cron_job_runs r
            WHERE r.job_name IN (
              'lms-reminders',
              'ead-renewal',
              'sigvoos-dispatch',
              'sigvoos-ingest',
              'frms-reprocess',
              'domain-events-dispatch'
            )
          ), run_progress AS (
            SELECT
              job_name,
              scope_key,
              MAX(CASE WHEN rn = 1 THEN outcome END) AS latest_outcome,
              MAX(CASE WHEN rn = 1 THEN started_at END) AS latest_started_at,
              MAX(CASE WHEN rn = 1 THEN cursor_after END) AS latest_cursor,
              MAX(CASE WHEN rn = 2 THEN cursor_after END) AS previous_cursor,
              MAX(CASE WHEN rn = 1 THEN processed_count ELSE 0 END) AS latest_processed,
              MAX(CASE WHEN rn = 2 THEN processed_count ELSE 0 END) AS previous_processed
            FROM ranked_runs
            WHERE rn <= 2
            GROUP BY job_name, scope_key
          )
          SELECT
            s.job_name,
            s.scope_key,
            s.last_started_at,
            s.last_success_at,
            s.updated_at,
            s.consecutive_failures,
            s.last_error_code,
            s.lease_owner,
            s.lease_expires_at,
            COALESCE(SUM(CASE WHEN i.status != 'SUCCEEDED' THEN 1 ELSE 0 END), 0) AS pending_items,
            COALESCE(SUM(CASE WHEN i.status = 'FAILED' AND i.attempts >= ? THEN 1 ELSE 0 END), 0) AS exhausted_items,
            p.latest_outcome,
            p.latest_started_at,
            p.latest_cursor,
            p.previous_cursor,
            COALESCE(p.latest_processed, 0) AS latest_processed,
            COALESCE(p.previous_processed, 0) AS previous_processed
          FROM cron_job_state s
          LEFT JOIN cron_job_items i
            ON i.job_name = s.job_name
           AND i.scope_key = s.scope_key
          LEFT JOIN run_progress p
            ON p.job_name = s.job_name
           AND p.scope_key = s.scope_key
         WHERE s.job_name IN (
           'lms-reminders',
           'ead-renewal',
           'sigvoos-dispatch',
           'sigvoos-ingest',
           'frms-reprocess',
           'domain-events-dispatch'
         )
         GROUP BY
           s.job_name,
           s.scope_key,
           s.last_started_at,
           s.last_success_at,
           s.updated_at,
           s.consecutive_failures,
           s.last_error_code,
           s.lease_owner,
           s.lease_expires_at,
           p.latest_outcome,
           p.latest_started_at,
           p.latest_cursor,
           p.previous_cursor,
           p.latest_processed,
           p.previous_processed
         ORDER BY s.job_name ASC, s.scope_key ASC
         LIMIT ?`;
}

function ageMinutes(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 60_000);
}

export function expectedJobIntervalMinutes(jobName: string, pendingItems: number): number {
  if (jobName === 'lms-reminders') return 36 * 60;
  if (jobName === 'sigvoos-ingest') return pendingItems > 0 ? 30 : 36 * 60;
  if (jobName === 'frms-reprocess') return pendingItems > 0 ? 30 : 36 * 60;
  return 30;
}

export async function collectCronHealthSnapshot(
  db: D1Database,
  now = new Date(),
): Promise<CronHealthSnapshot> {
  const result = await db
    .prepare(buildCronHealthQuery())
    .bind(CRON_HEALTH_RETRY_THRESHOLD, CRON_HEALTH_STATE_LIMIT)
    .all<CronHealthRow>();
  const rows = result.results || [];
  const nowIso = now.toISOString();

  let repeatedFailureScopes = 0;
  let expiredLeaseScopes = 0;
  let backlogScopes = 0;
  let exhaustedItemScopes = 0;
  let delayedScopes = 0;
  let stalledCursorScopes = 0;
  let staleRunningScopes = 0;
  let tenantErrorScopes = 0;
  let pendingItems = 0;
  let exhaustedItems = 0;
  const affectedScopes: CronHealthSnapshot['affectedScopes'] = [];

  for (const row of rows) {
    const pending = Math.max(0, Number(row.pending_items || 0));
    const exhausted = Math.max(0, Number(row.exhausted_items || 0));
    const repeatedFailure = Number(row.consecutive_failures || 0) >= CRON_HEALTH_FAILURE_THRESHOLD;
    const expiredLease = Boolean(
      row.lease_owner && row.lease_expires_at && row.lease_expires_at <= nowIso,
    );
    const backlog = pending >= CRON_HEALTH_BACKLOG_THRESHOLD;
    const hasExhaustedItems = exhausted > 0;
    const lastActivityAge = ageMinutes(row.last_started_at || row.updated_at, now);
    const delayed =
      lastActivityAge !== null &&
      lastActivityAge > expectedJobIntervalMinutes(row.job_name, pending);
    const staleRunning =
      row.latest_outcome === 'RUNNING' &&
      (ageMinutes(row.latest_started_at, now) ?? 0) >= CRON_HEALTH_RUNNING_STALE_MINUTES;
    const stalledCursor =
      pending > 0 &&
      row.latest_outcome === 'PARTIAL' &&
      row.latest_cursor === row.previous_cursor &&
      Number(row.latest_processed || 0) === 0 &&
      Number(row.previous_processed || 0) === 0;
    const tenantError = row.scope_key.startsWith('empresa:') && repeatedFailure;

    pendingItems += pending;
    exhaustedItems += exhausted;
    if (repeatedFailure) repeatedFailureScopes++;
    if (expiredLease) expiredLeaseScopes++;
    if (backlog) backlogScopes++;
    if (hasExhaustedItems) exhaustedItemScopes++;
    if (delayed) delayedScopes++;
    if (stalledCursor) stalledCursorScopes++;
    if (staleRunning) staleRunningScopes++;
    if (tenantError) tenantErrorScopes++;

    const signals = [
      repeatedFailure ? 'REPEATED_FAILURE' : null,
      expiredLease ? 'EXPIRED_LEASE' : null,
      backlog ? 'BACKLOG' : null,
      hasExhaustedItems ? 'RETRY_EXHAUSTED' : null,
      delayed ? 'JOB_DELAYED' : null,
      stalledCursor ? 'CURSOR_STALLED' : null,
      staleRunning ? 'RUN_STALE' : null,
      tenantError ? 'TENANT_NOT_PROGRESSING' : null,
    ].filter((value): value is string => Boolean(value));

    if (affectedScopes.length < 30 && signals.length > 0) {
      affectedScopes.push({
        job_name: row.job_name,
        scope_key: row.scope_key,
        error_code: row.last_error_code,
        signals,
      });
    }
  }

  return {
    checkedScopes: rows.length,
    repeatedFailureScopes,
    expiredLeaseScopes,
    backlogScopes,
    exhaustedItemScopes,
    delayedScopes,
    stalledCursorScopes,
    staleRunningScopes,
    tenantErrorScopes,
    pendingItems,
    exhaustedItems,
    affectedScopes,
  };
}

export async function logCronHealthSnapshot(
  db: D1Database,
  logger: CronJobLogger,
  now = new Date(),
): Promise<CronHealthSnapshot> {
  const snapshot = await collectCronHealthSnapshot(db, now);
  const degraded =
    snapshot.repeatedFailureScopes > 0 ||
    snapshot.expiredLeaseScopes > 0 ||
    snapshot.backlogScopes > 0 ||
    snapshot.exhaustedItemScopes > 0 ||
    snapshot.delayedScopes > 0 ||
    snapshot.stalledCursorScopes > 0 ||
    snapshot.staleRunningScopes > 0 ||
    snapshot.tenantErrorScopes > 0;

  const metadata = {
    checked_scopes: snapshot.checkedScopes,
    repeated_failure_scopes: snapshot.repeatedFailureScopes,
    expired_lease_scopes: snapshot.expiredLeaseScopes,
    backlog_scopes: snapshot.backlogScopes,
    exhausted_item_scopes: snapshot.exhaustedItemScopes,
    delayed_scopes: snapshot.delayedScopes,
    stalled_cursor_scopes: snapshot.stalledCursorScopes,
    stale_running_scopes: snapshot.staleRunningScopes,
    tenant_error_scopes: snapshot.tenantErrorScopes,
    pending_items: snapshot.pendingItems,
    exhausted_items: snapshot.exhaustedItems,
    affected_scopes: snapshot.affectedScopes,
  };

  if (degraded) {
    logger.warn('[CRON_HEALTH] Degradação operacional detectada', metadata);
  } else {
    logger.log('[CRON_HEALTH] Snapshot saudável', metadata);
  }

  return snapshot;
}

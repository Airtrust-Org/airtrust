import type { CronJobLogger } from './job-runner';

export const CRON_HEALTH_STATE_LIMIT = 200;
export const CRON_HEALTH_BACKLOG_THRESHOLD = 500;
export const CRON_HEALTH_FAILURE_THRESHOLD = 3;
export const CRON_HEALTH_RETRY_THRESHOLD = 5;

interface CronHealthRow {
  job_name: string;
  scope_key: string;
  consecutive_failures: number;
  last_error_code: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  pending_items: number;
  exhausted_items: number;
}

export interface CronHealthSnapshot {
  checkedScopes: number;
  repeatedFailureScopes: number;
  expiredLeaseScopes: number;
  backlogScopes: number;
  exhaustedItemScopes: number;
  pendingItems: number;
  exhaustedItems: number;
  affectedScopes: Array<{
    job_name: string;
    scope_key: string;
    error_code: string | null;
  }>;
}

export function buildCronHealthQuery(): string {
  return `SELECT
            s.job_name,
            s.scope_key,
            s.consecutive_failures,
            s.last_error_code,
            s.lease_owner,
            s.lease_expires_at,
            COALESCE(SUM(CASE WHEN i.status != 'SUCCEEDED' THEN 1 ELSE 0 END), 0) AS pending_items,
            COALESCE(SUM(CASE WHEN i.status = 'FAILED' AND i.attempts >= ? THEN 1 ELSE 0 END), 0) AS exhausted_items
          FROM cron_job_state s
          LEFT JOIN cron_job_items i
            ON i.job_name = s.job_name
           AND i.scope_key = s.scope_key
         WHERE s.job_name IN (
           'lms-reminders',
           'ead-renewal',
           'sigvoos-dispatch',
           'sigvoos-ingest',
           'frms-reprocess'
         )
         GROUP BY
           s.job_name,
           s.scope_key,
           s.consecutive_failures,
           s.last_error_code,
           s.lease_owner,
           s.lease_expires_at
         ORDER BY s.job_name ASC, s.scope_key ASC
         LIMIT ?`;
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

    pendingItems += pending;
    exhaustedItems += exhausted;
    if (repeatedFailure) repeatedFailureScopes++;
    if (expiredLease) expiredLeaseScopes++;
    if (backlog) backlogScopes++;
    if (hasExhaustedItems) exhaustedItemScopes++;

    if (
      affectedScopes.length < 20 &&
      (repeatedFailure || expiredLease || backlog || hasExhaustedItems)
    ) {
      affectedScopes.push({
        job_name: row.job_name,
        scope_key: row.scope_key,
        error_code: row.last_error_code,
      });
    }
  }

  return {
    checkedScopes: rows.length,
    repeatedFailureScopes,
    expiredLeaseScopes,
    backlogScopes,
    exhaustedItemScopes,
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
    snapshot.exhaustedItemScopes > 0;

  const metadata = {
    checked_scopes: snapshot.checkedScopes,
    repeated_failure_scopes: snapshot.repeatedFailureScopes,
    expired_lease_scopes: snapshot.expiredLeaseScopes,
    backlog_scopes: snapshot.backlogScopes,
    exhausted_item_scopes: snapshot.exhaustedItemScopes,
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

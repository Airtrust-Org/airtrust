export interface OperationalStatusOptions {
  platformAdmin: boolean;
  empresaId: number;
  limit?: number;
}

type StatusRow = {
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
  pending_items: number;
  failed_items: number;
  last_outcome: string | null;
  last_duration_ms: number | null;
  last_processed_count: number | null;
  last_failed_count: number | null;
};

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(Number(value))) return 100;
  return Math.max(1, Math.min(250, Math.trunc(Number(value))));
}

export function buildGlobalOperationalStatusQuery(): string {
  return `SELECT
            s.job_name,
            s.scope_key,
            s.cursor_value,
            s.watermark_from,
            s.watermark_to,
            s.lease_owner,
            s.lease_expires_at,
            s.last_started_at,
            s.last_success_at,
            s.last_error_at,
            s.last_error_code,
            s.consecutive_failures,
            s.processed_total,
            s.failed_total,
            COALESCE(SUM(CASE WHEN i.status != 'SUCCEEDED' THEN 1 ELSE 0 END), 0) AS pending_items,
            COALESCE(SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed_items,
            (SELECT r.outcome FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_outcome,
            (SELECT r.duration_ms FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_duration_ms,
            (SELECT r.processed_count FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_processed_count,
            (SELECT r.failed_count FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_failed_count
          FROM cron_job_state s
          LEFT JOIN cron_job_items i
            ON i.job_name = s.job_name AND i.scope_key = s.scope_key
          GROUP BY s.job_name, s.scope_key
          ORDER BY s.job_name ASC, s.scope_key ASC
          LIMIT ?`;
}

export function buildTenantOperationalStatusQuery(): string {
  return `SELECT
            s.job_name,
            s.scope_key,
            s.cursor_value,
            s.watermark_from,
            s.watermark_to,
            s.lease_owner,
            s.lease_expires_at,
            s.last_started_at,
            s.last_success_at,
            s.last_error_at,
            s.last_error_code,
            s.consecutive_failures,
            s.processed_total,
            s.failed_total,
            COALESCE(SUM(CASE WHEN i.status != 'SUCCEEDED' THEN 1 ELSE 0 END), 0) AS pending_items,
            COALESCE(SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed_items,
            (SELECT r.outcome FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_outcome,
            (SELECT r.duration_ms FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_duration_ms,
            (SELECT r.processed_count FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_processed_count,
            (SELECT r.failed_count FROM cron_job_runs r
              WHERE r.job_name = s.job_name AND r.scope_key = s.scope_key
              ORDER BY datetime(r.started_at) DESC, r.id DESC LIMIT 1) AS last_failed_count
          FROM cron_job_state s
          LEFT JOIN cron_job_items i
            ON i.job_name = s.job_name AND i.scope_key = s.scope_key
          WHERE s.scope_key = ?
          GROUP BY s.job_name, s.scope_key
          ORDER BY s.job_name ASC
          LIMIT ?`;
}

export function buildTenantGlobalItemStatusQuery(): string {
  return `SELECT
            i.job_name,
            'tenant-items' AS scope_key,
            NULL AS cursor_value,
            NULL AS watermark_from,
            NULL AS watermark_to,
            NULL AS lease_owner,
            NULL AS lease_expires_at,
            MIN(i.created_at) AS last_started_at,
            MAX(i.completed_at) AS last_success_at,
            MAX(CASE WHEN i.status = 'FAILED' THEN i.updated_at ELSE NULL END) AS last_error_at,
            MAX(CASE WHEN i.status = 'FAILED' THEN i.last_error_code ELSE NULL END) AS last_error_code,
            SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END) AS consecutive_failures,
            SUM(CASE WHEN i.status = 'SUCCEEDED' THEN 1 ELSE 0 END) AS processed_total,
            SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END) AS failed_total,
            SUM(CASE WHEN i.status != 'SUCCEEDED' THEN 1 ELSE 0 END) AS pending_items,
            SUM(CASE WHEN i.status = 'FAILED' THEN 1 ELSE 0 END) AS failed_items,
            NULL AS last_outcome,
            NULL AS last_duration_ms,
            NULL AS last_processed_count,
            NULL AS last_failed_count
          FROM cron_job_items i
          WHERE i.scope_key = 'global'
            AND CAST(json_extract(i.payload_json, '$.empresa_id') AS INTEGER) = ?
          GROUP BY i.job_name
          ORDER BY i.job_name ASC
          LIMIT ?`;
}

function normalizeRow(row: StatusRow) {
  return {
    job: row.job_name,
    scope: row.scope_key,
    cursor: row.cursor_value,
    watermarkFrom: row.watermark_from,
    watermarkTo: row.watermark_to,
    lastExecution: row.last_started_at,
    lastSuccess: row.last_success_at,
    lastFailure: row.last_error_at,
    errorCode: row.last_error_code,
    consecutiveFailures: Number(row.consecutive_failures || 0),
    processedTotal: Number(row.processed_total || 0),
    failedTotal: Number(row.failed_total || 0),
    pendingItems: Number(row.pending_items || 0),
    failedItems: Number(row.failed_items || 0),
    lastOutcome: row.last_outcome,
    lastDurationMs: row.last_duration_ms == null ? null : Number(row.last_duration_ms),
    lastProcessed: row.last_processed_count == null ? null : Number(row.last_processed_count),
    lastFailed: row.last_failed_count == null ? null : Number(row.last_failed_count),
    lease:
      row.lease_owner && row.lease_expires_at
        ? { active: true, expiresAt: row.lease_expires_at }
        : { active: false, expiresAt: null },
  };
}

export async function getOperationalStatus(db: D1Database, options: OperationalStatusOptions) {
  const limit = boundedLimit(options.limit);
  let rows: StatusRow[] = [];

  if (options.platformAdmin) {
    const result = await db
      .prepare(buildGlobalOperationalStatusQuery())
      .bind(limit)
      .all<StatusRow>();
    rows = result.results || [];
  } else {
    const scopeKey = `empresa:${options.empresaId}`;
    const [scoped, globalItems] = await Promise.all([
      db.prepare(buildTenantOperationalStatusQuery()).bind(scopeKey, limit).all<StatusRow>(),
      db
        .prepare(buildTenantGlobalItemStatusQuery())
        .bind(options.empresaId, limit)
        .all<StatusRow>(),
    ]);
    rows = [...(scoped.results || []), ...(globalItems.results || [])];
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: options.platformAdmin ? 'platform' : `empresa:${options.empresaId}`,
    jobs: rows.map(normalizeRow),
  };
}

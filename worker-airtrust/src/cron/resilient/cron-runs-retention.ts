/**
 * P13-08: `cron_job_runs` crescia sem retencao (47 mil linhas em ~75 dias, uma
 * linha a cada execucao de cada escopo). O estado corrente dos jobs vive em
 * `cron_job_state`; as execucoes sao historico de diagnostico.
 *
 * Remove execucoes terminadas ha mais de `retentionDays`, preservando sempre a
 * execucao mais recente (por `started_at`, nunca por `id`: o `id` e um UUID
 * TEXT sem ordem cronologica) de cada (job_name, scope_key) para nao perder a
 * ultima evidencia de escopos que rodam raramente. Lotes limitados para nao criar uma
 * transacao longa no D1; o proximo tick diario continua de onde parou.
 */
export const CRON_RUNS_RETENTION_DAYS = 60;
export const CRON_RUNS_PURGE_BATCH = 5000;

/**
 * Use the production 0451 lookup index for each scope, not a scan of every
 * historical run per candidate. The extra range predicate is implied by the
 * existing strict-newer comparison and therefore cannot change which UUID
 * is preserved. id is only a tie-breaker within equal started_at values.
 */
export const CRON_RUNS_PURGE_SQL = `DELETE FROM cron_job_runs
       WHERE id IN (
         SELECT r.id
           FROM cron_job_runs r
          WHERE r.finished_at IS NOT NULL
            AND datetime(r.finished_at) < datetime('now', ?)
            AND EXISTS (
              SELECT 1 FROM cron_job_runs n INDEXED BY idx_cron_job_runs_lookup
               WHERE n.job_name = r.job_name
                 AND n.scope_key = r.scope_key
                 AND n.started_at >= r.started_at
                 AND (n.started_at > r.started_at
                      OR (n.started_at = r.started_at AND n.id > r.id))
            )
          ORDER BY r.started_at, r.id
          LIMIT ?
       )`;

export async function purgeOldCronJobRuns(
  db: D1Database,
  retentionDays: number = CRON_RUNS_RETENTION_DAYS,
  batchSize: number = CRON_RUNS_PURGE_BATCH,
): Promise<number> {
  const days = Math.max(7, Math.floor(retentionDays));
  const limit = Math.max(1, Math.floor(batchSize));
  const result = await db
    .prepare(CRON_RUNS_PURGE_SQL)
    .bind(`-${days} days`, limit)
    .run();
  return Number(result.meta?.changes ?? 0);
}

/**
 * P13-08: `cron_job_runs` crescia sem retencao (47 mil linhas em ~75 dias, uma
 * linha a cada execucao de cada escopo). O estado corrente dos jobs vive em
 * `cron_job_state`; as execucoes sao historico de diagnostico.
 *
 * Remove execucoes terminadas ha mais de `retentionDays`, preservando sempre a
 * execucao mais recente de cada (job_name, scope_key) para nao perder a ultima
 * evidencia de escopos que rodam raramente. Lotes limitados para nao criar uma
 * transacao longa no D1; o proximo tick diario continua de onde parou.
 */
export const CRON_RUNS_RETENTION_DAYS = 60;
export const CRON_RUNS_PURGE_BATCH = 5000;

export async function purgeOldCronJobRuns(
  db: D1Database,
  retentionDays: number = CRON_RUNS_RETENTION_DAYS,
  batchSize: number = CRON_RUNS_PURGE_BATCH,
): Promise<number> {
  const days = Math.max(7, Math.floor(retentionDays));
  const limit = Math.max(1, Math.floor(batchSize));
  const result = await db
    .prepare(
      `DELETE FROM cron_job_runs
       WHERE id IN (
         SELECT r.id
           FROM cron_job_runs r
          WHERE r.finished_at IS NOT NULL
            AND datetime(r.finished_at) < datetime('now', ?)
            AND r.id NOT IN (
              SELECT MAX(l.id) FROM cron_job_runs l GROUP BY l.job_name, l.scope_key
            )
          ORDER BY r.id
          LIMIT ?
       )`,
    )
    .bind(`-${days} days`, limit)
    .run();
  return Number(result.meta?.changes ?? 0);
}

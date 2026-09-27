import { buildCronScopeKey, enqueueCronJobItem } from '../cron/job-state';

const FRMS_REPROCESS_JOB = 'frms-reprocess';
const ENQUEUE_BATCH = 100;

export interface FrmsReprocessEnqueueResult {
  empresaId: number;
  periodFrom: string;
  periodTo: string;
  enqueued: number;
}

function assertIsoDate(value: string, name: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name}_INVALID`);
}

export async function enqueueFrmsReprocessForSigvoosWindow(
  db: D1Database,
  input: { empresaId: number; periodFrom: string; periodTo: string; operationKey: string },
): Promise<FrmsReprocessEnqueueResult> {
  if (!Number.isInteger(input.empresaId) || input.empresaId <= 0) throw new Error('INVALID_TENANT');
  assertIsoDate(input.periodFrom, 'PERIOD_FROM');
  assertIsoDate(input.periodTo, 'PERIOD_TO');
  if (input.periodFrom > input.periodTo) throw new Error('INVALID_PERIOD');
  const scopeKey = buildCronScopeKey(input.empresaId);
  const operationKey = input.operationKey.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 100);
  let cursor = 0;
  let enqueued = 0;

  for (;;) {
    const rows = await db.prepare(
      `SELECT DISTINCT CAST(j.tripulante_id AS INTEGER) AS tripulante_id
         FROM frms_jornada j
         JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
        WHERE j.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND f.empresa_id = ?
          AND j.data BETWEEN ? AND ?
          AND UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'
          AND CAST(j.tripulante_id AS INTEGER) > ?
        ORDER BY CAST(j.tripulante_id AS INTEGER) ASC
        LIMIT ?`,
    ).bind(input.empresaId, input.periodFrom, input.periodTo, cursor, ENQUEUE_BATCH)
      .all<{ tripulante_id: number }>();
    const crew = rows.results ?? [];
    for (const row of crew) {
      const tripulanteId = Number(row.tripulante_id);
      if (!Number.isInteger(tripulanteId) || tripulanteId <= 0) continue;
      await enqueueCronJobItem(db, {
        jobName: FRMS_REPROCESS_JOB,
        scopeKey,
        itemKey: `manual:${operationKey}:${input.periodFrom}:${input.periodTo}:${tripulanteId}`,
        stage: 'FRMS_REPROCESS_PENDING',
        payload: {
          empresa_id: input.empresaId,
          tripulante_id: tripulanteId,
          period_from: input.periodFrom,
          period_to: input.periodTo,
          trigger: 'manual_sigvoos_sync',
        },
      });
      enqueued += 1;
    }

    if (crew.length < ENQUEUE_BATCH) break;
    cursor = Number(crew.at(-1)?.tripulante_id ?? cursor);
  }

  return { empresaId: input.empresaId, periodFrom: input.periodFrom, periodTo: input.periodTo, enqueued };
}

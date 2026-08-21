/** Governed, resumable FRMS recalculation executor (migration 0464). */
import type { D1Database } from '@cloudflare/workers-types';
import type { FrmsJornada, LimitesMap } from './types';
import { recalcularPipeline } from './db-service-jornadas';
import {
  asGovernedLimites,
  loadResolvedFrmsParameters,
  processRecalcRunInChunks,
  type FrmsRecalcRun,
} from './parameter-governance';

const CALCULATION_LIMIT_KEYS: readonly (keyof LimitesMap)[] = [
  'FDP_MAXIMO_HORAS', 'REPOUSO_MINIMO_HORAS', 'HV_7_DIAS_HORAS', 'HV_28_DIAS_HORAS',
  'HV_MES_HORAS', 'HV_365_DIAS_HORAS', 'HV_DIARIA_HORAS', 'ALERTA_AVISO_PCT',
  'ALERTA_ATENCAO_PCT', 'ALERTA_CRITICO_PCT', 'ALERTA_VIOLACAO_PCT',
  'EFFECTIV_VERDE_MIN', 'EFFECTIV_AMARELO_MAX', 'EFFECTIV_VERMELHO_MAX',
  'MINUTOS_ANTES_APRESENTACAO', 'HORAS_SONO_PADRAO',
];

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function parseCursor(value: string | null): { data: string; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { data?: unknown; id?: unknown };
    return typeof parsed.data === 'string' && typeof parsed.id === 'string'
      ? { data: parsed.data, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

export async function runGovernedRecalc(
  db: D1Database,
  run: FrmsRecalcRun,
  options: { chunkSize?: number } = {},
): Promise<{ status: 'COMPLETE' | 'FAILED'; processed: number; failed: number }> {
  const chunkSize = Math.max(1, Math.min(500, Math.floor(options.chunkSize ?? 100)));
  const parameterSet = await loadResolvedFrmsParameters(
    db, Number(run.empresa_id), run.profile_code, run.effective_from, CALCULATION_LIMIT_KEYS,
  );
  const limites = asGovernedLimites(parameterSet, CALCULATION_LIMIT_KEYS);
  const initialCursor = parseCursor(run.cursor_json);
  const timestamp = nowSql();
  await db.prepare(
    `UPDATE frms_recalc_runs
     SET status = 'RUNNING', started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ? AND status IN ('PENDING', 'RUNNING')`,
  ).bind(timestamp, timestamp, run.id).run();
  await db.prepare(
    `UPDATE frms_fatorizacao_jornada
     SET recalc_state = 'RECALC_PENDING', updated_at = ?
     WHERE deleted_at IS NULL AND COALESCE(config_revision_id, '') <> ?
       AND jornada_id IN (
         SELECT j.id FROM frms_jornada j JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
         WHERE f.empresa_id = ? AND j.deleted_at IS NULL AND j.data >= ?
           AND (? IS NULL OR j.data <= ?)
       )`,
  ).bind(timestamp, parameterSet.revision.id, run.empresa_id, run.effective_from, run.effective_to, run.effective_to).run();

  let first = true;
  return processRecalcRunInChunks<FrmsJornada>({
    load: async (cursor) => {
      const after = first ? initialCursor : parseCursor(cursor);
      first = false;
      const result = await db.prepare(
        `SELECT j.* FROM frms_jornada j JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
         WHERE f.empresa_id = ? AND j.deleted_at IS NULL AND j.data >= ?
           AND (? IS NULL OR j.data <= ?)
           AND (? IS NULL OR j.data > ? OR (j.data = ? AND j.id > ?))
         ORDER BY j.data ASC, j.id ASC LIMIT ?`,
      ).bind(
        run.empresa_id, run.effective_from, run.effective_to, run.effective_to,
        after?.data ?? null, after?.data ?? null, after?.data ?? null, after?.id ?? null, chunkSize,
      ).all<FrmsJornada>();
      const items = result.results ?? [];
      const last = items.at(-1);
      return { items, cursor: last ? JSON.stringify({ data: last.data, id: last.id }) : null, hasMore: items.length === chunkSize };
    },
    process: async (jornada) => {
      await recalcularPipeline(db, jornada, limites, {
        configRevisionId: parameterSet.revision.id,
        modelVersion: parameterSet.modelVersion,
      });
    },
    onProgress: async ({ processed, failed, cursor, hasMore }) => {
      const status = failed > 0 ? 'FAILED' : hasMore ? 'RUNNING' : 'COMPLETE';
      const at = nowSql();
      await db.prepare(
        `UPDATE frms_recalc_runs
         SET status = ?, processed_count = ?, failed_count = ?, cursor_json = ?,
             completed_at = CASE WHEN ? IN ('COMPLETE', 'FAILED') THEN ? ELSE completed_at END,
             updated_at = ? WHERE id = ?`,
      ).bind(status, processed, failed, cursor, status, at, at, run.id).run();
    },
  });
}

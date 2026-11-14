import type { PetrobrasRveStageRow } from './petrobras-rve-daily-export';
import { chunkByBindBudget, D1_MAX_LIST_BINDS } from '../../utils/d1-bind-chunks';

/**
 * Read all steps for a day's finalized flights using a bounded number of D1
 * round trips. Flight IDs originate from the separately tenant-scoped RDV
 * query; repeat the tenant predicate here to defend against cross-company IDs.
 *
 * No JOIN to RDV: the flight query can return repeated flight IDs and the
 * original exporter repeats the same list of stages for each such row.
 */
// Reserve one bind for empresaId; the shared D1 budget also caps IN lists at 90.
export const PETROBRAS_RVE_STAGE_READ_CHUNK = D1_MAX_LIST_BINDS;

export async function readPetrobrasStagesByFlight(
  db: D1Database,
  empresaId: number,
  flightIds: readonly number[],
): Promise<Map<number, PetrobrasRveStageRow[]>> {
  const uniqueFlightIds = [...new Set(flightIds)];
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      uniqueFlightIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('INVALID_PETROBRAS_RVE_STAGE_SCOPE');
  }

  const grouped = new Map<number, PetrobrasRveStageRow[]>(
    uniqueFlightIds.map((id) => [id, []]),
  );
  for (const chunk of chunkByBindBudget(uniqueFlightIds, 1)) {
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT voo_id, numero_etapa, origem_icao, destino_icao,
              horario_motor_ligado, horario_decolagem,
              horario_pouso, horario_motor_desligado
         FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id IN (${placeholders}) AND deleted_at IS NULL
        ORDER BY voo_id ASC, numero_etapa ASC`,
    ).bind(empresaId, ...chunk).all<PetrobrasRveStageRow & { voo_id: number }>();

    for (const { voo_id, ...stage } of results || []) {
      // The SQL scope and the map together reject unexpected result IDs.
      grouped.get(voo_id)?.push(stage);
    }
  }
  return grouped;
}

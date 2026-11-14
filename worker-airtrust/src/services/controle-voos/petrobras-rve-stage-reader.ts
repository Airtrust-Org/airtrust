import type { PetrobrasRveStageRow } from './petrobras-rve-daily-export';

/**
 * Read all steps for a day's finalized flights using a bounded number of D1
 * round trips. Flight IDs originate from the separately tenant-scoped RDV
 * query; repeat the tenant predicate here to defend against cross-company IDs.
 *
 * No JOIN to RDV: the flight query can return repeated flight IDs and the
 * original exporter repeats the same list of stages for each such row.
 */
export const PETROBRAS_RVE_STAGE_READ_CHUNK = 200;

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
  for (let offset = 0; offset < uniqueFlightIds.length; offset += PETROBRAS_RVE_STAGE_READ_CHUNK) {
    const chunk = uniqueFlightIds.slice(offset, offset + PETROBRAS_RVE_STAGE_READ_CHUNK);
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

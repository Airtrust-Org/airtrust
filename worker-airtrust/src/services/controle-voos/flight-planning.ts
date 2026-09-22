import { ApiError } from '../../middleware/error-handler';

export type FlightPlanningInput = {
  paxPlanejado: number | null;
  pesoPlanejado: number | null;
  pesoPassageiros: number | null;
  pesoBagagem: number | null;
  unidadePesoPlanejado: string;
  combustivelSolicitado: number | null;
  unidadeCombustivelSolicitado: string;
};


type AircraftBasicWeight = {
  pesoVazio: number | null;
  unidadePeso: 'KG' | 'LB' | null;
};

function convertWeight(value: number, from: 'KG' | 'LB', to: 'KG' | 'LB'): number {
  if (from === to) return value;
  const converted = from === 'KG' ? value * 2.2046226218 : value / 2.2046226218;
  return Number(converted.toFixed(3));
}

async function getAircraftBasicWeightIfSupported(
  db: D1Database,
  empresaId: number,
  aeronaveId: number | null,
): Promise<AircraftBasicWeight> {
  if (!aeronaveId) return { pesoVazio: null, unidadePeso: null };
  try {
    const row = await db
      .prepare(
        `SELECT peso_vazio, unidade_peso
           FROM aeronaves
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(aeronaveId, empresaId)
      .first<{ peso_vazio: number | null; unidade_peso: string | null }>();
    const unit = String(row?.unidade_peso || '').trim().toUpperCase();
    return {
      pesoVazio: row?.peso_vazio == null ? null : Number(row.peso_vazio),
      unidadePeso: unit === 'KG' || unit === 'LB' ? unit : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('no such column')) return { pesoVazio: null, unidadePeso: null };
    throw error;
  }
}

function parseOptionalNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function parseOptionalNonNegativeInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function normalizeOperationalUnit(
  value: unknown,
  field: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return normalized;
}

export function parseFlightPlanningInput(payload: Record<string, unknown>): FlightPlanningInput {
  return {
    paxPlanejado: parseOptionalNonNegativeInteger(payload.pax_planejado, 'pax_planejado'),
    pesoPlanejado: parseOptionalNonNegativeNumber(payload.peso_planejado, 'peso_planejado'),
    pesoPassageiros: parseOptionalNonNegativeNumber(payload.peso_passageiros, 'peso_passageiros'),
    pesoBagagem: parseOptionalNonNegativeNumber(payload.peso_bagagem, 'peso_bagagem'),
    unidadePesoPlanejado: normalizeOperationalUnit(
      payload.unidade_peso_planejado,
      'unidade_peso_planejado',
      ['KG', 'LB'],
      'KG',
    ),
    combustivelSolicitado: parseOptionalNonNegativeNumber(
      payload.combustivel_solicitado,
      'combustivel_solicitado',
    ),
    unidadeCombustivelSolicitado: normalizeOperationalUnit(
      payload.unidade_combustivel_solicitado,
      'unidade_combustivel_solicitado',
      ['KG', 'LB', 'L'],
      'KG',
    ),
  };
}

export async function applyAircraftBasicWeightToFlightStages(
  db: D1Database,
  empresaId: number,
  vooId: number,
  aeronaveId: number | null,
  unidadePesoPlanejado: string = 'LB',
): Promise<void> {
  const aircraftWeight = await getAircraftBasicWeightIfSupported(db, empresaId, aeronaveId);
  if (aircraftWeight.pesoVazio == null || !aircraftWeight.unidadePeso) return;
  const planningUnit: 'KG' | 'LB' = unidadePesoPlanejado === 'KG' ? 'KG' : 'LB';
  const pesoVazio = convertWeight(aircraftWeight.pesoVazio, aircraftWeight.unidadePeso, planningUnit);
  try {
    await db.prepare(
      `UPDATE cv_voo_etapas
          SET peso_vazio = ?, unidade_peso = ?, updated_at = datetime('now')
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    ).bind(pesoVazio, planningUnit, empresaId, vooId).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('no such column')) throw error;
  }
}

export async function updateFlightStagePlanningIfSupported(
  db: D1Database,
  empresaId: number,
  vooId: number,
  aeronaveId: number | null,
  planning: FlightPlanningInput,
): Promise<void> {
  const aircraftWeight = await getAircraftBasicWeightIfSupported(
    db,
    empresaId,
    aeronaveId,
  );
  const planningUnit =
    planning.unidadePesoPlanejado === 'LB' ? 'LB' : 'KG';
  const aircraftWeightInPlanningUnit =
    aircraftWeight.pesoVazio != null && aircraftWeight.unidadePeso
      ? convertWeight(aircraftWeight.pesoVazio, aircraftWeight.unidadePeso, planningUnit)
      : null;

  if (
    planning.pesoPlanejado == null &&
    planning.pesoPassageiros == null &&
    planning.pesoBagagem == null &&
    aircraftWeightInPlanningUnit == null
  ) return;

  try {
    await db.prepare(
      `UPDATE cv_voo_etapas
          SET peso_passageiros = CASE WHEN numero_etapa = 1 THEN ? ELSE peso_passageiros END,
              peso_bagagem = CASE WHEN numero_etapa = 1 THEN ? ELSE peso_bagagem END,
              peso_vazio = ?,
              unidade_peso = ?,
              updated_at = datetime('now')
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    ).bind(
      planning.pesoPassageiros,
      planning.pesoBagagem,
      aircraftWeightInPlanningUnit,
      planningUnit,
      empresaId,
      vooId,
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('no such column')) throw error;
    if (planning.pesoPlanejado == null) return;
    try {
      await db.prepare(
        `UPDATE cv_voo_etapas SET unidade_peso = ?, updated_at = datetime('now')
          WHERE empresa_id = ? AND voo_id = ? AND numero_etapa = 1 AND deleted_at IS NULL`,
      ).bind(planningUnit, empresaId, vooId).run();
    } catch (legacyError) {
      const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError);
      if (!legacyMessage.includes('no such column')) throw legacyError;
    }
  }
}

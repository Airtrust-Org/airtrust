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

export async function updateFlightStagePlanningIfSupported(
  db: D1Database,
  empresaId: number,
  vooId: number,
  planning: FlightPlanningInput,
): Promise<void> {
  if (
    planning.pesoPlanejado == null &&
    planning.pesoPassageiros == null &&
    planning.pesoBagagem == null
  ) return;

  try {
    await db.prepare(
      `UPDATE cv_voo_etapas
          SET peso_passageiros = ?, peso_bagagem = ?, unidade_peso = ?, updated_at = datetime('now')
        WHERE empresa_id = ? AND voo_id = ? AND numero_etapa = 1 AND deleted_at IS NULL`,
    ).bind(
      planning.pesoPassageiros,
      planning.pesoBagagem,
      planning.unidadePesoPlanejado,
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
      ).bind(planning.unidadePesoPlanejado, empresaId, vooId).run();
    } catch (legacyError) {
      const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError);
      if (!legacyMessage.includes('no such column')) throw legacyError;
    }
  }
}

import { ApiError } from '../../middleware/error-handler';
import { computeEtapaPesoTotal } from './rdv-etapas';

export type FlightPlanningInput = {
  paxPlanejado: number | null;
  pesoPlanejado: number | null;
  pesoPassageiros: number | null;
  pesoBagagem: number | null;
  pesoCarga: number | null;
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
    pesoCarga: parseOptionalNonNegativeNumber(payload.peso_carga, 'peso_carga'),
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

async function refreshFlightStageTotalWeights(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<void> {
  const stages = await db.prepare(`SELECT id, payload, combustivel_inicio, unidade_combustivel,
    peso_vazio, peso_tripulacao, peso_passageiros, peso_bagagem, unidade_peso
    FROM cv_voo_etapas WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`)
    .bind(empresaId, vooId).all<{
      id: number; payload: number | null; combustivel_inicio: number | null;
      unidade_combustivel: string | null; peso_vazio: number | null;
      peso_tripulacao: number | null; peso_passageiros: number | null;
      peso_bagagem: number | null; unidade_peso: string | null;
    }>();
  const updates = (stages.results || []).flatMap(stage => {
    const total = computeEtapaPesoTotal(stage);
    return total == null ? [] : [db.prepare(`UPDATE cv_voo_etapas
      SET peso_total = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL`)
      .bind(total, stage.id, vooId, empresaId)];
  });
  if (updates.length) await db.batch(updates);
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
    // Bulk relabelling a stage's unit without converting existing component
    // numbers would silently change the meaning of crew/pax/baggage weights.
    const currentStages = await db.prepare(`SELECT unidade_peso, peso_tripulacao,
        peso_passageiros, peso_bagagem
        FROM cv_voo_etapas
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`)
      .bind(empresaId, vooId).all<{
        unidade_peso: string | null;
        peso_tripulacao: number | null;
        peso_passageiros: number | null;
        peso_bagagem: number | null;
      }>();
    for (const stage of currentStages.results || []) {
      const unit = String(stage.unidade_peso || '').trim().toUpperCase();
      const hasComponents = [stage.peso_tripulacao, stage.peso_passageiros,
        stage.peso_bagagem].some(value => value != null);
      if (hasComponents && unit !== planningUnit) {
        throw new ApiError(
          'Unidade de peso da etapa incompatível com a propagação do peso básico',
          409, 'CONTROLE_VOOS_WEIGHT_UNIT_MISMATCH',
        );
      }
    }
    await db.prepare(
      `UPDATE cv_voo_etapas
          SET peso_vazio = ?, unidade_peso = ?, updated_at = datetime('now')
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    ).bind(pesoVazio, planningUnit, empresaId, vooId).run();
    // O peso básico recém-propagado também compõe o total de cada etapa.
    await refreshFlightStageTotalWeights(db, empresaId, vooId);
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

  const updatesComponents =
    planning.pesoPassageiros != null ||
    planning.pesoBagagem != null ||
    planning.pesoCarga != null;
  // Editing PAX is not a request to erase a stage's certified empty/basic
  // weight, change its unit, or recompute its weight from incomplete inputs.
  if (aircraftWeightInPlanningUnit == null && !updatesComponents) {
    if (planning.paxPlanejado != null) {
      await db.prepare(`UPDATE cv_voo_etapas
          SET pax = ?, updated_at = datetime('now')
          WHERE empresa_id = ? AND voo_id = ? AND numero_etapa = 1 AND deleted_at IS NULL`)
        .bind(planning.paxPlanejado, empresaId, vooId).run();
    }
    return;
  }

  // An existing stage's other weights are expressed in unidade_peso.
  // Relabelling them KG/LB without converting their values is unsafe.
  // Reject a mismatched unit BEFORE performing any weight writes.
  const currentStages = await db.prepare(`SELECT unidade_peso,
      peso_vazio, peso_tripulacao, peso_passageiros, peso_bagagem
      FROM cv_voo_etapas
      WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`)
    .bind(empresaId, vooId).all<{
      unidade_peso: string | null;
      peso_vazio: number | null;
      peso_tripulacao: number | null;
      peso_passageiros: number | null;
      peso_bagagem: number | null;
    }>();
  for (const stage of currentStages.results || []) {
    const unit = String(stage.unidade_peso || '').trim().toUpperCase();
    const hasStoredWeight = [stage.peso_vazio, stage.peso_tripulacao,
      stage.peso_passageiros, stage.peso_bagagem].some(value => value != null);
    if (hasStoredWeight && unit !== planningUnit) {
      throw new ApiError(
        'Unidade de peso da etapa incompatível com o planejamento; conversão explícita necessária',
        409, 'CONTROLE_VOOS_WEIGHT_UNIT_MISMATCH',
      );
    }
  }

  try {
    await db.prepare(
      `UPDATE cv_voo_etapas
          SET pax = CASE WHEN numero_etapa = 1 AND ? IS NOT NULL THEN ? ELSE pax END,
              peso_passageiros = CASE WHEN numero_etapa = 1 AND ? IS NOT NULL THEN ? ELSE peso_passageiros END,
              peso_bagagem = CASE WHEN numero_etapa = 1 AND ? IS NOT NULL THEN ? ELSE peso_bagagem END,
              payload = CASE WHEN numero_etapa = 1 AND ? IS NOT NULL THEN ? ELSE payload END,
              peso_vazio = COALESCE(?, peso_vazio),
              unidade_peso = CASE WHEN ? IS NOT NULL OR unidade_peso IS NULL THEN ? ELSE unidade_peso END,
              updated_at = datetime('now')
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL`,
    ).bind(
      planning.paxPlanejado, planning.paxPlanejado,
      planning.pesoPassageiros, planning.pesoPassageiros,
      planning.pesoBagagem, planning.pesoBagagem,
      planning.pesoCarga == null ? null : convertWeight(planning.pesoCarga, planningUnit, 'KG'),
      planning.pesoCarga == null ? null : convertWeight(planning.pesoCarga, planningUnit, 'KG'),
      aircraftWeightInPlanningUnit,
      aircraftWeightInPlanningUnit, planningUnit,
      empresaId, vooId,
    ).run();
    // Same certified weight formula used by server-side RDV stage edits and Pilot App.
    // Payload is stored in KG; other values are expressed in unidade_peso.
    await refreshFlightStageTotalWeights(db, empresaId, vooId);
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

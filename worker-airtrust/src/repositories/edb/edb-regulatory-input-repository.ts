import {
  validateExplicitRegulatoryStage,
  type ControleVoosEtapaRegulatoriaRow,
  type EdbRegulatoryDataOrigin,
} from '../../services/edb/operational-regulatory-source';

export interface RegulatoryStageWriteInput {
  tempo_voo_diurno_minutos: number | null;
  tempo_voo_noturno_minutos: number | null;
  tempo_voo_total_minutos: number | null;
  tempo_ifr_real_minutos: number | null;
  tempo_ifr_simulado_minutos: number | null;
  pousos_total: number | null;
  ciclos: number | null;
  combustivel_antes_partida_motor: number | null;
  pessoas_a_bordo_total: number | null;
  carga_regulatoria_kg: number | null;
  ocorrencias_json: string | null;
  origem_dados: EdbRegulatoryDataOrigin;
}

function validateWriteInput(params: {
  empresaId: number;
  vooId: number;
  etapaId: number;
  input: RegulatoryStageWriteInput;
  version: number;
}): void {
  const synthetic: ControleVoosEtapaRegulatoriaRow = {
    id: 0,
    empresa_id: params.empresaId,
    voo_id: params.vooId,
    etapa_id: params.etapaId,
    ...params.input,
    versao: params.version,
    preenchido_por: null,
    preenchido_em: null,
  };
  validateExplicitRegulatoryStage(synthetic);
}

function bindStageValues(input: RegulatoryStageWriteInput): unknown[] {
  return [
    input.tempo_voo_diurno_minutos,
    input.tempo_voo_noturno_minutos,
    input.tempo_voo_total_minutos,
    input.tempo_ifr_real_minutos,
    input.tempo_ifr_simulado_minutos,
    input.pousos_total,
    input.ciclos,
    input.combustivel_antes_partida_motor,
    input.pessoas_a_bordo_total,
    input.carga_regulatoria_kg,
    input.ocorrencias_json,
    input.origem_dados,
  ];
}

/**
 * Creates the explicit regulatory companion only if the source stage belongs to
 * the same tenant/flight and no active companion already exists.
 */
export async function createControleVoosRegulatoryStage(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  etapaId: number;
  input: RegulatoryStageWriteInput;
  actorId?: number | null;
}): Promise<void> {
  validateWriteInput({
    empresaId: params.empresaId,
    vooId: params.vooId,
    etapaId: params.etapaId,
    input: params.input,
    version: 1,
  });

  const result = await params.db
    .prepare(
      `
      INSERT INTO cv_voo_etapas_regulatorio (
        empresa_id, voo_id, etapa_id,
        tempo_voo_diurno_minutos, tempo_voo_noturno_minutos, tempo_voo_total_minutos,
        tempo_ifr_real_minutos, tempo_ifr_simulado_minutos,
        pousos_total, ciclos, combustivel_antes_partida_motor,
        pessoas_a_bordo_total, carga_regulatoria_kg, ocorrencias_json,
        origem_dados, versao, preenchido_por, preenchido_em,
        created_by, updated_by, created_at, updated_at
      )
      SELECT
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 1, ?, datetime('now'), ?, ?, datetime('now'), datetime('now')
      FROM cv_voo_etapas etapa
      WHERE etapa.id = ?
        AND etapa.empresa_id = ?
        AND etapa.voo_id = ?
        AND etapa.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM cv_voo_etapas_regulatorio existing
          WHERE existing.empresa_id = ?
            AND existing.etapa_id = ?
            AND existing.deleted_at IS NULL
        )
    `,
    )
    .bind(
      params.empresaId,
      params.vooId,
      params.etapaId,
      ...bindStageValues(params.input),
      params.actorId ?? null,
      params.actorId ?? null,
      params.actorId ?? null,
      params.etapaId,
      params.empresaId,
      params.vooId,
      params.empresaId,
      params.etapaId,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_STAGE_CREATE_CONFLICT');
  }
}

/**
 * Replaces the full explicit regulatory companion using optimistic concurrency.
 * Partial updates are intentionally avoided so the caller always validates the
 * complete regulatory semantics as one unit.
 */
export async function replaceControleVoosRegulatoryStage(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  etapaId: number;
  expectedVersion: number;
  input: RegulatoryStageWriteInput;
  actorId?: number | null;
}): Promise<void> {
  if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 1) {
    throw new Error('EDB_REGULATORY_STAGE_INVALID_VERSION');
  }

  validateWriteInput({
    empresaId: params.empresaId,
    vooId: params.vooId,
    etapaId: params.etapaId,
    input: params.input,
    version: params.expectedVersion,
  });

  const result = await params.db
    .prepare(
      `
      UPDATE cv_voo_etapas_regulatorio
      SET
        tempo_voo_diurno_minutos = ?,
        tempo_voo_noturno_minutos = ?,
        tempo_voo_total_minutos = ?,
        tempo_ifr_real_minutos = ?,
        tempo_ifr_simulado_minutos = ?,
        pousos_total = ?,
        ciclos = ?,
        combustivel_antes_partida_motor = ?,
        pessoas_a_bordo_total = ?,
        carga_regulatoria_kg = ?,
        ocorrencias_json = ?,
        origem_dados = ?,
        versao = versao + 1,
        preenchido_por = ?,
        preenchido_em = datetime('now'),
        updated_by = ?,
        updated_at = datetime('now')
      WHERE empresa_id = ?
        AND voo_id = ?
        AND etapa_id = ?
        AND versao = ?
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM cv_voo_etapas etapa
          WHERE etapa.id = cv_voo_etapas_regulatorio.etapa_id
            AND etapa.empresa_id = cv_voo_etapas_regulatorio.empresa_id
            AND etapa.voo_id = cv_voo_etapas_regulatorio.voo_id
            AND etapa.deleted_at IS NULL
        )
    `,
    )
    .bind(
      ...bindStageValues(params.input),
      params.actorId ?? null,
      params.actorId ?? null,
      params.empresaId,
      params.vooId,
      params.etapaId,
      params.expectedVersion,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_STAGE_VERSION_CONFLICT');
  }
}

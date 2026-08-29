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
  tempo_ifr_nao_classificado_minutos: number | null;
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
    id: params.etapaId,
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
    input.tempo_ifr_nao_classificado_minutos,
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
 * Initializes the canonical regulatory semantics on the existing source stage.
 * There is intentionally no second stage row/table.
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
      UPDATE cv_voo_etapas
      SET tempo_voo_diurno_minutos = ?,
          tempo_voo_noturno_minutos = ?,
          tempo_voo_total_minutos = ?,
          tempo_ifr_real_minutos = ?,
          tempo_ifr_simulado_minutos = ?,
          tempo_ifr_nao_classificado_minutos = ?,
          pousos_total = ?,
          ciclos = ?,
          combustivel_antes_partida_motor = ?,
          pessoas_a_bordo_total = ?,
          carga_regulatoria_kg = ?,
          ocorrencias_json = ?,
          semantica_regulatoria_origem = ?,
          semantica_regulatoria_versao = 1,
          semantica_regulatoria_preenchido_por = ?,
          semantica_regulatoria_preenchido_em = datetime('now'),
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
        AND empresa_id = ?
        AND voo_id = ?
        AND deleted_at IS NULL
        AND semantica_regulatoria_preenchido_em IS NULL
    `,
    )
    .bind(
      ...bindStageValues(params.input),
      params.actorId ?? null,
      params.actorId ?? null,
      params.etapaId,
      params.empresaId,
      params.vooId,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_STAGE_CREATE_CONFLICT');
  }
}

/**
 * Replaces the complete canonical semantic set with optimistic concurrency.
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
      UPDATE cv_voo_etapas
      SET tempo_voo_diurno_minutos = ?,
          tempo_voo_noturno_minutos = ?,
          tempo_voo_total_minutos = ?,
          tempo_ifr_real_minutos = ?,
          tempo_ifr_simulado_minutos = ?,
          tempo_ifr_nao_classificado_minutos = ?,
          pousos_total = ?,
          ciclos = ?,
          combustivel_antes_partida_motor = ?,
          pessoas_a_bordo_total = ?,
          carga_regulatoria_kg = ?,
          ocorrencias_json = ?,
          semantica_regulatoria_origem = ?,
          semantica_regulatoria_versao = semantica_regulatoria_versao + 1,
          semantica_regulatoria_preenchido_por = ?,
          semantica_regulatoria_preenchido_em = datetime('now'),
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
        AND empresa_id = ?
        AND voo_id = ?
        AND semantica_regulatoria_versao = ?
        AND deleted_at IS NULL
    `,
    )
    .bind(
      ...bindStageValues(params.input),
      params.actorId ?? null,
      params.actorId ?? null,
      params.etapaId,
      params.empresaId,
      params.vooId,
      params.expectedVersion,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_STAGE_VERSION_CONFLICT');
  }
}

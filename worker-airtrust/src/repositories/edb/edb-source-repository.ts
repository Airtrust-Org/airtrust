import type {
  ControleVoosEtapaRegulatoriaRow,
  ControleVoosTripulanteRegulatorioRow,
} from '../../services/edb/operational-regulatory-source';

const REGULATORY_STAGE_SELECT = `
  id, empresa_id, voo_id, id AS etapa_id,
  tempo_voo_diurno_minutos, tempo_voo_noturno_minutos, tempo_voo_total_minutos,
  tempo_ifr_real_minutos, tempo_ifr_simulado_minutos, tempo_ifr_nao_classificado_minutos,
  pousos_total, ciclos, combustivel_antes_partida_motor,
  pessoas_a_bordo_total, carga_regulatoria_kg, ocorrencias_json,
  semantica_regulatoria_origem AS origem_dados,
  semantica_regulatoria_versao AS versao,
  semantica_regulatoria_preenchido_por AS preenchido_por,
  semantica_regulatoria_preenchido_em AS preenchido_em
`;

const REGULATORY_CREW_SELECT = `
  id, empresa_id, voo_id, id AS tripulante_voo_id, etapa_id, funcionario_id,
  codigo_funcao_anac, funcao_anac_origem AS origem_dados,
  funcao_anac_validado_por AS validado_por,
  funcao_anac_validado_em AS validado_em
`;

export async function listControleVoosRegulatoryStages(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<ControleVoosEtapaRegulatoriaRow[]> {
  const result = await db
    .prepare(
      `
      SELECT ${REGULATORY_STAGE_SELECT}
      FROM cv_voo_etapas
      WHERE empresa_id = ?
        AND voo_id = ?
        AND deleted_at IS NULL
      ORDER BY numero_etapa ASC, id ASC
    `,
    )
    .bind(empresaId, vooId)
    .all<ControleVoosEtapaRegulatoriaRow>();

  return result.results ?? [];
}

export async function listControleVoosRegulatoryCrew(
  db: D1Database,
  empresaId: number,
  vooId: number,
): Promise<ControleVoosTripulanteRegulatorioRow[]> {
  const result = await db
    .prepare(
      `
      SELECT ${REGULATORY_CREW_SELECT}
      FROM cv_voo_tripulantes
      WHERE empresa_id = ?
        AND voo_id = ?
        AND deleted_at IS NULL
      ORDER BY etapa_id ASC, funcionario_id ASC
    `,
    )
    .bind(empresaId, vooId)
    .all<ControleVoosTripulanteRegulatorioRow>();

  return result.results ?? [];
}

export async function getControleVoosRegulatoryStage(
  db: D1Database,
  empresaId: number,
  etapaId: number,
): Promise<ControleVoosEtapaRegulatoriaRow | null> {
  return db
    .prepare(
      `
      SELECT ${REGULATORY_STAGE_SELECT}
      FROM cv_voo_etapas
      WHERE empresa_id = ?
        AND id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(empresaId, etapaId)
    .first<ControleVoosEtapaRegulatoriaRow>();
}

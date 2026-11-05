import { getSchemaColumns } from '../../utils/db-schema';

/**
 * Acesso a dados da fase "examinador + checks + fichas especiais" de uma sessão de
 * simulador. Movido de routes/simuladores-sessoes-update.ts sem alterar o SQL.
 */

type Id = string | number;

export interface FichaEspecialRow {
  id: number;
  status: string | null;
  assinatura_aluno_timestamp: string | null;
  assinatura_instrutor_timestamp: string | null;
  assinatura_aluno_imagem: string | null;
  assinatura_instrutor_imagem: string | null;
  data_conclusao: string | null;
}

/** Examinador/checador ativo do tenant, respeitando as colunas de flag que existem no schema. */
export async function findExaminadorElegivel(
  db: D1Database,
  funcionarioId: number,
  empresaId: number,
): Promise<{ id: number } | null> {
  const funcionarioColumns = await getSchemaColumns(db, 'funcionarios');
  const hasIsExaminador = funcionarioColumns.has('is_examinador');
  const hasIsChecador = funcionarioColumns.has('is_checador');
  const examinadorFlagExpr =
    hasIsExaminador && hasIsChecador
      ? '(COALESCE(is_examinador, 0) = 1 OR COALESCE(is_checador, 0) = 1)'
      : hasIsExaminador
        ? 'COALESCE(is_examinador, 0) = 1'
        : hasIsChecador
          ? 'COALESCE(is_checador, 0) = 1'
          : '0 = 1';
  return db
    .prepare(
      `SELECT id
           FROM funcionarios
             WHERE id = ?
               AND ${examinadorFlagExpr}
               AND empresa_id = ?
               AND deleted_at IS NULL`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ id: number }>();
}

export async function updateSessaoCheckFields(
  db: D1Database,
  sessaoId: Id,
  empresaId: number,
  examinadorId: number | null,
  isCheck: 0 | 1,
): Promise<void> {
  await db
    .prepare(
      "UPDATE simulador_agendamentos SET examinador_id=?, is_check=?, updated_at=datetime('now') WHERE id=? AND empresa_id = ?",
    )
    .bind(examinadorId, isCheck, sessaoId, empresaId)
    .run();
}

/** Soft delete dos vínculos de check da sessão e dos resultados ligados a eles. */
export async function softDeleteSessaoChecks(db: D1Database, sessaoId: Id): Promise<void> {
  const scOld = await db
    .prepare(
      `SELECT id
         FROM sessoes_checks
         WHERE sessao_id = ? AND deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .all<{ id: number }>();

  if (scOld.results && scOld.results.length > 0) {
    const ids = scOld.results.map((r) => r.id).filter((v) => v !== undefined);

    await db
      .prepare(
        "UPDATE sessoes_checks SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_id=? AND deleted_at IS NULL",
      )
      .bind(sessaoId)
      .run();

    // Soft delete resultados vinculados aos sessao_check antigos
    for (const scId of ids) {
      await db
        .prepare(
          "UPDATE sessoes_checks_resultados SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE sessao_check_id=? AND deleted_at IS NULL",
        )
        .bind(scId)
        .run();
    }
  }
}

export async function insertSessaoChecks(
  db: D1Database,
  sessaoId: Id,
  qualificacaoTipoIds: number[],
): Promise<void> {
  for (const qualificacao_tipo_id of qualificacaoTipoIds) {
    await db
      .prepare(
        `INSERT INTO sessoes_checks (sessao_id, qualificacao_tipo_id, created_at, updated_at)
             VALUES (?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(sessaoId, qualificacao_tipo_id)
      .run();
  }
}

/** Códigos (como gravados) dos tipos de check vigentes da sessão. */
export async function listCodigosChecksAtuais(db: D1Database, sessaoId: Id): Promise<unknown[]> {
  const codRes = await db
    .prepare(
      `SELECT qt.codigo FROM sessoes_checks sc
           JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
           WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL AND qt.deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .all<{ codigo: unknown }>();
  return (codRes.results || []).map((r) => r.codigo);
}

/** Mapa codigo -> id dos modelos de sessão especiais do tenant. */
export async function mapModelosEspeciais(
  db: D1Database,
  empresaId: number,
): Promise<Map<string, number>> {
  const tplRes = await db
    .prepare(
      `SELECT id, codigo FROM modelos_sessao
           WHERE codigo IN ('CRED-EXA') AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .all<{ id: number; codigo: unknown }>();
  return new Map((tplRes.results || []).map((r) => [String(r.codigo), r.id]));
}

/** tipo_aeronave de uma ficha qualquer da sessão (referência para inferir). */
export async function findTipoAeronaveDeFichaDaSessao(
  db: D1Database,
  sessaoId: Id,
  empresaId: number,
): Promise<string | null> {
  const fichaRef = await db
    .prepare(
      `SELECT tipo_aeronave FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(sessaoId, empresaId)
    .first<{ tipo_aeronave: string | null }>();
  return fichaRef?.tipo_aeronave || null;
}

export async function findFichaEspecial(
  db: D1Database,
  params: { sessaoId: Id; alunoId: unknown; tipoSessao: string; empresaId: number },
): Promise<FichaEspecialRow | null> {
  return db
    .prepare(
      `SELECT id,
                    status,
                    assinatura_aluno_timestamp,
                    assinatura_instrutor_timestamp,
                    assinatura_aluno_imagem,
                    assinatura_instrutor_imagem,
                    data_conclusao
             FROM fichas_sessao
             WHERE agendamento_slot_id = ? AND colaborador_id_aluno = ?
               AND tipo_sessao = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(params.sessaoId, params.alunoId, params.tipoSessao, params.empresaId)
    .first<FichaEspecialRow>();
}

export async function softDeleteFichaEspecial(
  db: D1Database,
  fichaId: number,
  empresaId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE fichas_sessao
                   SET deleted_at = datetime('now')
                   WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(fichaId, empresaId)
    .run();

  await db
    .prepare(
      `UPDATE fichas_sessao_manobras
                   SET deleted_at = datetime('now')
                   WHERE ficha_id = ? AND deleted_at IS NULL`,
    )
    .bind(fichaId)
    .run();
}

export async function insertFichaEspecial(
  db: D1Database,
  params: {
    uuid: string;
    sessaoId: Id;
    alunoId: unknown;
    instrutorId: unknown;
    tipoSessao: string;
    tipoAeronave: unknown;
    dataSessao: unknown;
    templateId: number | null;
    empresaId: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fichas_sessao
                 (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
                  tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?)`,
    )
    .bind(
      params.uuid,
      params.sessaoId,
      params.alunoId,
      params.instrutorId,
      params.tipoSessao,
      params.tipoAeronave,
      params.dataSessao,
      params.templateId,
      params.empresaId,
    )
    .run();
}

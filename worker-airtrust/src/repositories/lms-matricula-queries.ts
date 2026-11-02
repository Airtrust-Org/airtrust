import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';

/** Tenant-bound matrícula lookup shared by course enrollment endpoints.
 * Keeping SQL out of the large route prevents code-growth regressions.
 */
export async function findLatestMatriculaForFuncionario(
  db: D1Database,
  params: { cursoId: number; funcionarioId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT id, status, deleted_at
         FROM lms_matriculas
        WHERE curso_id = ?
          AND funcionario_id = ?
          AND empresa_id = ?
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(params.cursoId, params.funcionarioId, params.empresaId)
    .first<{ id: number; status: string; deleted_at: string | null }>();
}

export async function readMatriculaForCourseList(
  db: D1Database,
  params: { matriculaId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT m.*, f.nome AS funcionario_nome, f.matricula AS funcionario_matricula
         FROM lms_matriculas m
         LEFT JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.empresa_id = m.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE m.id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.matriculaId, params.empresaId)
    .first<Record<string, unknown>>();
}

/** Matrículas EAD do aluno com estado de vínculo da qualificação e certificado (GET /matriculas/minhas-ead). */
export async function listMinhasEadEnrollments(
  db: D1Database,
  params: { funcionarioId: number; empresaId: number },
) {
  return db
    .prepare(
      `
      SELECT
        m.id,
        m.curso_id,
        m.funcionario_id,
        m.status,
        m.progresso_pct,
        m.score_final,
        m.data_matricula,
        m.data_inicio,
        m.data_conclusao,
        m.data_expiracao,
        m.qualificacao_historico_id,
        c.titulo,
        c.categoria,
        c.carga_horaria_minutos,
        c.thumbnail_r2_key,
        c.tipo_conteudo,
        c.scorm_versao,
        c.publicado,
        c.gerar_qualificacao_ao_concluir,
        CASE
          WHEN qh.id IS NOT NULL THEN ${getQualificacoesVencimentoExpr()}
          ELSE NULL
        END AS data_vencimento_qualificacao,
        CASE WHEN qh.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS tem_certificado,
        CASE WHEN qh.id IS NOT NULL THEN 'LINKED' ELSE 'LINK_PENDING' END AS qualification_link_state,
        CASE
          WHEN COALESCE(c.gerar_qualificacao_ao_concluir, 0) = 0 THEN 'NOT_REQUIRED'
          WHEN qh.certificado_arquivo_id IS NOT NULL THEN 'AVAILABLE'
          WHEN m.status = 'CONCLUIDO' THEN 'PENDING'
          ELSE 'NOT_REQUIRED'
        END AS certificate_state
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      LEFT JOIN qualificacoes_historico qh
        ON qh.id = m.qualificacao_historico_id
        AND qh.empresa_id = m.empresa_id
        AND qh.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt
        ON qt.id = qh.qualificacao_id
        AND qt.empresa_id = m.empresa_id
        AND qt.deleted_at IS NULL
      WHERE m.funcionario_id = ?
        AND m.empresa_id = ?
        AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND m.status != 'CANCELADO'
      ORDER BY
        CASE m.status
          WHEN 'EM_ANDAMENTO' THEN 1
          WHEN 'NAO_INICIADO' THEN 2
          WHEN 'CONCLUIDO' THEN 3
          ELSE 4
        END,
        data_vencimento_qualificacao ASC NULLS LAST,
        m.updated_at DESC
    `,
    )
    .bind(params.funcionarioId, params.empresaId)
    .all<Record<string, unknown>>();
}

/** Total de matrículas do aluno (GET /matriculas/minhas). */
export async function countMinhasEnrollments(
  db: D1Database,
  params: { funcionarioId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
        WHERE m.funcionario_id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
          AND c.deleted_at IS NULL`,
    )
    .bind(params.funcionarioId, params.empresaId)
    .first<{ n: number }>();
}

/** Página de matrículas do aluno, mais recentes primeiro (GET /matriculas/minhas). */
export async function listMinhasEnrollments(
  db: D1Database,
  params: { funcionarioId: number; empresaId: number; limit: number; offset: number },
) {
  return db
    .prepare(
      `
      SELECT m.*,
        c.titulo, c.categoria, c.carga_horaria_minutos, c.thumbnail_r2_key,
          c.tipo_conteudo, c.scorm_versao, c.publicado
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      WHERE m.funcionario_id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY m.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(params.funcionarioId, params.empresaId, params.limit, params.offset)
    .all<Record<string, unknown>>();
}

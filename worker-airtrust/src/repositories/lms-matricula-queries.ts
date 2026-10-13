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

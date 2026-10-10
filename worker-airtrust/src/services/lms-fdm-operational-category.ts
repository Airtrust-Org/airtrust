/**
 * Scoped compatibility for the FDM–Tripulação operational training category.
 *
 * Governed Schema V2 0536 intentionally classified the qualification model as
 * TREINAMENTO_OPERACIONAL (NOT EAD). Schema V2 0543 subsequently connected the
 * published SCORM course #71 to that exact model. The generic LMS completion
 * path requires an EAD-integrated category, producing a false completion
 * rejection after the learner has passed a valid SCORM package.
 *
 * Preserve the original operational classification, but ONLY when the
 * authenticated tenant/enrollment/course/type are the exact reviewed mapping.
 * All SCORM progress, grade, final-commit, cycle, qualification-history,
 * certificate and audit gates remain owned by existing canonical services.
 */
export type FdmOperationalCategoryContext = {
  db: D1Database;
  empresaId: number;
  cursoId?: number | null;
  matriculaId: number;
  funcionarioId: number;
  qualificacaoTipoId: number;
  qualificacaoTipoCodigo: string;
  categoriaCodigo: string;
  gerarQualificacaoAoConcluir: boolean;
};

const APPROVED_TENANT = 6;
const APPROVED_COURSE = 71;
const APPROVED_QUALIFICATION = 'FDM-TRIPULACAO';
const APPROVED_CATEGORY = 'TREINAMENTO_OPERACIONAL';

export async function hasApprovedFdmOperationalQualificationLink(
  params: FdmOperationalCategoryContext,
): Promise<boolean> {
  if (
    params.empresaId !== APPROVED_TENANT ||
    params.cursoId !== APPROVED_COURSE ||
    !Number.isSafeInteger(params.matriculaId) || params.matriculaId <= 0 ||
    !Number.isSafeInteger(params.funcionarioId) || params.funcionarioId <= 0 ||
    !Number.isSafeInteger(params.qualificacaoTipoId) || params.qualificacaoTipoId <= 0 ||
    params.qualificacaoTipoCodigo.trim().toUpperCase() !== APPROVED_QUALIFICATION ||
    params.categoriaCodigo.trim().toUpperCase() !== APPROVED_CATEGORY ||
    !params.gerarQualificacaoAoConcluir
  ) {
    return false;
  }

  // Re-query canonical DB state; never trust only the caller's course ID.
  // This exception does NOT authorize a learner to see another enrollment.
  const row = await params.db.prepare(
    `SELECT 1 AS allowed
       FROM lms_cursos c
       JOIN lms_matriculas m ON m.curso_id = c.id AND m.empresa_id = c.empresa_id
      WHERE c.id = ? AND c.empresa_id = ? AND c.qualificacao_tipo_id = ?
        AND c.tipo_conteudo = 'scorm' AND c.ativo = 1 AND c.publicado = 1
        AND c.deleted_at IS NULL
        AND m.id = ? AND m.empresa_id = ? AND m.funcionario_id = ?
        AND m.deleted_at IS NULL AND m.status IN ('EM_ANDAMENTO', 'CONCLUIDO')
      LIMIT 1`,
  ).bind(
    APPROVED_COURSE,
    APPROVED_TENANT,
    params.qualificacaoTipoId,
    params.matriculaId,
    APPROVED_TENANT,
    params.funcionarioId,
  ).first<{ allowed: number }>();

  return row?.allowed === 1;
}

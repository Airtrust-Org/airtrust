/**
 * Allow only the explicitly audited non-EAD qualification models to close
 * SCORM sessions. These are real published SCORM courses with tenant-scoped
 * canonical types and active qualification categories that are deliberately
 * *not* tagged as EAD. Do not change the category or bypass LMS integrity.
 *
 * Production read-only evidence, 2026-10-10:
 * courses 26, 27, 29, 70, 71, all empresa_id=6.
 * The allowlist must not be broadened without fresh evidence and tests.
 */
export type ScormCategoryCompatibilityContext = {
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

const TENANT = 6;

type AllowedLink = {
  typeId: number;
  typeCode: string;
  categoryCode: string;
};

const ALLOWED_NON_EAD_SCORM_LINKS: Readonly<Record<number, AllowedLink>> = Object.freeze({
  26: { typeId: 125, typeCode: 'MNT_MGM', categoryCode: 'TREINAMENTO-DE-DOUTRINACAO' },
  27: { typeId: 124, typeCode: 'MNT_MCQ', categoryCode: 'TREINAMENTO-DE-DOUTRINACAO' },
  29: { typeId: 123, typeCode: 'MNT_MOM', categoryCode: 'TREINAMENTO-DE-DOUTRINACAO' },
  70: { typeId: 188, typeCode: 'NR-05', categoryCode: 'TREINAMENTO_GERAL' },
  71: { typeId: 204, typeCode: 'FDM-TRIPULACAO', categoryCode: 'TREINAMENTO_OPERACIONAL' },
});

/**
 * Only the exact employee's active enrollment and exact linked, active model
 * may use this compatibility path. All other categories remain fail-closed.
 * This query is a read; any completion writes remain in the atomic LMS batch.
 */
export async function hasApprovedScormCategoryLink(
  params: ScormCategoryCompatibilityContext,
): Promise<boolean> {
  if (
    params.empresaId !== TENANT ||
    !Number.isSafeInteger(params.cursoId) || Number(params.cursoId) <= 0 ||
    !Number.isSafeInteger(params.matriculaId) || params.matriculaId <= 0 ||
    !Number.isSafeInteger(params.funcionarioId) || params.funcionarioId <= 0 ||
    !Number.isSafeInteger(params.qualificacaoTipoId) || params.qualificacaoTipoId <= 0 ||
    params.gerarQualificacaoAoConcluir !== true
  ) return false;

  const courseId = Number(params.cursoId);
  const approved = ALLOWED_NON_EAD_SCORM_LINKS[courseId];
  if (
    !approved ||
    params.qualificacaoTipoId !== approved.typeId ||
    String(params.qualificacaoTipoCodigo || '').trim().toUpperCase() !== approved.typeCode ||
    String(params.categoriaCodigo || '').trim().toUpperCase() !== approved.categoryCode
  ) return false;

  const row = await params.db.prepare(
    `SELECT 1 AS allowed
       FROM lms_cursos c
       JOIN qualificacoes_tipos qt
         ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = c.empresa_id
        AND qt.deleted_at IS NULL AND qt.ativo = 1
       JOIN qualificacoes_categorias qc
         ON qc.id = qt.categoria_id AND qc.empresa_id = c.empresa_id
        AND qc.deleted_at IS NULL AND qc.ativo = 1
       JOIN lms_matriculas m
         ON m.curso_id = c.id AND m.empresa_id = c.empresa_id
      WHERE c.id = ? AND c.empresa_id = ? AND c.qualificacao_tipo_id = ?
        AND qt.codigo = ? AND qc.codigo = ?
        AND c.tipo_conteudo = 'scorm' AND c.ativo = 1 AND c.publicado = 1
        AND c.gerar_qualificacao_ao_concluir = 1 AND c.deleted_at IS NULL
        AND m.id = ? AND m.empresa_id = ? AND m.funcionario_id = ?
        AND m.deleted_at IS NULL AND m.status IN ('EM_ANDAMENTO', 'CONCLUIDO')
      LIMIT 1`,
  ).bind(
    courseId, TENANT, approved.typeId, approved.typeCode, approved.categoryCode,
    params.matriculaId, TENANT, params.funcionarioId,
  ).first<{ allowed: number }>();

  return row?.allowed === 1;
}

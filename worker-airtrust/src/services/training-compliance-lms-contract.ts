import { ApiError } from '../middleware/error-handler';

export type TrainingLmsContractState =
  | 'NON_EAD'
  | 'INVALID_AUTO_CONFIGURATION'
  | 'NO_PUBLISHED_COURSE'
  | 'MULTIPLE_PUBLISHED_COURSES'
  | 'EAD_OPT_OUT'
  | 'EAD_READY';

type ContractRow = {
  id: number;
  qualificacao_tipo_id: number;
  condicao_id: number | null;
  escopo: string;
  categoria: string | null;
  auto_matricular_ead: number | null;
  modalidade_requerida: string | null;
  published_courses: number;
  unpublished_courses: number;
};

export function classifyTrainingLmsContract(row: Pick<ContractRow,
  'categoria' | 'auto_matricular_ead' | 'modalidade_requerida' | 'published_courses'>): TrainingLmsContractState {
  if (!['EAD', 'TREINAMENTO EAD'].includes(String(row.categoria || '').trim().toUpperCase()))
    return Number(row.auto_matricular_ead) === 1 ? 'INVALID_AUTO_CONFIGURATION' : 'NON_EAD';
  if (Number(row.published_courses) === 0) return 'NO_PUBLISHED_COURSE';
  if (Number(row.published_courses) !== 1) return 'MULTIPLE_PUBLISHED_COURSES';
  if (Number(row.auto_matricular_ead) === 1 && row.modalidade_requerida !== 'EAD')
    return 'INVALID_AUTO_CONFIGURATION';
  if (Number(row.auto_matricular_ead) !== 1)
    return 'EAD_OPT_OUT';
  return 'EAD_READY';
}

/**
 * The setting auto_matricular_ead is an explicit opt-in, not something inferred
 * from a qualification category. A write opting in cannot silently persist an
 * unusable or ambiguous LMS mapping. No direct enrollment writes occur here.
 */
export async function assertTrainingComplianceAutoEnrollmentContract(
  db: D1Database, empresaId: number, qualificacaoTipoId: number,
  optedIn: number, modalidade: string | null,
): Promise<void> {
  if (optedIn !== 1) return;
  if (modalidade !== 'EAD') throw new ApiError(
    'Matrícula EAD automática exige modalidade EAD explicitamente selecionada', 409,
  );
  const qualification = await db.prepare(
    `SELECT categoria FROM qualificacoes_tipos
       WHERE empresa_id=? AND id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1`,
  ).bind(empresaId, qualificacaoTipoId).first<{ categoria: string | null }>();
  if (!qualification) throw new ApiError('Qualificação indisponível para matrícula automática', 409);
  if (!['EAD', 'TREINAMENTO EAD'].includes(String(qualification.categoria || '').trim().toUpperCase()))
    throw new ApiError('Qualificação de outra modalidade não pode ser certificada automaticamente via EAD', 409);
  const matches = await db.prepare(
    `SELECT id FROM lms_cursos
       WHERE empresa_id=? AND qualificacao_tipo_id=?
         AND ativo=1 AND publicado=1 AND deleted_at IS NULL
       ORDER BY id LIMIT 2`,
  ).bind(empresaId, qualificacaoTipoId).all<{ id: number }>();
  if (matches.results.length !== 1)
    throw new ApiError(
      matches.results.length === 0
        ? 'Não há curso LMS publicado para a qualificação; matrícula automática bloqueada'
        : 'Há mais de um curso LMS publicado para a qualificação; defina um vínculo único',
      409,
    );
}

/** Tenant-scoped, admin-only, read-only status of all active mandatory rules. */
export async function inspectTrainingComplianceLmsContracts(
  db: D1Database, empresaId: number,
) {
  const { results } = await db.prepare(
    `SELECT tr.id,tr.qualificacao_tipo_id,tr.condicao_id,tr.escopo,qt.categoria,
        tr.auto_matricular_ead,tr.modalidade_requerida,
        (SELECT COUNT(*) FROM lms_cursos lc WHERE lc.empresa_id=tr.empresa_id
          AND lc.qualificacao_tipo_id=tr.qualificacao_tipo_id
          AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL) published_courses,
        (SELECT COUNT(*) FROM lms_cursos lc WHERE lc.empresa_id=tr.empresa_id
          AND lc.qualificacao_tipo_id=tr.qualificacao_tipo_id
          AND lc.ativo=1 AND lc.publicado=0 AND lc.deleted_at IS NULL) unpublished_courses
       FROM treinamento_requisitos tr
       JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id
         AND qt.empresa_id=tr.empresa_id AND qt.ativo=1 AND qt.deleted_at IS NULL
       WHERE tr.empresa_id=? AND tr.ativo=1 AND tr.deleted_at IS NULL
         AND tr.obrigatoriedade='OBRIGATORIA'
       ORDER BY tr.id`,
  ).bind(empresaId).all<ContractRow>();
  const summary: Record<TrainingLmsContractState, number> = {
    NON_EAD: 0, INVALID_AUTO_CONFIGURATION: 0, NO_PUBLISHED_COURSE: 0, MULTIPLE_PUBLISHED_COURSES: 0,
    EAD_OPT_OUT: 0, EAD_READY: 0,
  };
  const checks = (results || []).map((row) => {
    const state = classifyTrainingLmsContract(row);
    summary[state]++;
    return {
      rule_id: row.id, qualification_id: row.qualificacao_tipo_id,
      condition_id: row.condicao_id, scope: row.escopo,
      state, published_courses: row.published_courses,
      unpublished_courses: row.unpublished_courses,
    };
  });
  return {
    total_rules: checks.length,
    summary,
    // Opt-outs are configured behavior, not proof of defects.
    alerts: checks.filter((row) => row.state === 'NO_PUBLISHED_COURSE'
      || row.state === 'MULTIPLE_PUBLISHED_COURSES'
      || row.state === 'INVALID_AUTO_CONFIGURATION'),
    checks,
  };
}

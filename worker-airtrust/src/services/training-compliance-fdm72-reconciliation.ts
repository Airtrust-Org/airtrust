import { extrairUsuarioAuditoria } from '../utils/auditoria';
import { reconcileTrainingComplianceRuleEnrollment } from './training-compliance-rule-enrollment';

type FdmSnapshot = {
  rules: Array<{
    id: number;
    qualificacao_tipo_id: number;
    obrigatoriedade: string;
    modalidade_requerida: string | null;
  }>;
  people: Array<{
    id: number;
    requisitos: Array<{ regra_id: number; obrigatoriedade: string; status_compliance: string }>;
  }>;
};

type Summary = {
  created: number;
  reactivated: number;
  preserved: number;
  skipped_valid_evidence: number;
};

// Run the same Compliance-to-LMS service used on normal rule saves.
// No direct D1 SQL mutations, manual completion, email or invitation endpoint.
export async function reconcileFdmMaintenance72<TAccess>(
  db: D1Database,
  empresaId: number,
  access: TAccess,
  audit: ReturnType<typeof extrairUsuarioAuditoria>,
  buildSnapshot: (db: D1Database, empresaId: number, access: TAccess) => Promise<FdmSnapshot>,
): Promise<Summary> {
  if (empresaId !== 6) throw new Error('FDM72_TENANT_MISMATCH');

  const courses = await db.prepare(
    `SELECT c.id AS curso_id, qt.id AS qualificacao_tipo_id
      FROM lms_cursos c
      JOIN qualificacoes_tipos qt
        ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
      WHERE c.id=72 AND c.empresa_id=? AND c.ativo=1 AND c.publicado=1
        AND c.deleted_at IS NULL
        AND qt.ativo=1 AND qt.deleted_at IS NULL
        AND UPPER(TRIM(qt.codigo))='FDM-MECANICO'
      LIMIT 2`,
  ).bind(empresaId).all<{ curso_id: number; qualificacao_tipo_id: number }>();
  if ((courses.results || []).length !== 1)
    throw new Error('FDM72_COURSE_QUALIFICATION_MAPPING_INVALID');

  const qualificationId = Number(courses.results[0].qualificacao_tipo_id);
  const snapshot = await buildSnapshot(db, empresaId, access);
  const rules = snapshot.rules.filter((rule) =>
    rule.qualificacao_tipo_id === qualificationId && rule.obrigatoriedade === 'OBRIGATORIA');
  if (!rules.length) throw new Error('FDM72_OBLIGATORY_RULES_MISSING');

  const summary: Summary = {
    created: 0, reactivated: 0, preserved: 0, skipped_valid_evidence: 0,
  };
  for (const rule of rules) {
    const result = await reconcileTrainingComplianceRuleEnrollment(
      db, empresaId, rule.id, access, audit, buildSnapshot,
    );
    if (result.auto_enrollment_warning || !result.auto_enrollment)
      throw new Error('FDM72_SCOPED_RECONCILIATION_DEFERRED');
    for (const key of ['created', 'reactivated', 'preserved', 'skipped_valid_evidence'] as const)
      summary[key] += result.auto_enrollment[key] || 0;
  }
  return summary;
}

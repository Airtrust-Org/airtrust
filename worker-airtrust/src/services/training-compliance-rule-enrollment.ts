import { canReuseMatriculaCycle, ensureMatriculaCycle, hasActiveMatriculaCycle, resetMatriculaForNewCycle } from './lms-matricula-cycle';
import { stampLmsEnrollmentEvidenceProfile } from './training-compliance-evidence-profile';
import { trainingComplianceNeedsImmediateEnrollmentOnRuleSave } from './training-compliance-enrollment-policy';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';

type EnrollmentSnapshot = {
  rules: Array<{ id: number; obrigatoriedade: string; modalidade_requerida: string | null; qualificacao_tipo_id: number }>;
  people: Array<{
    id: number;
    requisitos: Array<{ regra_id: number; obrigatoriedade: string; status_compliance: string }>;
  }>;
};

type EnrollmentSummary = {
  created: number;
  reactivated: number;
  preserved: number;
  skipped_valid_evidence: number;
  unavailable_course: number;
};

/**
 * A change to an obligatory Compliance rule must immediately reconcile the
 * corresponding published LMS course. Never dispatch email or push invitations
 * in this path; existing valid evidence and in-progress cycles are preserved.
 */
async function performComplianceRuleEnrollment<TAccess>(
  db: D1Database,
  empresaId: number,
  ruleId: number,
  access: TAccess,
  audit: ReturnType<typeof extrairUsuarioAuditoria>,
  buildSnapshot: (db: D1Database, empresaId: number, access: TAccess) => Promise<EnrollmentSnapshot>,
) {
  const summary = {
    created: 0,
    reactivated: 0,
    preserved: 0,
    skipped_valid_evidence: 0,
    unavailable_course: 0,
  };
  const snapshot = await buildSnapshot(db, empresaId, access);
  const rule = snapshot.rules.find((candidate) => candidate.id === ruleId);
  if (!rule || rule.obrigatoriedade !== 'OBRIGATORIA') return summary;

  // Never fulfill presencial/hybrid/practical regulatory requirements with an LMS launch.
  if (rule.modalidade_requerida && rule.modalidade_requerida !== 'EAD') return summary;

  const applicable = snapshot.people.flatMap((person) =>
    person.requisitos
      .filter((req) => req.regra_id === ruleId && req.obrigatoriedade === 'OBRIGATORIA')
      .map((req) => ({ person, status: req.status_compliance })),
  );
  summary.skipped_valid_evidence = applicable.filter(
    ({ status }) => status === 'CONFORME' || status === 'VENCENDO',
  ).length;
  const pending = applicable
    .filter(({ status }) => trainingComplianceNeedsImmediateEnrollmentOnRuleSave(status))
    .map(({ person }) => person);
  if (!pending.length) return summary;

  const courses = await db.prepare(
    `SELECT id FROM lms_cursos
      WHERE empresa_id=? AND qualificacao_tipo_id=? AND ativo=1 AND publicado=1
        AND deleted_at IS NULL ORDER BY id LIMIT 2`,
  ).bind(empresaId, rule.qualificacao_tipo_id).all<{ id: number }>();
  // A course/model relation must be unambiguous; never guess by title.
  if ((courses.results || []).length !== 1) {
    summary.unavailable_course = pending.length;
    return summary;
  }
  const cursoId = Number(courses.results[0].id);
  for (const person of pending) {
    const existing = await db.prepare(
      `SELECT id,status,deleted_at FROM lms_matriculas
       WHERE empresa_id=? AND curso_id=? AND funcionario_id=?
       ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1`,
    ).bind(empresaId, cursoId, person.id)
      .first<{ id: number; status: string; deleted_at: string | null }>();
    if (hasActiveMatriculaCycle(existing)) {
      summary.preserved++;
      continue;
    }
    if (existing) {
      if (!canReuseMatriculaCycle(existing)) {
        summary.preserved++;
        continue;
      }
      await resetMatriculaForNewCycle(db, {
        matriculaId: existing.id,
        dataExpiracao: null,
        observacoes: 'Matrícula automática: requisito de Compliance atualizado (sem e-mail)',
        origin: 'AUTO_RENOVACAO',
        empresaId,
      });
      await stampLmsEnrollmentEvidenceProfile(db, {
        empresaId, matriculaId: existing.id,
        funcionarioId: person.id, qualificacaoTipoId: rule.qualificacao_tipo_id,
      });
      await registrarAuditoria({
        db, tabela: 'lms_matriculas', acao: 'UPDATE', registro_id: existing.id,
        dados_anteriores: { status: existing.status, deleted_at: existing.deleted_at },
        dados_novos: { status: 'NAO_INICIADO', curso_id: cursoId, origem: 'COMPLIANCE_RULE_SAVE' },
        ...audit,
      });
      summary.reactivated++;
      continue;
    }
    let id: number;
    try {
      const inserted = await db.prepare(
        `INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,observacoes)
         VALUES(?,?,?,'Matrícula automática: requisito de Compliance atualizado (sem e-mail)')`,
      ).bind(empresaId, cursoId, person.id).run();
      id = Number(inserted.meta.last_row_id || 0);
      if (!id) throw new Error('COMPLIANCE_MATRICULA_NOT_CREATED');
    } catch (error) {
      // Concurrent idempotent writes must not create a second enrollment.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas')) {
        summary.preserved++;
        continue;
      }
      throw error;
    }
    const cycleId = await ensureMatriculaCycle(db, { matriculaId: id, origin: 'AUTO_RENOVACAO', empresaId });
    if (!cycleId) throw new Error('COMPLIANCE_MATRICULA_CYCLE_NOT_CREATED');
    await stampLmsEnrollmentEvidenceProfile(db, {
      empresaId, matriculaId: id, funcionarioId: person.id, qualificacaoTipoId: rule.qualificacao_tipo_id,
    });
    await registrarAuditoria({
      db, tabela: 'lms_matriculas', acao: 'INSERT', registro_id: id,
      dados_novos: { empresa_id: empresaId, curso_id: cursoId, origem: 'COMPLIANCE_RULE_SAVE' },
      ...audit,
    });
    summary.created++;
  }
  return summary;
}


export async function reconcileTrainingComplianceRuleEnrollment<TAccess>(
  db: D1Database,
  empresaId: number,
  ruleId: number,
  access: TAccess,
  audit: ReturnType<typeof extrairUsuarioAuditoria>,
  buildSnapshot: (db: D1Database, empresaId: number, access: TAccess) => Promise<EnrollmentSnapshot>,
): Promise<{ auto_enrollment: EnrollmentSummary | null; auto_enrollment_warning: string | null }> {
  try {
    const summary = await performComplianceRuleEnrollment(
      db, empresaId, ruleId, access, audit, buildSnapshot,
    );
    return {
      auto_enrollment: summary,
      auto_enrollment_warning: summary.unavailable_course ? 'LMS_COURSE_MAPPING_UNAVAILABLE' : null,
    };
  } catch {
    // Saving a requirement is durable. The caller must not claim a successful
    // enrollment sync after a partial failure; the operation is idempotent on retry.
    console.error('[TRAINING_COMPLIANCE] Falha na sincronização após salvar requisito');
    return { auto_enrollment: null, auto_enrollment_warning: 'AUTO_ENROLLMENT_DEFERRED' };
  }
}

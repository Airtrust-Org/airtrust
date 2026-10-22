import { canReuseMatriculaCycle, hasActiveMatriculaCycle, resetMatriculaForNewCycle } from './lms-matricula-cycle';
import { stampLmsEnrollmentEvidenceProfile } from './training-compliance-evidence-profile';
import { trainingComplianceNeedsImmediateEnrollmentOnRuleSave } from './training-compliance-enrollment-policy';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { createComplianceEnrollmentAtomic } from './training-compliance-create-enrollment';

type EnrollmentSnapshot = {
  rules: Array<{ id: number; obrigatoriedade: string; modalidade_requerida: string | null; auto_matricular_ead: number | null; qualificacao_tipo_id: number }>;
  people: Array<{
    id: number;
    requisitos: Array<{ regra_id: number; obrigatoriedade: string; status_compliance: string; evidencia_pendente_validacao: boolean; modalidade_requerida: string | null; auto_matricular_ead: number | null }>;
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
 * Classify only stable, non-sensitive database failure categories for logs.
 * Do not log raw D1 messages: driver text can contain query or row details.
 */
export function classifyComplianceEnrollmentFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'COMPLIANCE_ATOMIC_SCHEMA_MISSING') return 'SCHEMA_REQUIRED_TABLE_MISSING';
  if (message === 'COMPLIANCE_ATOMIC_POSTCHECK_FAILED') return 'ATOMIC_POSTCHECK_FAILED';
  if (message === 'COMPLIANCE_ATOMIC_ID_MISSING') return 'ATOMIC_ID_MISSING';
  if (/no such table:/i.test(message)) return 'DB_SCHEMA_TABLE_MISSING';
  if (/no such column:/i.test(message)) return 'DB_SCHEMA_COLUMN_MISSING';
  if (/unique constraint failed/i.test(message)) return 'DB_UNIQUE_CONSTRAINT';
  if (/foreign key constraint failed/i.test(message)) return 'DB_FOREIGN_KEY_CONSTRAINT';
  if (/not null constraint failed/i.test(message)) return 'DB_NOT_NULL_CONSTRAINT';
  if (/check constraint failed/i.test(message)) return 'DB_CHECK_CONSTRAINT';
  if (/database is locked|database is busy/i.test(message)) return 'DB_BUSY';
  if (/^D1_ERROR\b/i.test(message)) return 'D1_ERROR';
  return 'UNCLASSIFIED';
}

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
  if (!rule || rule.obrigatoriedade !== 'OBRIGATORIA' || rule.auto_matricular_ead !== 1) return summary;

  // Never fulfill presencial/hybrid/practical regulatory requirements with an LMS launch.
  if (rule.modalidade_requerida !== 'EAD') return summary;

  const applicable = snapshot.people.flatMap((person) =>
    person.requisitos
      .filter((req) => req.regra_id === ruleId && req.obrigatoriedade === 'OBRIGATORIA'
        && req.auto_matricular_ead === 1 && req.modalidade_requerida === 'EAD'
        && !req.evidencia_pendente_validacao)
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
    `SELECT c.id FROM lms_cursos c
      JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
        AND qt.ativo=1 AND qt.deleted_at IS NULL
        AND UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD')
      WHERE c.empresa_id=? AND c.qualificacao_tipo_id=? AND c.ativo=1 AND c.publicado=1
        AND c.deleted_at IS NULL ORDER BY c.id LIMIT 2`,
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
    const id=await createComplianceEnrollmentAtomic(db,{
      empresaId,funcionarioId:person.id,cursoId,qualificacaoTipoId:rule.qualificacao_tipo_id,
      regraId:rule.id,origin:'COMPLIANCE_RULE_SAVE',usuarioId:audit.usuario_id,
      observacoes:'Matrícula automática: requisito de Compliance atualizado (sem e-mail)',
    });
    if (id===null) {summary.preserved++;continue;}
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
  } catch (error) {
    // Saving a requirement is durable. The caller must not claim a successful
    // enrollment sync after a partial failure; the operation is idempotent on retry.
    console.error('[TRAINING_COMPLIANCE] Falha na sincronização após salvar requisito', {
      code: classifyComplianceEnrollmentFailure(error),
    });
    return { auto_enrollment: null, auto_enrollment_warning: 'AUTO_ENROLLMENT_DEFERRED' };
  }
}

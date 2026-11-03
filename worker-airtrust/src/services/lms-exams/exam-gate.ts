/**
 * Server-side gate for the learner exam runtime. Everything is recomputed from
 * D1/R2 on each call: the client never says whether the study is complete.
 * Only the enrollment's own learner passes (admins cannot sit the exam for them).
 */
import { EFFECTIVE_ASSESSMENT_POLICY_SQL } from '../../lib/lms/lms-effective-assessment-policy';
import {
  buildPersistedScormClosureReadiness, isStudyCompleteAwaitingExam,
  type ScormClosureReadiness,
} from '../lms-matricula-runtime-domain';
import { resolveLmsFuncionarioId } from '../lms-learner-identity';
import { loadManifestEvidenceForEnrollment } from '../lms-scorm-completion-context';
import {
  ExamAttemptError, findApprovedExamEvidence,
  type ApprovedExamEvidence, type ExamCycleScope, type ExamLearner,
} from './exam-attempt-store';

export type ExamLearnerState =
  | 'NOT_AVAILABLE' | 'STUDY_PENDING' | 'READY' | 'PASSED' | 'COMPLETED';
export type ExamGate = Readonly<{
  learner: ExamLearner;
  scope: ExamCycleScope | null;
  state: ExamLearnerState;
  /** Pending study requirements (codes only); empty unless STUDY_PENDING. */
  missing: readonly string[];
  attemptsUsed: number;
  hasOpenAttempt: boolean;
  evidence: ApprovedExamEvidence | null;
  readiness: ScormClosureReadiness | null;
}>;

type EnrollmentRow = {
  id: number; status: string; curso_id: number; funcionario_id: number;
  tipo_conteudo: string | null; scorm_package_r2_prefix: string | null;
  scorm_mastery_score: number | null; scorm_assessment_policy: 'SCORED' | 'FORMATIVE' | null;
  active_lms_cycle_id: number | null;
};

export async function loadExamGate(
  env: { DB: D1Database; BUCKET?: R2Bucket },
  ids: Readonly<{ empresaId: number; userId: number; matriculaId: number }>,
): Promise<ExamGate> {
  const { DB: db } = env;
  const learner: ExamLearner = { empresaId: ids.empresaId, userId: ids.userId };
  if (!Number.isSafeInteger(ids.matriculaId) || ids.matriculaId < 1) {
    throw new ExamAttemptError('EXAM_ENROLLMENT_NOT_FOUND');
  }
  const funcionarioId = await resolveLmsFuncionarioId(db, ids.userId, ids.empresaId);
  if (!funcionarioId) throw new ExamAttemptError('EXAM_LEARNER_NOT_LINKED');
  const row = await db.prepare(
    `SELECT m.id, m.status, m.curso_id, m.funcionario_id, c.tipo_conteudo,
            c.scorm_package_r2_prefix, c.scorm_mastery_score, ${EFFECTIVE_ASSESSMENT_POLICY_SQL},
            (SELECT cy.id FROM lms_matricula_ciclos cy
              WHERE cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
                AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL LIMIT 1) AS active_lms_cycle_id
       FROM lms_matriculas m
       JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
      WHERE m.id=? AND m.empresa_id=? AND m.funcionario_id=? AND m.deleted_at IS NULL LIMIT 1`
  ).bind(ids.matriculaId, ids.empresaId, funcionarioId).first<EnrollmentRow>();
  // Same answer for "not yours" and "does not exist": no enumeration of enrollments.
  if (!row) throw new ExamAttemptError('EXAM_ENROLLMENT_NOT_FOUND');
  const none = (state: ExamLearnerState, extra: Partial<ExamGate> = {}): ExamGate => ({
    learner, scope: null, state, missing: [], attemptsUsed: 0, hasOpenAttempt: false, evidence: null, readiness: null, ...extra,
  });
  // Cancelled/rejected enrollments must never continue an old exam simply
  // because the last persisted SCORM evidence still says "completed".
  const enrollmentStatus = String(row.status).toUpperCase();
  if (!['NAO_INICIADO','EM_ANDAMENTO','CONCLUIDO'].includes(enrollmentStatus)) return none('NOT_AVAILABLE');
  if (String(row.tipo_conteudo ?? 'scorm').toLowerCase() !== 'scorm' ||
      !row.scorm_package_r2_prefix || !row.active_lms_cycle_id) return none('NOT_AVAILABLE');

  const pkg = await db.prepare(
    "SELECT package_sha256 FROM lms_scorm_package_versions WHERE empresa_id=? AND curso_id=? " +
    "AND status<>'REJECTED' AND rtrim(r2_prefix,'/')=rtrim(?,'/') LIMIT 1"
  ).bind(ids.empresaId, row.curso_id, row.scorm_package_r2_prefix)
    .first<{ package_sha256: string }>();
  if (!pkg?.package_sha256) return none('NOT_AVAILABLE');
  const scope: ExamCycleScope = {
    cursoId: row.curso_id, matriculaId: row.id,
    cicloId: row.active_lms_cycle_id, packageSha256: pkg.package_sha256,
  };
  const binding = await db.prepare(
    'SELECT 1 AS ok FROM lms_exam_edition_bindings WHERE empresa_id=? AND curso_id=? AND package_sha256=? LIMIT 1'
  ).bind(ids.empresaId, row.curso_id, pkg.package_sha256).first<{ ok: number }>();
  if (!binding) return none('NOT_AVAILABLE');

  const stats = await db.prepare(
    "SELECT COUNT(CASE WHEN state='SUBMITTED' THEN 1 END) AS used, " +
    "MAX(CASE WHEN state='IN_PROGRESS' AND started_by=? AND package_sha256=? THEN 1 ELSE 0 END) AS has_open " +
    "FROM lms_exam_attempts WHERE empresa_id=? AND matricula_id=? AND ciclo_id=?"
  ).bind(ids.userId, pkg.package_sha256, ids.empresaId, row.id, row.active_lms_cycle_id)
    .first<{ used: number; has_open: number | null }>();
  const attemptsUsed = Number(stats?.used ?? 0);
  const hasOpenAttempt = Number(stats?.has_open ?? 0) === 1;
  if (String(row.status).toUpperCase() === 'CONCLUIDO') {
    return none('COMPLETED', { scope, attemptsUsed, hasOpenAttempt: false });
  }
  const evidence = await findApprovedExamEvidence(db, {
    empresaId: ids.empresaId, matriculaId: row.id, activePackagePrefix: row.scorm_package_r2_prefix,
  });
  if (evidence) return none('PASSED', { scope, attemptsUsed, hasOpenAttempt: false, evidence });

  const progresso = await db.prepare(
    'SELECT * FROM lms_progresso_scorm WHERE matricula_id=? AND empresa_id=?'
  ).bind(row.id, ids.empresaId).first<Record<string, unknown>>();
  const manifest = await loadManifestEvidenceForEnrollment(env.BUCKET, {
    id: row.id, curso_id: row.curso_id, cicloId: row.active_lms_cycle_id,
    scorm_package_r2_prefix: row.scorm_package_r2_prefix, tipo_conteudo: row.tipo_conteudo,
  }, ids.empresaId,
  typeof progresso?.cmi_json === 'string' ? progresso.cmi_json : null,
  typeof progresso?.suspend_data === 'string' ? progresso.suspend_data : null, db);
  const readiness = buildPersistedScormClosureReadiness({
    status: row.status, scorm_assessment_policy: row.scorm_assessment_policy,
    scorm_mastery_score: row.scorm_mastery_score,
  }, progresso ?? null, manifest);
  const ready = isStudyCompleteAwaitingExam(readiness);
  return none(ready ? 'READY' : 'STUDY_PENDING', {
    scope, attemptsUsed, hasOpenAttempt: ready && hasOpenAttempt, readiness, missing: ready ? [] : readiness.missing,
  });
}

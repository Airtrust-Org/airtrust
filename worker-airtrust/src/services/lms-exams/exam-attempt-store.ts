/**
 * LMS external exam persistence V1 — plans, edition binding, learner attempts.
 * Private Worker service: callers (routes) MUST authenticate, resolve the tenant,
 * prove the learner owns the enrollment and that the study evidence is complete
 * (see isStudyCompleteAwaitingExam) BEFORE calling the learner functions.
 * Grading runs here from private published answer keys. A passed attempt is
 * evidence for the canonical completion writer; nothing here completes an
 * enrollment, creates a qualification or a certificate.
 */
import {
  type ExamAnswer, type ExamPlan, type QuestionRevision,
  EXAM_PLAN_SCHEMA, gradeExternalExam, learnerQuestion, validateExamPlan,
} from '../../lib/lms-exams/question-bank-domain';
import { loadPublishedQuestions } from './question-bank-store';

export class ExamAttemptError extends Error {
  constructor(public readonly code: string) {
    super(code); this.name = 'ExamAttemptError';
  }
}
function deny(code: string): never { throw new ExamAttemptError(code); }

export type ExamAdminActor = Readonly<{ empresaId: number; userId: number; tenantRole: string }>;
export type ExamLearner = Readonly<{ empresaId: number; userId: number }>;
export type ExamCycleScope = Readonly<{
  cursoId: number; matriculaId: number; cicloId: number; packageSha256: string;
}>;
export type ApprovedExamEvidence = Readonly<{ attemptId: string; planSha256: string }>;
export type LearnerAttemptView = Readonly<{
  attemptId: string; attemptNo: number; state: 'IN_PROGRESS' | 'SUBMITTED';
  examId: string; examVersion: number;
  sections: readonly Readonly<{
    moduleId: string;
    questions: readonly Readonly<{
      questionId: string; revision: number; prompt: string;
      choices: readonly Readonly<{ id: string; text: string }>[];
    }>[];
  }>[];
  answers: Readonly<Record<string, string>>;
  result: Readonly<{
    passed: boolean; answered: number; unanswered: number;
    sections: readonly Readonly<{ moduleId: string; scorePct: number; passed: boolean }>[];
  }> | null;
}>;

type AttemptRow = {
  id: string; empresa_id: number; curso_id: number; matricula_id: number; ciclo_id: number;
  attempt_no: number; package_sha256: string; exam_id: string; exam_version: number;
  plan_sha256: string; state: 'IN_PROGRESS' | 'SUBMITTED'; started_by: number;
  passed: number | null; result_json: string | null;
};
const ATTEMPT_COLUMNS = 'id,empresa_id,curso_id,matricula_id,ciclo_id,attempt_no,package_sha256,' +
  'exam_id,exam_version,plan_sha256,state,started_by,passed,result_json';
const SHA = /^[a-f0-9]{64}$/;
const IDEM = /^[A-Za-z0-9._:-]{8,80}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function positive(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x > 0;
}
function requireAdmin(a: ExamAdminActor): void {
  if (!a || !positive(a.empresaId) || !positive(a.userId) || a.tenantRole !== 'admin') {
    deny('EXAM_ADMIN_RBAC_REQUIRED');
  }
}
function requireLearner(l: ExamLearner): void {
  if (!l || !positive(l.empresaId) || !positive(l.userId)) deny('EXAM_LEARNER_SCOPE_INVALID');
}
function requireScope(s: ExamCycleScope): void {
  if (!s || !positive(s.cursoId) || !positive(s.matriculaId) || !positive(s.cicloId) ||
      !SHA.test(s.packageSha256)) deny('EXAM_CYCLE_SCOPE_INVALID');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
/** Surfaces trigger codes (LMS_EXAM_*) and unique violations; never leaks SQL. */
function mapDbError(error: unknown, uniqueCode: string): never {
  const message = error instanceof Error ? error.message : String(error);
  const trigger = /LMS_EXAM_[A-Z_]+/.exec(message);
  if (trigger) deny(trigger[0]);
  if (/UNIQUE|PRIMARY KEY|constraint failed/i.test(message)) deny(uniqueCode);
  throw error;
}

export async function publishExamPlan(db: D1Database, actor: ExamAdminActor,
  plan: ExamPlan): Promise<Readonly<{ planSha256: string }>> {
  requireAdmin(actor);
  if (!plan || plan.schema !== EXAM_PLAN_SCHEMA || plan.tenantId !== actor.empresaId ||
      !Array.isArray(plan.sections)) deny('EXAM_PLAN_TENANT_MISMATCH');
  const refs = plan.sections.flatMap(s => Array.isArray(s?.questions) ? s.questions : []);
  const questions = await loadPublishedQuestions(
    db, { empresaId: actor.empresaId, cursoId: plan.courseId }, refs);
  await validateExamPlan(plan, questions);
  const planSha256 = await sha256Hex(canonical(plan));
  try {
    await db.prepare(
      'INSERT INTO lms_exam_plans (empresa_id,curso_id,exam_id,version,plan_json,plan_sha256,published_by) ' +
      'VALUES (?,?,?,?,?,?,?)'
    ).bind(actor.empresaId, plan.courseId, plan.examId, plan.version,
      canonical(plan), planSha256, 'u' + actor.userId).run();
  } catch (error) { mapDbError(error, 'EXAM_PLAN_ALREADY_PUBLISHED'); }
  return { planSha256 };
}

export async function bindExamToEdition(db: D1Database, actor: ExamAdminActor, input: Readonly<{
  cursoId: number; examId: string; version: number; packageSha256: string;
  statutoryAssessmentRequired: boolean; approvalNote: string;
}>): Promise<Readonly<{ bindingId: string }>> {
  requireAdmin(actor);
  if (!input || !positive(input.cursoId) || !ID.test(input.examId) || !positive(input.version) ||
      !SHA.test(input.packageSha256) || typeof input.approvalNote !== 'string') {
    deny('EXAM_BINDING_INPUT_INVALID');
  }
  // Fail closed: the legal requirement must be classified, never defaulted.
  if (typeof input.statutoryAssessmentRequired !== 'boolean') {
    deny('EXAM_STATUTORY_CLASSIFICATION_REQUIRED');
  }
  const row = await db.prepare(
    'SELECT plan_json,plan_sha256 FROM lms_exam_plans ' +
    'WHERE empresa_id=? AND curso_id=? AND exam_id=? AND version=? LIMIT 1'
  ).bind(actor.empresaId, input.cursoId, input.examId, input.version)
    .first<{ plan_json: string; plan_sha256: string }>();
  if (!row) deny('EXAM_PLAN_NOT_FOUND');
  const plan = await parseStoredPlan(row, actor.empresaId, input.cursoId);
  if (plan.trainingSourceSha256 !== input.packageSha256) deny('EXAM_BINDING_PACKAGE_PLAN_MISMATCH');
  const bindingId = crypto.randomUUID();
  try {
    await db.prepare(
      'INSERT INTO lms_exam_edition_bindings (id,empresa_id,curso_id,package_sha256,exam_id,' +
      'exam_version,plan_sha256,statutory_assessment_required,approver_id,approval_note) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(bindingId, actor.empresaId, input.cursoId, input.packageSha256, input.examId,
      input.version, row.plan_sha256, input.statutoryAssessmentRequired ? 1 : 0,
      actor.userId, input.approvalNote).run();
  } catch (error) { mapDbError(error, 'EXAM_EDITION_ALREADY_BOUND'); }
  return { bindingId };
}

async function parseStoredPlan(row: { plan_json: string; plan_sha256: string },
  empresaId: number, cursoId: number): Promise<ExamPlan> {
  let plan: ExamPlan;
  try { plan = JSON.parse(row.plan_json) as ExamPlan; } catch { return deny('EXAM_PLAN_CORRUPT'); }
  if (!plan || plan.tenantId !== empresaId || plan.courseId !== cursoId ||
      await sha256Hex(canonical(plan)) !== row.plan_sha256) deny('EXAM_PLAN_HASH_MISMATCH');
  return plan;
}
async function loadPlan(db: D1Database, a: AttemptRow): Promise<ExamPlan> {
  const row = await db.prepare(
    'SELECT plan_json,plan_sha256 FROM lms_exam_plans ' +
    'WHERE empresa_id=? AND curso_id=? AND exam_id=? AND version=? AND plan_sha256=? LIMIT 1'
  ).bind(a.empresa_id, a.curso_id, a.exam_id, a.exam_version, a.plan_sha256)
    .first<{ plan_json: string; plan_sha256: string }>();
  if (!row) deny('EXAM_PLAN_NOT_FOUND');
  return parseStoredPlan(row, a.empresa_id, a.curso_id);
}
async function loadAttempt(db: D1Database, learner: ExamLearner, attemptId: string): Promise<AttemptRow> {
  if (typeof attemptId !== 'string' || attemptId.length < 16 || attemptId.length > 64) {
    deny('EXAM_ATTEMPT_NOT_FOUND');
  }
  const row = await db.prepare(
    `SELECT ${ATTEMPT_COLUMNS} FROM lms_exam_attempts WHERE id=? AND empresa_id=? LIMIT 1`
  ).bind(attemptId, learner.empresaId).first<AttemptRow>();
  if (!row) deny('EXAM_ATTEMPT_NOT_FOUND');
  if (row.started_by !== learner.userId) deny('EXAM_ATTEMPT_FORBIDDEN');
  return row;
}
/**
 * Retrieve the exact immutable attempt scope, after checking learner ownership.
 * Used by learner HTTP routes to recheck the active enrollment/cycle/edition
 * before every mutation. Never infer enrollment from untrusted request bodies.
 */
export async function getExamAttemptScope(db: D1Database, learner: ExamLearner,
  attemptId: string): Promise<Readonly<{
  scope: ExamCycleScope; state: 'IN_PROGRESS' | 'SUBMITTED';
}>> {
  requireLearner(learner);
  const a = await loadAttempt(db, learner, attemptId);
  return {
    scope: { cursoId: a.curso_id, matriculaId: a.matricula_id,
      cicloId: a.ciclo_id, packageSha256: a.package_sha256 },
    state: a.state,
  };
}

async function loadAnswers(db: D1Database, a: AttemptRow): Promise<Record<string, string>> {
  const rows = await db.prepare(
    'SELECT question_key,choice_id FROM lms_exam_attempt_responses WHERE attempt_id=? AND empresa_id=?'
  ).bind(a.id, a.empresa_id).all<{ question_key: string; choice_id: string }>();
  return Object.fromEntries((rows.results || []).map(r => [r.question_key, r.choice_id]));
}

async function buildView(db: D1Database, a: AttemptRow): Promise<LearnerAttemptView> {
  const plan = await loadPlan(db, a);
  const questions = await loadPublishedQuestions(db,
    { empresaId: a.empresa_id, cursoId: a.curso_id },
    plan.sections.flatMap(s => s.questions));
  const byKey = new Map(questions.map(q => [q.questionId, q]));
  const sections = plan.sections.map(s => ({
    moduleId: s.moduleId,
    questions: s.questions.map(ref => {
      const q = learnerQuestion(byKey.get(ref.questionId) as QuestionRevision);
      return { questionId: q.questionId, revision: q.revision, prompt: q.prompt, choices: q.choices };
    }),
  }));
  let result: LearnerAttemptView['result'] = null;
  if (a.state === 'SUBMITTED' && a.result_json) {
    const r = JSON.parse(a.result_json) as NonNullable<LearnerAttemptView['result']>;
    // Score percentages only: the answer key and the picked choices are not echoed.
    result = {
      passed: r.passed, answered: r.answered, unanswered: r.unanswered,
      sections: r.sections.map(x => ({ moduleId: x.moduleId, scorePct: x.scorePct, passed: x.passed })),
    };
  }
  return {
    attemptId: a.id, attemptNo: a.attempt_no, state: a.state,
    examId: a.exam_id, examVersion: a.exam_version,
    sections, answers: await loadAnswers(db, a), result,
  };
}

export async function startExamAttempt(db: D1Database, learner: ExamLearner,
  scope: ExamCycleScope, idempotencyKey: string): Promise<LearnerAttemptView> {
  requireLearner(learner); requireScope(scope);
  if (typeof idempotencyKey !== 'string' || !IDEM.test(idempotencyKey)) deny('EXAM_IDEMPOTENCY_KEY_INVALID');
  const checkedReplay = (r: AttemptRow): Promise<LearnerAttemptView> => {
    // A content replacement must never turn into a misleading access-denied
    // or silently reopen the attempt for a different package in the same cycle.
    if (r.started_by !== learner.userId || r.curso_id !== scope.cursoId) {
      deny('EXAM_ATTEMPT_FORBIDDEN');
    }
    if (r.package_sha256 !== scope.packageSha256) {
      deny('EXAM_ATTEMPT_EDITION_CHANGED');
    }
    return buildView(db, r);
  };
  const reuse = async (): Promise<LearnerAttemptView | null> => {
    const replay = await db.prepare(
      `SELECT ${ATTEMPT_COLUMNS} FROM lms_exam_attempts ` +
      'WHERE empresa_id=? AND matricula_id=? AND ciclo_id=? AND idempotency_key=? LIMIT 1'
    ).bind(learner.empresaId, scope.matriculaId, scope.cicloId, idempotencyKey).first<AttemptRow>();
    if (replay) return checkedReplay(replay);
    const open = await db.prepare(
      `SELECT ${ATTEMPT_COLUMNS} FROM lms_exam_attempts ` +
      "WHERE empresa_id=? AND matricula_id=? AND ciclo_id=? AND state='IN_PROGRESS' LIMIT 1"
    ).bind(learner.empresaId, scope.matriculaId, scope.cicloId).first<AttemptRow>();
    if (open) return checkedReplay(open);
    return null;
  };
  const existing = await reuse();
  if (existing) return existing;
  const binding = await db.prepare(
    'SELECT exam_id,exam_version,plan_sha256 FROM lms_exam_edition_bindings ' +
    'WHERE empresa_id=? AND curso_id=? AND package_sha256=? LIMIT 1'
  ).bind(learner.empresaId, scope.cursoId, scope.packageSha256)
    .first<{ exam_id: string; exam_version: number; plan_sha256: string }>();
  if (!binding) deny('EXAM_NOT_BOUND_TO_EDITION');
  const attemptId = crypto.randomUUID();
  try {
    await db.prepare(
      'INSERT INTO lms_exam_attempts (id,empresa_id,curso_id,matricula_id,ciclo_id,attempt_no,' +
      'package_sha256,exam_id,exam_version,plan_sha256,idempotency_key,started_by) ' +
      'SELECT ?,?,?,?,?,COALESCE(MAX(attempt_no),0)+1,?,?,?,?,?,? FROM lms_exam_attempts ' +
      'WHERE empresa_id=? AND matricula_id=? AND ciclo_id=?'
    ).bind(attemptId, learner.empresaId, scope.cursoId, scope.matriculaId, scope.cicloId,
      scope.packageSha256, binding.exam_id, binding.exam_version, binding.plan_sha256,
      idempotencyKey, learner.userId,
      learner.empresaId, scope.matriculaId, scope.cicloId).run();
  } catch (error) {
    // A concurrent start by the same learner resolves to the winner's attempt.
    const winner = await reuse().catch(() => null);
    if (winner) return winner;
    mapDbError(error, 'EXAM_ATTEMPT_CONFLICT');
  }
  const created = await loadAttempt(db, learner, attemptId);
  return buildView(db, created);
}

export async function saveExamResponse(db: D1Database, learner: ExamLearner,
  attemptId: string, questionKey: string, choiceId: string): Promise<Readonly<{ saved: true }>> {
  requireLearner(learner);
  if (typeof questionKey !== 'string' || !ID.test(questionKey) ||
      typeof choiceId !== 'string' || !ID.test(choiceId)) deny('EXAM_ANSWER_INVALID');
  const attempt = await loadAttempt(db, learner, attemptId);
  if (attempt.state !== 'IN_PROGRESS') deny('EXAM_ATTEMPT_SEALED');
  const plan = await loadPlan(db, attempt);
  const ref = plan.sections.flatMap(s => s.questions).find(q => q.questionId === questionKey);
  if (!ref) deny('EXAM_ANSWER_INVALID');
  const [question] = await loadPublishedQuestions(db,
    { empresaId: attempt.empresa_id, cursoId: attempt.curso_id }, [ref]);
  if (!question.choices.some(c => c.id === choiceId)) deny('EXAM_ANSWER_INVALID');
  try {
    await db.prepare(
      'INSERT INTO lms_exam_attempt_responses (attempt_id,empresa_id,question_key,choice_id) ' +
      'VALUES (?,?,?,?) ON CONFLICT(attempt_id,question_key) DO UPDATE SET ' +
      "choice_id=excluded.choice_id,answered_at=datetime('now')"
    ).bind(attempt.id, attempt.empresa_id, questionKey, choiceId).run();
  } catch (error) { mapDbError(error, 'EXAM_ATTEMPT_CONFLICT'); }
  return { saved: true };
}

export async function submitExamAttempt(db: D1Database, learner: ExamLearner,
  attemptId: string): Promise<LearnerAttemptView> {
  requireLearner(learner);
  const attempt = await loadAttempt(db, learner, attemptId);
  if (attempt.state === 'SUBMITTED') return buildView(db, attempt); // replay: same verdict
  const plan = await loadPlan(db, attempt);
  const questions = await loadPublishedQuestions(db,
    { empresaId: attempt.empresa_id, cursoId: attempt.curso_id },
    plan.sections.flatMap(s => s.questions));
  const saved = await loadAnswers(db, attempt);
  const answers: ExamAnswer[] = Object.entries(saved)
    .map(([questionId, choiceId]) => ({ questionId, choiceId }));
  const graded = await gradeExternalExam(plan, questions, answers);
  const result = JSON.stringify({
    passed: graded.passed, answered: graded.answered, unanswered: graded.unanswered,
    sections: graded.sections,
  });
  let changes = 0;
  try {
    const run = await db.prepare(
      "UPDATE lms_exam_attempts SET state='SUBMITTED',submitted_at=datetime('now'),passed=?,result_json=? " +
      "WHERE id=? AND empresa_id=? AND state='IN_PROGRESS'"
    ).bind(graded.passed ? 1 : 0, result, attempt.id, attempt.empresa_id).run();
    changes = Number(run.meta?.changes ?? 0);
  } catch (error) { mapDbError(error, 'EXAM_ATTEMPT_CONFLICT'); }
  const fresh = await loadAttempt(db, learner, attemptId);
  if (changes !== 1 && fresh.state !== 'SUBMITTED') deny('EXAM_ATTEMPT_CONFLICT');
  return buildView(db, fresh);
}

/**
 * Evidence the readiness checklist consumes: a passed, sealed attempt in the
 * ACTIVE cycle, on the edition currently served for the course. Never throws:
 * any failure (including schema 0572 not yet applied) means "no evidence".
 */
export async function findApprovedExamEvidence(db: D1Database, params: Readonly<{
  empresaId: number; matriculaId: number; activePackagePrefix: unknown;
}>): Promise<ApprovedExamEvidence | null> {
  try {
    if (!positive(params.empresaId) || !positive(params.matriculaId) ||
        typeof params.activePackagePrefix !== 'string' || !params.activePackagePrefix.trim()) return null;
    const row = await db.prepare(
      'SELECT a.id AS attempt_id,a.plan_sha256 AS plan_sha256 FROM lms_exam_attempts a ' +
      'JOIN lms_matricula_ciclos ci ON ci.id=a.ciclo_id AND ci.empresa_id=a.empresa_id ' +
      'AND ci.matricula_id=a.matricula_id AND ci.ciclo_atual=1 AND ci.deleted_at IS NULL ' +
      'JOIN lms_exam_edition_bindings b ON b.empresa_id=a.empresa_id AND b.curso_id=a.curso_id ' +
      'AND b.package_sha256=a.package_sha256 AND b.plan_sha256=a.plan_sha256 ' +
      'JOIN lms_scorm_package_versions p ON p.empresa_id=a.empresa_id AND p.curso_id=a.curso_id ' +
      "AND p.package_sha256=a.package_sha256 AND p.status<>'REJECTED' " +
      "WHERE a.empresa_id=? AND a.matricula_id=? AND a.state='SUBMITTED' AND a.passed=1 " +
      "AND rtrim(p.r2_prefix,'/')=rtrim(?,'/') LIMIT 1"
    ).bind(params.empresaId, params.matriculaId, params.activePackagePrefix)
      .first<{ attempt_id: string; plan_sha256: string }>();
    // Shape check: only a real attempt row with a valid plan hash counts as evidence.
    if (!row || typeof row.attempt_id !== 'string' || row.attempt_id.length < 16 ||
        typeof row.plan_sha256 !== 'string' || !SHA.test(row.plan_sha256)) return null;
    return { attemptId: row.attempt_id, planSha256: row.plan_sha256 };
  } catch {
    return null;
  }
}

/**
 * AirTrust Player 3: independent, server-only deterministic learning/assessment
 * domain. It does NOT interpret DOM counters or SCORM completion messages.
 * It does NOT publish files, mutate D1, or issue certificates.
 * Persisted inputs must originate from a tenant-checked, edition-pinned ledger.
 */
export type StageType = 'content' | 'practice' | 'module_exam' | 'final_exam';
export type CertMode = 'MODULE_CERTIFIED' | 'FINAL_CERTIFIED' | 'ATTENDANCE_ONLY';
export type Stage = Readonly<{ id: string; type: StageType; required: boolean }>;
export type Policy = Readonly<{
  schema: 'AIRTRUST_PLAYER3_POLICY_V1';
  courseId: string;
  editionSha256: string;
  certificationMode: CertMode;
  masteryScore: number | null;
  stages: readonly Stage[];
}>;
export type PrivateQuestion = Readonly<{
  id: string;
  stageId: string;
  options: readonly string[];
  correctOptionId: string;
  feedbackCorrect: string;
  feedbackIncorrect: string;
}>;
export type Answer = Readonly<{ questionId: string; optionId: string }>;
export type ExamVerdict = Readonly<{
  stageId: string; passed: boolean; scorePct: number; correct: number; total: number;
}>;
export type PersistedStage = Readonly<{ id: string; result: 'VIEWED' | 'PRACTICED' | 'PASSED' }>;
export type PersistedAttempt = Readonly<{
  stageId: string; scorePct: number; passed: boolean; editionSha256: string;
}>;
export type PersistedEnrollment = Readonly<{
  enrollmentId: number; tenantId: number; courseId: string; editionSha256: string;
  cycleId: number; status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  stages: readonly PersistedStage[]; exams: readonly PersistedAttempt[];
}>;
const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const digest = /^[a-f0-9]{64}$/;
export class Player3ValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'Player3ValidationError'; this.code = code; }
}
function fail(code: string): never { throw new Player3ValidationError(code); }
function unique(ids: readonly string[]): boolean { return new Set(ids).size === ids.length; }
export function validatePolicy(input: Policy): Policy {
  if (!input || input.schema !== 'AIRTRUST_PLAYER3_POLICY_V1' ||
      !id.test(input.courseId) || !digest.test(input.editionSha256) ||
      !Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > 500 ||
      !input.stages.every(s => s && id.test(s.id) &&
        ['content','practice','module_exam','final_exam'].includes(s.type) &&
        typeof s.required === 'boolean') ||
      !unique(input.stages.map(s=>s.id))) fail('PLAYER3_INVALID_POLICY');
  const modes: CertMode[]=['MODULE_CERTIFIED','FINAL_CERTIFIED','ATTENDANCE_ONLY'];
  if (!modes.includes(input.certificationMode)) fail('PLAYER3_INVALID_MODE');
  const requiredExams=input.stages.filter(s=>s.required &&
    (s.type==='module_exam' || s.type==='final_exam'));
  if (input.certificationMode === 'MODULE_CERTIFIED' &&
    (!requiredExams.length || requiredExams.some(s=>s.type!=='module_exam'))) {
    fail('PLAYER3_INVALID_MODULE_EXAMS');
  }
  if (input.certificationMode === 'FINAL_CERTIFIED' &&
    (requiredExams.length !== 1 || requiredExams[0].type!=='final_exam')) {
    fail('PLAYER3_INVALID_FINAL_EXAM');
  }
  if (input.certificationMode === 'ATTENDANCE_ONLY' && requiredExams.length) {
    fail('PLAYER3_INVALID_ATTENDANCE');
  }
  if (input.certificationMode === 'ATTENDANCE_ONLY'
      ? input.masteryScore !== null
      : !Number.isInteger(input.masteryScore) || input.masteryScore! < 1 || input.masteryScore! > 100) {
    fail('PLAYER3_INVALID_MASTERY');
  }
  return input;
}
function validateAnswers(privateQuestions: readonly PrivateQuestion[], submission: readonly Answer[]) {
  if (!Array.isArray(submission) || submission.length !== privateQuestions.length ||
      !unique(submission.map(a=>a?.questionId))) fail('PLAYER3_INVALID_ANSWERS');
  const expected=new Map(privateQuestions.map(q=>[q.id,q]));
  for (const a of submission) {
    if (!a || Object.keys(a).length !== 2 || typeof a.questionId !== 'string' ||
        typeof a.optionId !== 'string') fail('PLAYER3_INVALID_ANSWER_ENTRY');
    const q=expected.get(a.questionId);
    if (!q || !q.options.includes(a.optionId)) fail('PLAYER3_INVALID_ANSWER_ENTRY');
  }
}
export function gradeOfficialAttempt(
  policy: Policy, bank: readonly PrivateQuestion[], stageId: string, answers: readonly Answer[],
): ExamVerdict {
  validatePolicy(policy);
  const stage=policy.stages.find(s=>s.id===stageId);
  if (!stage || (stage.type!=='module_exam' && stage.type!=='final_exam') ||
      (policy.certificationMode==='MODULE_CERTIFIED' && stage.type!=='module_exam') ||
      (policy.certificationMode==='FINAL_CERTIFIED' && stage.type!=='final_exam') ||
      policy.certificationMode==='ATTENDANCE_ONLY') fail('PLAYER3_NOT_AN_OFFICIAL_EXAM');
  const questions=bank.filter(q=>q.stageId===stageId);
  if (!questions.length || !unique(questions.map(q=>q.id)) ||
      questions.some(q=>!id.test(q.id) || !q.options.includes(q.correctOptionId) ||
        !unique(q.options) || q.options.length<2)) fail('PLAYER3_INVALID_PRIVATE_BANK');
  validateAnswers(questions,answers);
  const byId=new Map(answers.map(a=>[a.questionId,a.optionId]));
  const correct=questions.filter(q=>byId.get(q.id)===q.correctOptionId).length;
  return {stageId,correct,total:questions.length,
    scorePct:Math.round(correct*100/questions.length),
    passed:correct*100 >= (policy.masteryScore as number)*questions.length};
}
export function checkPractice(
  policy: Policy, bank: readonly PrivateQuestion[], stageId:string, answer: Answer,
): Readonly<{correct:boolean;feedback:string}> {
  validatePolicy(policy);
  if (!policy.stages.some(s=>s.id===stageId && s.type==='practice'))
    fail('PLAYER3_NOT_PRACTICE');
  const question=bank.find(q=>q.stageId===stageId && q.id===answer?.questionId);
  if (!question || !question.options.includes(answer.optionId)) fail('PLAYER3_INVALID_PRACTICE');
  const correct=question.correctOptionId===answer.optionId;
  return {correct, feedback:correct?question.feedbackCorrect:question.feedbackIncorrect};
}
export type Readiness = Readonly<{ready:boolean;code:string}>;
/** Readiness is NOT a completion write. The canonical transactional writer must
 * recheck tenant, cycle, edition, attempt receipts and qualification at commit.
 */
export function readiness(policy: Policy, e:PersistedEnrollment): Readiness {
  validatePolicy(policy);
  if (![e.enrollmentId,e.tenantId,e.cycleId].every(n=>Number.isSafeInteger(n)&&n>0))
    return {ready:false,code:'INVALID_ENROLLMENT_IDENTITY'};
  if (e.courseId!==policy.courseId || e.editionSha256!==policy.editionSha256)
    return {ready:false,code:'EDITION_OR_COURSE_MISMATCH'};
  if (e.status!=='IN_PROGRESS') return {ready:false,code:'ENROLLMENT_NOT_ACTIVE'};
  const validIds=new Set(policy.stages.map(s=>s.id));
  if (!Array.isArray(e.stages) || !unique(e.stages.map(s=>s.id)) ||
      e.stages.some(s=>!validIds.has(s.id) ||
        !['VIEWED','PRACTICED','PASSED'].includes(s.result)) ||
      !Array.isArray(e.exams) || !unique(e.exams.map(x=>x.stageId)) ||
      e.exams.some(x=>x.editionSha256!==policy.editionSha256 ||
        !validIds.has(x.stageId) || !Number.isFinite(x.scorePct) ||
        x.scorePct<0 || x.scorePct>100 || typeof x.passed!=='boolean')) {
    return {ready:false,code:'INVALID_LEDGER'};
  }
  const s=new Map(e.stages.map(x=>[x.id,x.result]));
  const x=new Map(e.exams.map(x=>[x.stageId,x]));
  for(const stage of policy.stages.filter(s=>s.required)) {
    if (stage.type==='content' && !s.has(stage.id))
      return {ready:false,code:'CONTENT_EVIDENCE_MISSING'};
    if (stage.type==='practice' && s.get(stage.id)!=='PRACTICED')
      return {ready:false,code:'PRACTICE_EVIDENCE_MISSING'};
    if (stage.type==='module_exam' || stage.type==='final_exam') {
      const attempt=x.get(stage.id);
      if (!attempt || !attempt.passed || !Number.isInteger(attempt.scorePct) ||
          attempt.scorePct < (policy.masteryScore as number))
        return {ready:false,code:'OFFICIAL_EXAM_NOT_PASSED'};
    }
  }
  return {ready:true,code:'READY_FOR_CANONICAL_TRANSACTION'};
}
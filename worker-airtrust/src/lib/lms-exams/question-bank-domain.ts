/**
 * Independent AirTrust Question Bank V1. Pure, Worker-only authoring contracts.
 * No D1 write, API publication, LMS completion or certificate authority here.
 * Persist transitions under tenant-scoped transactions and an append-only audit.
 */
export const QUESTION_BANK_SCHEMA = 'AIRTRUST_QUESTION_BANK_REVISION_V1' as const;
export const EXAM_PLAN_SCHEMA = 'AIRTRUST_EXTERNAL_EXAM_PLAN_V1' as const;
export type QuestionStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED';
export type Choice = Readonly<{ id: string; text: string }>;
export type QuestionContent = Readonly<{
  moduleId: string; topicId: string; sourceUnitId: string;
  sourceSha256: string; prompt: string; choices: readonly Choice[];
  correctChoiceId: string; explanation: string;
}>;
export type QuestionRevision = Readonly<QuestionContent & {
  schema: typeof QUESTION_BANK_SCHEMA;
  tenantId: number; courseId: number; questionId: string; revision: number;
  status: QuestionStatus; createdBy: string; lastEditedBy: string;
  reviewedBy: string | null; publishedBy: string | null;
  contentSha256: string | null;
}>;
export type QuestionScope = Readonly<{
  tenantId: number; courseId: number; questionId: string;
}>;
export type ExamQuestionRef = Readonly<{
  questionId: string; revision: number; contentSha256: string;
}>;
export type ExamSection = Readonly<{
  moduleId: string; minScorePct: number; questions: readonly ExamQuestionRef[];
}>;
export type ExamPlan = Readonly<{
  schema: typeof EXAM_PLAN_SCHEMA;
  tenantId: number; courseId: number; examId: string; version: number;
  trainingSourceSha256: string; trainingEditionSha256: string;
  consultationAllowed: true; sections: readonly ExamSection[];
}>;
export type ExamAnswer = Readonly<{ questionId: string; choiceId: string }>;
export type ExamResult = Readonly<{
  examId: string; examVersion: number; passed: boolean;
  sections: readonly Readonly<{
    moduleId: string; correct: number; total: number;
    scorePct: number; passed: boolean;
  }>[];
  grantsCompletion: false; grantsCertificate: false;
}>;

export class QuestionBankError extends Error {
  constructor(public readonly code: string) {
    super(code); this.name = 'QuestionBankError';
  }
}
const deny = (code: string): never => { throw new QuestionBankError(code); };
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const SHA = /^[a-f0-9]{64}$/;
const safeId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
const safeInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0;
const safeText = (x: unknown, max: number) =>
  typeof x === 'string' && x.trim().length > 0 && x.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(x);
const contentKeys: readonly (keyof QuestionContent)[] = [
  'moduleId', 'topicId', 'sourceUnitId', 'sourceSha256',
  'prompt', 'choices', 'correctChoiceId', 'explanation',
];
function validContent(c: QuestionContent): void {
  if (!c || !safeId(c.moduleId) || !safeId(c.topicId) ||
      !safeId(c.sourceUnitId) || !SHA.test(c.sourceSha256) ||
      !safeText(c.prompt, 3000) || !safeText(c.explanation, 3000) ||
      !Array.isArray(c.choices) || c.choices.length < 2 || c.choices.length > 8 ||
      c.choices.some(o => !o || !safeId(o.id) || !safeText(o.text, 700)) ||
      new Set(c.choices.map(o => o.id)).size !== c.choices.length ||
      !safeId(c.correctChoiceId) ||
      !c.choices.some(o => o.id === c.correctChoiceId)) {
    deny('INVALID_QUESTION_CONTENT');
  }
}
export function validateQuestionRevision(q: QuestionRevision): QuestionRevision {
  if (!q || q.schema !== QUESTION_BANK_SCHEMA ||
      !safeInt(q.tenantId) || !safeInt(q.courseId) ||
      !safeId(q.questionId) || !safeInt(q.revision) ||
      !safeId(q.createdBy) || !safeId(q.lastEditedBy) ||
      !['DRAFT', 'REVIEWED', 'PUBLISHED'].includes(q.status) ||
      (q.status !== 'DRAFT' && !safeId(q.reviewedBy)) ||
      (q.status === 'DRAFT' && (q.reviewedBy !== null || q.publishedBy !== null || q.contentSha256 !== null)) ||
      (q.status === 'REVIEWED' && (q.publishedBy !== null || q.contentSha256 !== null)) ||
      (q.status === 'PUBLISHED' && (!safeId(q.publishedBy) || !q.contentSha256 || !SHA.test(q.contentSha256))) ||
      (q.reviewedBy !== null && q.reviewedBy === q.lastEditedBy)) {
    deny('INVALID_QUESTION_REVISION');
  }
  validContent(q);
  return q;
}
function cloneContent(c: QuestionContent): QuestionContent {
  return {
    moduleId: c.moduleId, topicId: c.topicId, sourceUnitId: c.sourceUnitId,
    sourceSha256: c.sourceSha256, prompt: c.prompt,
    choices: c.choices.map(o => ({ id: o.id, text: o.text })),
    correctChoiceId: c.correctChoiceId, explanation: c.explanation,
  };
}
export function createQuestionDraft(scope: QuestionScope, content: QuestionContent, author: string): QuestionRevision {
  if (!scope || !safeInt(scope.tenantId) || !safeInt(scope.courseId) ||
      !safeId(scope.questionId) || !safeId(author)) deny('INVALID_AUTHOR_SCOPE');
  validContent(content);
  return validateQuestionRevision({
    schema: QUESTION_BANK_SCHEMA, ...scope, ...cloneContent(content),
    revision: 1, status: 'DRAFT', createdBy: author, lastEditedBy: author,
    reviewedBy: null, publishedBy: null, contentSha256: null,
  });
}
/** Editing never changes a public revision. DB service must audit every change. */
export function editQuestionDraft(current: QuestionRevision,
  changes: Partial<QuestionContent>, editor: string): QuestionRevision {
  validateQuestionRevision(current);
  if (current.status !== 'DRAFT') deny('REVISION_NOT_EDITABLE');
  if (!safeId(editor) || !changes || typeof changes !== 'object' ||
      Array.isArray(changes) || !Object.keys(changes).length ||
      Object.keys(changes).some(k => !contentKeys.includes(k as keyof QuestionContent))) {
    deny('INVALID_EDIT_REQUEST');
  }
  const updated: QuestionContent = { ...cloneContent(current), ...changes };
  validContent(updated);
  return validateQuestionRevision({
    ...current, ...cloneContent(updated), lastEditedBy: editor,
  });
}
export function reviewQuestionDraft(current: QuestionRevision, reviewer: string): QuestionRevision {
  validateQuestionRevision(current);
  if (current.status !== 'DRAFT' || !safeId(reviewer) ||
      current.lastEditedBy === reviewer) deny('INDEPENDENT_REVIEW_REQUIRED');
  return validateQuestionRevision({
    ...current, status: 'REVIEWED', reviewedBy: reviewer,
  });
}
async function digest(q: QuestionRevision): Promise<string> {
  const canonical = JSON.stringify([
    q.tenantId, q.courseId, q.questionId, q.revision, cloneContent(q),
  ]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function publishReviewedQuestion(current: QuestionRevision,
  approver: string): Promise<QuestionRevision> {
  validateQuestionRevision(current);
  if (current.status !== 'REVIEWED' || !safeId(approver) ||
      current.lastEditedBy === approver) deny('REVIEWED_REVISION_REQUIRED');
  return validateQuestionRevision({
    ...current, status: 'PUBLISHED', publishedBy: approver,
    contentSha256: await digest(current),
  });
}
/** New edits of a published question always start at a new revision. */
export function forkPublishedQuestion(current: QuestionRevision, editor: string): QuestionRevision {
  validateQuestionRevision(current);
  if (current.status !== 'PUBLISHED' || !safeId(editor) ||
      current.revision >= Number.MAX_SAFE_INTEGER) deny('PUBLISHED_REVISION_REQUIRED');
  return validateQuestionRevision({
    ...current, ...cloneContent(current),
    revision: current.revision + 1, status: 'DRAFT', lastEditedBy: editor,
    createdBy: editor, reviewedBy: null, publishedBy: null, contentSha256: null,
  });
}
export async function verifyPublishedQuestion(q: QuestionRevision): Promise<boolean> {
  validateQuestionRevision(q);
  return q.status === 'PUBLISHED' && q.contentSha256 === await digest(q);
}
/** Only text/options, never an answer, explanation, author or internal hash. */
export function learnerQuestion(q: QuestionRevision): Readonly<{
  questionId: string; revision: number; moduleId: string;
  prompt: string; choices: readonly Choice[];
}> {
  validateQuestionRevision(q);
  if (q.status !== 'PUBLISHED') deny('QUESTION_NOT_PUBLISHED');
  return {
    questionId: q.questionId, revision: q.revision, moduleId: q.moduleId,
    prompt: q.prompt, choices: q.choices.map(c => ({...c})),
  };
}
export async function validateExamPlan(plan: ExamPlan,
  published: readonly QuestionRevision[]): Promise<void> {
  if (!plan || plan.schema !== EXAM_PLAN_SCHEMA ||
      !safeInt(plan.tenantId) || !safeInt(plan.courseId) ||
      !safeId(plan.examId) || !safeInt(plan.version) ||
      !SHA.test(plan.trainingSourceSha256) ||
      !SHA.test(plan.trainingEditionSha256) ||
      plan.consultationAllowed !== true ||
      !Array.isArray(plan.sections) || plan.sections.length < 1 ||
      plan.sections.length > 60 || !Array.isArray(published)) deny('INVALID_EXAM_PLAN');
  const used = new Set<string>();
  // One logical question cannot appear twice in a single attempt, even if
  // different published revisions exist: learner answers are keyed by ID.
  const usedQuestionIds = new Set<string>();
  const modules = new Set<string>();
  const bank = new Map(published.map(q => [q.questionId + ':' + q.revision, q]));
  for (const section of plan.sections) {
    if (!section || !safeId(section.moduleId) || modules.has(section.moduleId) ||
        !Number.isInteger(section.minScorePct) ||
        section.minScorePct < 1 || section.minScorePct > 100 ||
        !Array.isArray(section.questions) ||
        section.questions.length < 1 || section.questions.length > 200) {
      deny('INVALID_EXAM_SECTION');
    }
    modules.add(section.moduleId);
    for (const ref of section.questions) {
      if (!ref || !safeId(ref.questionId) || !safeInt(ref.revision) ||
          !SHA.test(ref.contentSha256)) deny('INVALID_QUESTION_REFERENCE');
      const key = ref.questionId + ':' + ref.revision;
      if (used.has(key) || usedQuestionIds.has(ref.questionId)) {
        deny('DUPLICATE_EXAM_QUESTION');
      }
      used.add(key);
      usedQuestionIds.add(ref.questionId);
      const q = bank.get(key);
      if (!q || q.status !== 'PUBLISHED' ||
          q.tenantId !== plan.tenantId || q.courseId !== plan.courseId ||
          q.moduleId !== section.moduleId ||
          q.sourceSha256 !== plan.trainingSourceSha256 ||
          q.contentSha256 !== ref.contentSha256 ||
          !(await verifyPublishedQuestion(q))) deny('UNTRUSTED_EXAM_QUESTION_VERSION');
    }
  }
  if (used.size !== published.length) deny('EXAM_BANK_QUESTION_SET_MISMATCH');
}
/** Pure grade preview for the eventual authenticated D1 attempt writer. */
export async function gradeExternalExam(plan: ExamPlan,
  published: readonly QuestionRevision[], answers: readonly ExamAnswer[]): Promise<ExamResult> {
  await validateExamPlan(plan, published);
  const total = plan.sections.reduce((n,section) => n + section.questions.length,0);
  if (!Array.isArray(answers) || answers.length !== total) deny('EXAM_ANSWERS_INCOMPLETE');
  const selected = new Map<string,string>();
  const bank = new Map(published.map(q => [q.questionId,q]));
  for (const a of answers) {
    if (!a || !safeId(a.questionId) || !safeId(a.choiceId) ||
        selected.has(a.questionId)) deny('EXAM_ANSWER_INVALID');
    const q = bank.get(a.questionId);
    if (!q || !q.choices.some(c => c.id === a.choiceId)) deny('EXAM_ANSWER_INVALID');
    selected.set(a.questionId,a.choiceId);
  }
  const sections = plan.sections.map(s => {
    const count = s.questions.length;
    const correct = s.questions.filter(ref =>
      bank.get(ref.questionId)?.correctChoiceId === selected.get(ref.questionId)).length;
    return {
      moduleId: s.moduleId, correct, total: count,
      scorePct: Math.round(100*correct/count),
      passed: correct*100 >= s.minScorePct*count,
    };
  });
  return {
    examId: plan.examId, examVersion: plan.version,
    passed: sections.every(section => section.passed),
    sections, grantsCompletion: false, grantsCertificate: false,
  };
}

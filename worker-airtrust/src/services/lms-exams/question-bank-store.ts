/**
 * LMS exam question administration persistence V1 — private Worker service.
 * No router is mounted and the schema is REVIEW-ONLY: no remote DB write is
 * possible from this PR. Callers MUST authenticate and resolve the tenant.
 * Every mutation uses optimistic edit_version and tenant-scoped SQL.
 * DB triggers are responsible for append-only audit, tenant/course validation,
 * legal lifecycle and the immutable published row.
 */
import {
  type QuestionContent, type QuestionRevision, type QuestionScope,
  createQuestionDraft, editQuestionDraft, reviewQuestionDraft,
  publishReviewedQuestion, forkPublishedQuestion, verifyPublishedQuestion,
  validateQuestionRevision,
} from '../../lib/lms-exams/question-bank-domain';

export type QuestionAdminActor = Readonly<{
  empresaId: number; cursoId: number; userId: number; tenantRole: string;
}>;
type DbRow = {
  empresa_id: number; curso_id: number; question_key: string; revision: number;
  status: string; content_json: string; edit_version: number;
  created_by: string; last_edited_by: string; reviewed_by: string|null;
  published_by: string|null; content_sha256: string|null;
};
export type StoredQuestion = Readonly<{
  revision: QuestionRevision; editVersion: number;
}>;
export class QuestionStoreError extends Error {
  constructor(public readonly code: string) {
    super(code); this.name = 'QuestionStoreError';
  }
}
function deny(code: string): never { throw new QuestionStoreError(code); }
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
function actorScope(a: QuestionAdminActor): {scope: {empresaId:number;cursoId:number}; user: string} {
  if (!a || !Number.isSafeInteger(a.empresaId) || a.empresaId<1 ||
      !Number.isSafeInteger(a.cursoId) || a.cursoId<1 ||
      !Number.isSafeInteger(a.userId) || a.userId<1 ||
      a.tenantRole !== 'admin') deny('EXAM_ADMIN_RBAC_REQUIRED');
  return {scope:{empresaId:a.empresaId,cursoId:a.cursoId},user:'u'+a.userId};
}
function inputId(key: string, version: number): void {
  if (!ID.test(key) || !Number.isSafeInteger(version) || version<1) {
    deny('EXAM_QUESTION_REFERENCE_INVALID');
  }
}
function deserialize(row: DbRow): StoredQuestion {
  let content: QuestionContent;
  try { content=JSON.parse(row.content_json) as QuestionContent; }
  catch { return deny('EXAM_STORED_CONTENT_INVALID'); }
  const q=validateQuestionRevision({
    schema:'AIRTRUST_QUESTION_BANK_REVISION_V1',
    tenantId:row.empresa_id,courseId:row.curso_id,
    questionId:row.question_key,revision:row.revision,
    ...content,
    status:row.status as QuestionRevision['status'],
    createdBy:row.created_by,lastEditedBy:row.last_edited_by,
    reviewedBy:row.reviewed_by,publishedBy:row.published_by,
    contentSha256:row.content_sha256,
  });
  if (!Number.isSafeInteger(row.edit_version) || row.edit_version<1) {
    deny('EXAM_STORED_REVISION_INVALID');
  }
  return {revision:q,editVersion:row.edit_version};
}
function serializedContent(q: QuestionRevision): string {
  // No role metadata, hash or audit information in the private JSON payload.
  const {moduleId,topicId,sourceUnitId,sourceSha256,prompt,choices,
         correctChoiceId,explanation}=q;
  return JSON.stringify({moduleId,topicId,sourceUnitId,sourceSha256,prompt,
    choices:choices.map(x=>({id:x.id,text:x.text})),correctChoiceId,explanation});
}
const SELECT = 'SELECT empresa_id,curso_id,question_key,revision,status,content_json,'+
  'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256 '+
  'FROM lms_exam_question_revisions WHERE empresa_id=? AND curso_id=? '+
  'AND question_key=? AND revision=? LIMIT 1';
async function fetchRevision(db:D1Database,scope:QuestionAdminActor,
  questionId:string,revision:number):Promise<StoredQuestion> {
  const {scope:s}=actorScope(scope);
  inputId(questionId,revision);
  const row=await db.prepare(SELECT)
    .bind(s.empresaId,s.cursoId,questionId,revision).first<DbRow>();
  if(!row)deny('EXAM_QUESTION_NOT_FOUND');
  const state=deserialize(row);
  if(state.revision.tenantId!==s.empresaId || state.revision.courseId!==s.cursoId ||
      state.revision.questionId!==questionId || state.revision.revision!==revision) {
    deny('EXAM_QUESTION_TENANT_SCOPE_MISMATCH');
  }
  if(state.revision.status==='PUBLISHED' &&
      !(await verifyPublishedQuestion(state.revision))) {
    deny('EXAM_PUBLISHED_REVISION_HASH_MISMATCH');
  }
  return state;
}
export async function getAdminQuestion(db:D1Database,actor:QuestionAdminActor,
  questionId:string,revision:number):Promise<StoredQuestion> {
  return fetchRevision(db,actor,questionId,revision);
}
export async function listAdminQuestions(db:D1Database,actor:QuestionAdminActor):Promise<readonly {
  questionId:string;revision:number;status:string;moduleId:string;updatedAt:string;
}[]> {
  const {scope}=actorScope(actor);
  // Fail-closed listing: answer and content_json are NEVER selected.
  const result=await db.prepare(
    'SELECT question_key,revision,status,updated_at FROM lms_exam_question_revisions '+
    'WHERE empresa_id=? AND curso_id=? ORDER BY question_key,revision DESC LIMIT 500'
  ).bind(scope.empresaId,scope.cursoId).all<{
    question_key:string;revision:number;status:string;updated_at:string;
  }>();
  return (result.results||[]).map(row=>({
    questionId:row.question_key,revision:row.revision,status:row.status,
    moduleId:'',updatedAt:row.updated_at,
  }));
}
export async function createAdminQuestionDraft(db:D1Database,
  actor:QuestionAdminActor,questionId:string,content:QuestionContent):Promise<StoredQuestion> {
  const {scope,user}=actorScope(actor);
  const q=createQuestionDraft({
    tenantId:scope.empresaId,courseId:scope.cursoId,questionId,
  } satisfies QuestionScope,content,user);
  const sql='INSERT INTO lms_exam_question_revisions '+
    '(empresa_id,curso_id,question_key,revision,status,content_json,edit_version,'+
    'created_by,last_edited_by) VALUES(?,?,?,1,\'DRAFT\',?,1,?,?) '+
    'RETURNING empresa_id,curso_id,question_key,revision,status,content_json,'+
    'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256';
  const row=await db.prepare(sql).bind(scope.empresaId,scope.cursoId,
    q.questionId,serializedContent(q),user,user).first<DbRow>();
  if(!row)deny('EXAM_QUESTION_CREATE_FAILED');
  return deserialize(row);
}
function requireEditVersion(actual:number,expected:number):void {
  if(!Number.isSafeInteger(expected)||expected<1||actual!==expected) {
    deny('EXAM_DRAFT_CONCURRENT_UPDATE');
  }
}
export async function editAdminQuestionDraft(db:D1Database,actor:QuestionAdminActor,
  questionId:string,revision:number,expectedEditVersion:number,
  changes:Partial<QuestionContent>):Promise<StoredQuestion> {
  const {scope,user}=actorScope(actor);
  const current=await fetchRevision(db,actor,questionId,revision);
  requireEditVersion(current.editVersion,expectedEditVersion);
  const modified=editQuestionDraft(current.revision,changes,user);
  const sql='UPDATE lms_exam_question_revisions '+
    'SET content_json=?,last_edited_by=?,edit_version=edit_version+1,updated_at=datetime(\'now\') '+
    'WHERE empresa_id=? AND curso_id=? AND question_key=? AND revision=? '+
    'AND status=\'DRAFT\' AND edit_version=? '+
    'RETURNING empresa_id,curso_id,question_key,revision,status,content_json,'+
    'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256';
  const row=await db.prepare(sql).bind(serializedContent(modified),user,
    scope.empresaId,scope.cursoId,questionId,revision,expectedEditVersion).first<DbRow>();
  if(!row)deny('EXAM_DRAFT_CONCURRENT_UPDATE');
  return deserialize(row);
}
export async function reviewAdminQuestion(db:D1Database,actor:QuestionAdminActor,
  questionId:string,revision:number,expectedEditVersion:number):Promise<StoredQuestion> {
  const {scope,user}=actorScope(actor);
  const current=await fetchRevision(db,actor,questionId,revision);
  requireEditVersion(current.editVersion,expectedEditVersion);
  reviewQuestionDraft(current.revision,user);
  const row=await db.prepare(
    'UPDATE lms_exam_question_revisions SET status=\'REVIEWED\','+
    'reviewed_by=?,updated_at=datetime(\'now\') '+
    'WHERE empresa_id=? AND curso_id=? AND question_key=? AND revision=? '+
    'AND status=\'DRAFT\' AND edit_version=? '+
    'RETURNING empresa_id,curso_id,question_key,revision,status,content_json,'+
    'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256'
  ).bind(user,scope.empresaId,scope.cursoId,questionId,revision,
    expectedEditVersion).first<DbRow>();
  if(!row)deny('EXAM_REVIEW_CONCURRENT_UPDATE');
  return deserialize(row);
}
export async function publishAdminQuestion(db:D1Database,actor:QuestionAdminActor,
  questionId:string,revision:number,expectedEditVersion:number):Promise<StoredQuestion> {
  const {scope,user}=actorScope(actor);
  const current=await fetchRevision(db,actor,questionId,revision);
  requireEditVersion(current.editVersion,expectedEditVersion);
  const published=await publishReviewedQuestion(current.revision,user);
  const row=await db.prepare(
    'UPDATE lms_exam_question_revisions SET status=\'PUBLISHED\','+
    'published_by=?,content_sha256=?,updated_at=datetime(\'now\') '+
    'WHERE empresa_id=? AND curso_id=? AND question_key=? AND revision=? '+
    'AND status=\'REVIEWED\' AND edit_version=? '+
    'RETURNING empresa_id,curso_id,question_key,revision,status,content_json,'+
    'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256'
  ).bind(user,published.contentSha256,scope.empresaId,scope.cursoId,
    questionId,revision,expectedEditVersion).first<DbRow>();
  if(!row)deny('EXAM_PUBLISH_CONCURRENT_UPDATE');
  const value=deserialize(row);
  if(!(await verifyPublishedQuestion(value.revision)))deny('EXAM_PUBLISH_READBACK_MISMATCH');
  return value;
}
export async function forkAdminPublishedQuestion(db:D1Database,actor:QuestionAdminActor,
  questionId:string,revision:number):Promise<StoredQuestion> {
  const {scope,user}=actorScope(actor);
  const current=await fetchRevision(db,actor,questionId,revision);
  const next=forkPublishedQuestion(current.revision,user);
  const row=await db.prepare(
    'INSERT INTO lms_exam_question_revisions '+
    '(empresa_id,curso_id,question_key,revision,status,content_json,edit_version,'+
    'created_by,last_edited_by) VALUES(?,?,?, ?,\'DRAFT\',?,1,?,?) '+
    'RETURNING empresa_id,curso_id,question_key,revision,status,content_json,'+
    'edit_version,created_by,last_edited_by,reviewed_by,published_by,content_sha256'
  ).bind(scope.empresaId,scope.cursoId,questionId,next.revision,
    serializedContent(next),user,user).first<DbRow>();
  if(!row)deny('EXAM_FORK_FAILED');
  return deserialize(row);
}

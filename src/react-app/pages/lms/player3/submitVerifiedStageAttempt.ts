/**
 * Player3 module attempt transport. The canonical module POST does not echo
 * tenant/cycle or claim a certificate. This adapter re-reads the authenticated
 * Worker ledger before returning a persisted receipt to the React modal.
 *
 * No answer key, grade or certificate is computed in the browser. After an
 * ambiguous write the instance locks; reload/re-read instead of inventing a
 * second attempt or replaying with a new event ID.
 */
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import type {
  P3ExamContext, P3ExamAnswer, P3ExamReceipt,
} from './Player3AssessmentModal';

type AuthorizedRequest = (url: string, init: RequestInit) => Promise<Response>;
type StageState = {
  stageId: string;
  attempts: number;
  lastScorePct: number | null;
  passed: boolean;
  nextAttemptNumber: number | null;
};
type ModuleSession = {
  editionSha256: string;
  cycleId: number;
  completionSupported: false;
  stages: StageState[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA = /^[a-f0-9]{64}$/;
const positive = (v:number) => Number.isSafeInteger(v) && v > 0;
const deny = (code: string): never => { throw new Error('PLAYER3_ATTEMPT_' + code); };

function validContext(context: P3ExamContext): boolean {
  if (!context || ![context.empresaId,context.matriculaId,context.cicloId].every(positive) ||
      !SHA.test(context.editionSha256) || !ID.test(context.stageId) ||
      !Array.isArray(context.questions) || context.questions.length < 1 ||
      context.questions.length > 100) return false;
  const questions = new Set<string>();
  return context.questions.every(q => {
    if (!q || !ID.test(q.id) || questions.has(q.id) ||
        !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 12) return false;
    questions.add(q.id);
    const options = new Set<string>();
    return q.options.every(o => {
      if (!o || !ID.test(o.id) || options.has(o.id)) return false;
      options.add(o.id);
      return true;
    });
  });
}

function validAnswers(context: P3ExamContext, answers: readonly P3ExamAnswer[]): boolean {
  return Array.isArray(answers) && answers.length === context.questions.length &&
    context.questions.every((q,i) => answers[i]?.questionId === q.id &&
      q.options.some(o => o.id === answers[i].optionId));
}

function stageFromSession(raw: unknown, context: P3ExamContext): StageState {
  const outer = raw as {success?:boolean;data?:ModuleSession};
  const s = outer?.data;
  if (outer?.success !== true || !s || s.editionSha256 !== context.editionSha256 ||
      s.cycleId !== context.cicloId || s.completionSupported !== false ||
      !Array.isArray(s.stages) || s.stages.length < 1 || s.stages.length > 100 ||
      s.stages.some(x => !x || !ID.test(x.stageId) ||
        !Number.isSafeInteger(x.attempts) || x.attempts < 0 || x.attempts > 500 ||
        typeof x.passed !== 'boolean' ||
        (x.lastScorePct !== null && (!Number.isInteger(x.lastScorePct) ||
          x.lastScorePct < 0 || x.lastScorePct > 100)) ||
        (x.nextAttemptNumber !== null && (!Number.isSafeInteger(x.nextAttemptNumber) ||
          x.nextAttemptNumber !== x.attempts + 1 || x.nextAttemptNumber > 500))) ||
      new Set(s.stages.map(x => x.stageId)).size !== s.stages.length) {
    return deny('SESSION_SCOPE_OR_LEDGER_INVALID');
  }
  const stage = s.stages.find(x => x.stageId === context.stageId);
  if (!stage) return deny('STAGE_MISSING_FROM_POLICY');
  if (stage.attempts === 0 && (stage.lastScorePct !== null || stage.passed)) {
    return deny('SESSION_UNSUPPORTED_INITIAL_STATE');
  }
  return stage;
}

type StagePost = {
  state: 'APPLIED' | 'IDEMPOTENT_REPLAY';
  stage_id: string;
  attempt_number: number;
  edition_sha256: string;
  score_pct: number;
  stage_passed: boolean;
  completion_supported: false;
};
function parseAttempt(raw: unknown, context: P3ExamContext, attemptNumber: number): StagePost {
  const response = raw as { success?:boolean; data?:StagePost };
  const r = response?.data;
  if (response?.success !== true || !r ||
      !['APPLIED','IDEMPOTENT_REPLAY'].includes(r.state) ||
      r.stage_id !== context.stageId || r.edition_sha256 !== context.editionSha256 ||
      r.attempt_number !== attemptNumber || !Number.isInteger(r.score_pct) ||
      r.score_pct < 0 || r.score_pct > 100 || typeof r.stage_passed !== 'boolean' ||
      r.completion_supported !== false) return deny('INVALID_OFFICIAL_RECEIPT');
  return r;
}

/** Returned function conforms to Player3AssessmentModal.submitOfficialAttempt. */
export function makePlayer3VerifiedStageSubmitter(
  context: P3ExamContext,
  request: AuthorizedRequest = fetchWithAuth,
  apiBaseUrl = API_BASE_URL,
): (answers: readonly P3ExamAnswer[]) => Promise<P3ExamReceipt> {
  if (!validContext(context) || typeof request !== 'function' ||
      !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$|^\/api$/.test(apiBaseUrl)) {
    return deny('UNAPPROVED_CONTEXT');
  }
  const base = apiBaseUrl.replace(/\/$/, '') +
    '/lms/native/matriculas/' + context.matriculaId + '/etapas';
  const url = base + '/' + encodeURIComponent(context.stageId) + '/tentativas';
  let busyOrUncertain = false;
  async function session(): Promise<StageState> {
    const result = await request(base + '/sessao', {method:'GET',cache:'no-store'});
    if (!result.ok) return deny('SESSION_UNAVAILABLE');
    return stageFromSession(await result.json() as unknown,context);
  }
  return async (answers: readonly P3ExamAnswer[]) => {
    if (busyOrUncertain) return deny('REOPEN_TO_RECONCILE');
    if (!validAnswers(context,answers)) return deny('ANSWER_SELECTION_INVALID');
    busyOrUncertain = true;
    // Never clear this lock on network failure: the POST could have committed.
    const before = await session();
    if (before.passed || !before.nextAttemptNumber) return deny('STAGE_NOT_RETRYABLE');
    const attemptNumber = before.nextAttemptNumber;
    const random = crypto.getRandomValues(new Uint8Array(16));
    const eventId = 'p3-' + [...random].map(b=>b.toString(16).padStart(2,'0')).join('');
    const posted = await request(url,{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({eventId,attemptNumber,answers}),
    });
    if (posted.status !== 200 && posted.status !== 201) return deny('STAGE_POST_UNCONFIRMED');
    const receipt = parseAttempt(await posted.json() as unknown,context,attemptNumber);
    const verified = await session();
    if (verified.attempts !== attemptNumber ||
        verified.lastScorePct !== receipt.score_pct ||
        verified.passed !== receipt.stage_passed) return deny('LEDGER_RECHECK_FAILED');
    return {
      empresa_id:context.empresaId,matricula_id:context.matriculaId,
      ciclo_id:context.cicloId,edition_sha256:context.editionSha256,
      stage_id:context.stageId,attempt_number:attemptNumber,
      stage_passed:receipt.stage_passed,score_pct:receipt.score_pct,
      persisted:true,
    };
  };
}

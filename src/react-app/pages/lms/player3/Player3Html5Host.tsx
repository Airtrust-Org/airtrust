/**
 * Player 3 — fresh HTML5 presentation host. Never renders generic JSON slides,
 * never infers completion from the iframe, and never gives it LMS credentials.
 *
 * This is an isolated staging component until a tenant-authorized short-lived
 * content URL, Worker assessment endpoints and governed schema are available.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Player3AssessmentModal, {type P3ExamProps, type P3ExamAnswer} from './Player3AssessmentModal';
import {makePlayer3VerifiedStageSubmitter} from './submitVerifiedStageAttempt';
import Player3FinalizationControls,{type Player3TerminalScope} from './Player3FinalizationControls';
import {makePlayer3NavigationRecorder,validNavigationScope,type Player3NavigationScope} from './Player3NavigationTransport';

export type Player3Html5HostProps = {
  title: string;
  contentUrl: string;
  editionSha256: string;
  /** Backend-defined origin distinct from the authenticated application. */
  contentOrigin: string;
  /** Explicitly marks this as a review, never certified completion. */
  reviewOnly?: boolean;
  /** An independently authenticated server session decides when the exam is due.
   * Never derive this prop from untrusted iframe navigation/postMessage. */
  pendingAssessment?: Omit<P3ExamProps,'submitOfficialAttempt'> | null;
  /** Only RC8.1 authored exams use the iframe hint/verdict bridge. */
  assessmentPresentation?: 'modal' | 'authored-html5';
  /** Bound by an authenticated server session, never an iframe hint. */
  terminalScope?: Player3TerminalScope | null;
  /** Worker-pinned visual navigation only; never a completion authority. */
  navigation?: Player3NavigationScope | null;
  /** Refresh the Worker-approved launch only after a confirmed lesson checkpoint. */
  onVerifiedLessonCheckpoint?: () => void;
};

const DIGEST = /^[a-f0-9]{64}$/;
export type Player3NavigationHint = Readonly<{
  type: 'AIRTRUST_PLAYER3_NAV_HINT_V1';
  unitId: string;
  editionSha256: string;
}>;

function validContentUrl(raw: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(raw);
    const allowed = new URL(expectedOrigin);
    return url.protocol === 'https:' && allowed.protocol === 'https:' &&
      allowed.pathname === '/' && allowed.search === '' && allowed.hash === '' &&
      url.origin === allowed.origin && url.origin !== window.location.origin &&
      !url.username && !url.password && !allowed.username && !allowed.password &&
      !url.pathname.includes('/../') && !/%(?:2e|2f|5c)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Hints are display-only. The server separately authorizes every checkpoint,
 * exam attempt and canonical completion for tenant/enrollment/cycle/edition.
 */
export default function Player3Html5Host({
  title, contentUrl, editionSha256, contentOrigin, reviewOnly = true, pendingAssessment,
  terminalScope, assessmentPresentation = 'modal', navigation,
  onVerifiedLessonCheckpoint,
}: Player3Html5HostProps) {
  const [lastHint, setLastHint] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameLoadVersion,setFrameLoadVersion]=useState(0);
  const [navigationError,setNavigationError]=useState(false);
  const navigationEnabled=useRef(false);
  // The resume ACK displays a page; only leaving that page may commit its
  // lesson checkpoint. This distinction keeps a new session empty at load.
  const displayedUnit=useRef<string|null>(null);
  const navigationFailed=useRef(false);
  const navigationQueue=useRef<Promise<unknown>>(Promise.resolve());
  const refreshedLessons=useRef(new Set<string>());
  const lastResumeCursorFrame=useRef<string|null>(null);
  const navigationRecorder=useRef<{identity:string;policy:string;
    record:(unitId:string)=>Promise<boolean>} | null>(null);
  const safe = useMemo(() =>
    DIGEST.test(editionSha256) && validContentUrl(contentUrl, contentOrigin),
    [contentUrl,contentOrigin,editionSha256],
  );
  const examContext = pendingAssessment?.context;
  // A freshly allocated server projection must not reset the transport's
  // ambiguous-POST lock. Keep one submitter per actual enrollment/cycle/
  // edition/stage for the lifetime of this host, including modal dismissal.
  const submittersRef = useRef(new Map<string, {
    policy: string;
    submit: ReturnType<typeof makePlayer3VerifiedStageSubmitter>;
  }>());
  const verifiedSubmit = useMemo(() => {
    if (!safe || reviewOnly || !examContext ||
        examContext.editionSha256 !== editionSha256) return null;
    const scope = [examContext.empresaId,examContext.matriculaId,
      examContext.cicloId,examContext.editionSha256,examContext.stageId].join(':');
    const policy = JSON.stringify(examContext.questions.map(q =>
      [q.id,q.options.map(o => o.id)]));
    // Lazily bind only on official submission. A renderer refresh, new
    // callback or navigation cannot grant a second ambiguous attempt.
    return (answers: readonly P3ExamAnswer[]) => {
      const existing = submittersRef.current.get(scope);
      if (existing) {
        if (existing.policy !== policy) {
          return Promise.reject(new Error('PLAYER3_ATTEMPT_POLICY_CHANGED'));
        }
        return existing.submit(answers);
      }
      const submit = makePlayer3VerifiedStageSubmitter(examContext);
      submittersRef.current.set(scope,{policy,submit});
      return submit(answers);
    };
  }, [safe,reviewOnly,examContext,editionSha256]);
  useEffect(() => {
    setLastHint(null);
    if (!safe) return;
    let active = true;
    let submitting = false;
    const handledRequests = new Set<string>();
    const origin = new URL(contentOrigin).origin;
    const recordUnit = (unitId:string) => {
      if(reviewOnly||navigationFailed.current||!navigationEnabled.current||
         !navigation||!validNavigationScope(navigation)||
         navigation.editionSha256!==editionSha256||
         !navigation.checkpointUnitIds.includes(unitId))return;
      const identity=[navigation.empresaId,navigation.matriculaId,
        navigation.cicloId,navigation.editionSha256].join(':');
      const policy=JSON.stringify(navigation.checkpointUnitIds);
      if(navigationRecorder.current &&
         (navigationRecorder.current.identity!==identity||
          navigationRecorder.current.policy!==policy)){
        navigationFailed.current=true;
        setNavigationError(true);
        return;
      }
      if(!navigationRecorder.current) {
        navigationRecorder.current={identity,policy,
          record:makePlayer3NavigationRecorder(navigation)};
      }
      const record=navigationRecorder.current.record;
      navigationQueue.current=navigationQueue.current.then(async()=>{
        if(navigationFailed.current)return;
        const confirmed=await record(unitId);
        if(confirmed&&active&&!refreshedLessons.current.has(unitId)){
          refreshedLessons.current.add(unitId);
          // No browser-side progress inference: the Worker has committed
          // and re-read this checkpoint before another launch GET is made.
          onVerifiedLessonCheckpoint?.();
        }
      }).catch(()=>{
        navigationFailed.current=true;
        setNavigationError(true);
      });
    };
    const receive = (event: MessageEvent<unknown>) => {
      // Origin alone is insufficient: only the exact frame being displayed
      // may request a server-graded attempt, never a sibling content iframe.
      if (event.origin !== origin ||
          event.source !== frameRef.current?.contentWindow ||
          !event.data || typeof event.data !== 'object' ||
          Array.isArray(event.data)) return;
      const msg = event.data as Record<string,unknown>;
      if (msg.type === 'AIRTRUST_PLAYER3_RESUME_ACK_V1') {
        if (!reviewOnly && !navigationEnabled.current && navigation &&
            validNavigationScope(navigation) &&
            navigation.editionSha256 === editionSha256 &&
            msg.editionSha256 === editionSha256 &&
            msg.unitId === navigation.nextUnitId &&
            Object.keys(msg).sort().join(',') ===
              'editionSha256,type,unitId') {
          navigationEnabled.current=true;
          displayedUnit.current=msg.unitId as string;
          setLastHint(msg.unitId as string);
          // ACK is ONLY a positioning receipt. Do not create a new lesson
          // event on first paint or on a browser reload (D fresh-ledger gate).
        }
        return;
      }
      if (msg.type === 'AIRTRUST_PLAYER3_NAV_HINT_V1') {
        if (msg.editionSha256 === editionSha256 &&
            typeof msg.unitId === 'string' &&
            /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(msg.unitId)) {
          if(navigationEnabled.current && displayedUnit.current &&
             displayedUnit.current!==msg.unitId){
            // Store the source lesson the learner is LEAVING, not the next
            // source page just displayed. Assessment/scenario IDs are never
            // treated as lesson evidence, even if they appear in a hint.
            recordUnit(displayedUnit.current);
            displayedUnit.current=msg.unitId;
          }
          setLastHint(msg.unitId);
        }
        return;
      }
      if (msg.type === 'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1') {
        if(navigationEnabled.current && msg.editionSha256===editionSha256 &&
           typeof msg.unitId==='string' && msg.unitId===displayedUnit.current &&
           Object.keys(msg).sort().join(',')==='editionSha256,type,unitId'){
          // Source-authored end is not terminal approval; it may only
          // checkpoint a final lesson, if the Worker says it is a lesson.
          recordUnit(msg.unitId);
        }
        return;
      }
      // The original RC8.1 iframe can send *choices*, never a grade or
      // completion. Only a previously authenticated server-pinned exam can
      // cause an official POST to the Worker. Review always stays read-only.
      if (msg.type !== 'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1' ||
          reviewOnly || assessmentPresentation !== 'authored-html5' ||
          !examContext || !verifiedSubmit ||
          msg.editionSha256 !== editionSha256 ||
          msg.stageId !== examContext.stageId ||
          typeof msg.requestId !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(msg.requestId) ||
          !Array.isArray(msg.answers) ||
          Object.keys(msg).sort().join(',') !==
            'answers,editionSha256,requestId,stageId,type' ||
          msg.answers.length !== examContext.questions.length ||
          submitting || handledRequests.has(msg.requestId)) return;
      const answers = msg.answers as P3ExamAnswer[];
      if (!examContext.questions.every((q,i) =>
        answers[i] && Object.keys(answers[i]).sort().join(',') ===
          'optionId,questionId' &&
        typeof answers[i].questionId === 'string' &&
        answers[i].questionId === q.id &&
        typeof answers[i].optionId === 'string' &&
        q.options.some(o => o.id === answers[i].optionId))) return;
      handledRequests.add(msg.requestId);
      submitting = true;
      const requestId = msg.requestId;
      const stageId = examContext.stageId;
      // A lesson-exit checkpoint may have been queued by the immediately
      // preceding authored navigation hint. The official assessment must not
      // race ahead of that server evidence.
      void navigationQueue.current.then(() => {
        if(navigationFailed.current) {
          throw new Error('PLAYER3_NAVIGATION_NOT_CONFIRMED');
        }
        return verifiedSubmit(answers);
      }).then(receipt => {
        // An ambiguous Worker attempt must NEVER receive a fabricated pass.
        if (!active || !receipt.persisted ||
            receipt.edition_sha256 !== editionSha256 ||
            receipt.stage_id !== stageId ||
            receipt.empresa_id !== examContext.empresaId ||
            receipt.matricula_id !== examContext.matriculaId ||
            receipt.ciclo_id !== examContext.cicloId) return;
        frameRef.current?.contentWindow?.postMessage({
          type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',
          editionSha256,stageId,requestId,
          stage_passed:receipt.stage_passed,score_pct:receipt.score_pct,
          persisted:true,
        }, origin);
        // The parent may refresh its server-only next-stage projection, but
        // only after the successful official receipt was re-read. No iframe
        // signal alone can advance the authenticated stage.
        if (receipt.stage_passed) pendingAssessment?.onVerifiedStagePassed(receipt);
      }).catch(() => {
        // The authored HTML5 times out and remains locked. No automatic
        // re-post: a committed attempt may have lost only its response.
      }).finally(() => { submitting = false; });
    };
    window.addEventListener('message', receive);
    return () => { active = false; window.removeEventListener('message', receive); };
  }, [safe,contentOrigin,editionSha256,reviewOnly,
      assessmentPresentation,examContext,verifiedSubmit,pendingAssessment,navigation,
      onVerifiedLessonCheckpoint]);

  // Do not trust a localStorage/SCORM bookmark: only the launch projection
  // from the authenticated Worker may move the original authored presentation.
  useEffect(()=>{
    if(!safe||reviewOnly||frameLoadVersion===0||!navigation||
       !validNavigationScope(navigation)||
       navigation.editionSha256!==editionSha256)return;
    // Refreshing assessment eligibility must not reposition a live HTML5
    // iframe. Only send the server cursor once per actual frame load.
    const frameKey=[frameLoadVersion,navigation.empresaId,
      navigation.matriculaId,navigation.cicloId,navigation.editionSha256].join(':');
    if(lastResumeCursorFrame.current===frameKey)return;
    lastResumeCursorFrame.current=frameKey;
    frameRef.current?.contentWindow?.postMessage({
      type:'AIRTRUST_PLAYER3_RESUME_CURSOR_V1',
      editionSha256,nextUnitId:navigation.nextUnitId,
    },new URL(contentOrigin).origin);
  },[safe,reviewOnly,frameLoadVersion,navigation,editionSha256,contentOrigin]);

  if (!safe) return (
    <p role="alert">Conteúdo HTML5 indisponível: origem ou edição inválida.
      Nenhum progresso foi alterado.</p>
  );
  return (
    <section aria-label={'Player 3 — ' + title}
      className="flex min-h-[560px] w-full flex-col overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h1 className="text-base font-bold">{title}</h1>
        <span className="text-sm text-slate-600">
          {reviewOnly ? 'Prévia HTML5 — sem registro certificador' :
            'Avaliações e conclusão controladas pelo AirTrust'}
        </span>
      </header>
      <iframe
        ref={frameRef}
        onLoad={()=>{
          navigationEnabled.current=false;
          displayedUnit.current=null;
          setFrameLoadVersion(n=>n+1);
        }}
        title={'Conteúdo original — ' + title}
        src={contentUrl}
        sandbox="allow-scripts allow-forms allow-same-origin"
        referrerPolicy="no-referrer"
        className="min-h-[500px] w-full flex-1 border-0"
      />
      <footer className="border-t px-4 py-2 text-xs text-slate-600">
        {lastHint ? 'Unidade exibida: ' + lastHint + '. ' : ''}
        A navegação no conteúdo não confirma aprovação, matrícula ou certificado.
      </footer>
      {navigationError && <p role="alert">Posição não confirmada pelo servidor. Reabra o treinamento antes de continuar.</p>}
      {!reviewOnly && assessmentPresentation === 'modal' && pendingAssessment &&
        pendingAssessment.context.editionSha256 === editionSha256 && verifiedSubmit &&
        <Player3AssessmentModal {...pendingAssessment}
          // Do not accept a client- or iframe-supplied "persisted" receipt.
          // Bind directly to Worker POST + authenticated session re-read.
          submitOfficialAttempt={verifiedSubmit} />}
      {!reviewOnly && pendingAssessment &&
        pendingAssessment.context.editionSha256 !== editionSha256 &&
        <p role="alert">Avaliação indisponível: edição diferente do conteúdo autenticado.</p>}
      {!reviewOnly && terminalScope && terminalScope.editionSha256 === editionSha256 &&
        <Player3FinalizationControls
          key={terminalScope.matriculaId+':'+terminalScope.cycleId+':'+terminalScope.editionSha256}
          scope={terminalScope} />}
      {!reviewOnly && terminalScope && terminalScope.editionSha256 !== editionSha256 &&
        <p role="alert">Conclusão indisponível: edição diferente do conteúdo autenticado.</p>}
    </section>
  );
}

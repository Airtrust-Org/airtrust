/**
 * Learner final exam screen. Everything that matters is decided by the Worker:
 * this page only shows the server state, saves choices and submits. It never
 * grades, never receives an answer key and never completes the enrollment by
 * itself: after a pass it calls the canonical /finalizar endpoint.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateTrainingEvidenceProjections } from '@/react-app/lib/compliance-source-invalidation';
import { fetchWithAuth } from '../../../config/api';
import AppLayout from '../../../components/AppLayout';
import {examPage,examCard,examPrimary,examSecondary,examWarning,examMuted,examDanger} from './examUi';

type Choice = { id: string; text: string };
type ExamQuestion = { questionId: string; prompt: string; choices: Choice[] };
type Section = { moduleId: string; questions: ExamQuestion[] };
type Result = {
  passed: boolean; answered: number; unanswered: number; expired?: boolean;
  sections: { moduleId: string; scorePct: number; passed: boolean }[];
};
type Attempt = {
  attemptId: string; attemptNo: number; state: 'IN_PROGRESS' | 'SUBMITTED';
  sections: Section[]; answers: Record<string, string>; result: Result | null; expiresAt?:string|null;
};
type ExamState = {
  state: 'NOT_AVAILABLE' | 'STUDY_PENDING' | 'READY' | 'PASSED' | 'COMPLETED';
  certificate?: 'ISSUED' | 'MISSING' | 'NOT_APPLICABLE';
  missing: string[]; attemptsUsed: number; hasOpenAttempt?: boolean; finalizeRequired: boolean;
  attemptPolicy?:{maxAttempts:number;retryDelayMinutes:number;timeLimitMinutes:number|null}|null;
  nextAttemptAt?:string|null;
};
type Envelope<T> = { success: boolean; data?: T; code?: string };

const MESSAGES: Record<string, string> = {
  EXAM_RUNTIME_NOT_ACTIVATED: 'A prova final ainda não está disponível neste ambiente.',
  EXAM_SCHEMA_NOT_READY: 'O sistema de provas ainda não está preparado para este ambiente.',
  EXAM_ATTEMPTS_EXHAUSTED: 'O limite de tentativas desta prova foi atingido. Consulte a gestão de treinamento.',
  EXAM_RETRY_COOLDOWN: 'O intervalo obrigatório entre tentativas ainda não terminou.',
  EXAM_TIME_EXPIRED: 'O prazo da tentativa terminou. A prova foi encerrada sem aprovação.',
  EXAM_STUDY_NOT_COMPLETE: 'Conclua todo o conteúdo antes de iniciar a prova.',
  EXAM_ALREADY_PASSED: 'Você já foi aprovado nesta prova.',
  EXAM_ATTEMPT_SEALED: 'Esta tentativa já foi enviada.',
  EXAM_ATTEMPT_NOT_CURRENT: 'Esta tentativa não corresponde mais à matrícula, ao ciclo ou à edição ativa. Solicite a regularização à gestão de treinamento. Não reinicie sua matrícula.',
  EXAM_ATTEMPT_EDITION_CHANGED: 'O conteúdo foi substituído durante uma tentativa aberta. Solicite à gestão de treinamento a regularização da edição e do ciclo. Suas respostas anteriores não foram apagadas.',
  EXAM_ENROLLMENT_NOT_FOUND: 'Matrícula não encontrada.',
};
const explain = (code?: string) => (code && MESSAGES[code]) || 'Não foi possível concluir a operação. Tente novamente.';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(path, { cache: 'no-store', ...init });
  let body: Envelope<T> = { success: false };
  try { body = (await res.json()) as Envelope<T>; } catch { /* non-JSON error */ }
  if (!res.ok || body.success !== true || body.data === undefined) {
    throw Object.assign(new Error(body.code ?? 'EXAM_REQUEST_FAILED'), { code: body.code });
  }
  return body.data;
}

export default function LmsProva(): React.ReactElement {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const queryClient = useQueryClient();
  const [exam, setExam] = useState<ExamState | null>(null);
  // Re-render exactly when the Worker-defined retry deadline expires.
  const [, setDeadlineTick] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Synchronous guard: React state updates may be batched between rapid clicks.
  const saveInFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [questionIndex,setQuestionIndex] = useState(0);
  const [now,setNow] = useState(Date.now());
  const [completionConfirmed,setCompletionConfirmed] = useState(false);
  const sendRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(confirming){
      const first=dialogRef.current?.querySelector('button');
      first?.focus();
    }else if(sendRef.current&&attempt?.state==='IN_PROGRESS'){
      // A dismissed confirmation must restore keyboard focus to the initiator.
      sendRef.current.focus();
    }
  },[confirming,attempt?.state]);
  useEffect(()=>{
    if(attempt?.state!=='IN_PROGRESS'||!attempt.expiresAt)return;
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[attempt?.state,attempt?.expiresAt]);
  // One key per start click: a network retry reuses it, so no duplicate attempt.
  const startKey = useRef<string>('');

  const base = `/api/lms/exams/matriculas/${matriculaId}`;
  const load = useCallback(async () => {
    setError('');
    try { setExam(await call<ExamState>(`${base}/prova`)); }
    catch (e) { setError(explain((e as { code?: string }).code)); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const deadline = exam?.nextAttemptAt;
    if (!deadline) return;
    const remaining = Date.parse(deadline) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    // The timeout does not grant eligibility. It refreshes the visible
    // controls and checks the authoritative state again in the Worker.
    const timer = window.setTimeout(() => {
      setDeadlineTick(tick => tick + 1);
      void load();
    }, remaining + 50);
    return () => window.clearTimeout(timer);
  }, [exam?.nextAttemptAt, load]);

  async function start() {
    setBusy(true); setError(''); setConfirming(false);
    if (!startKey.current) startKey.current = `exam-${crypto.randomUUID()}`;
    try {
      const data = await call<Attempt>(`${base}/tentativas`, {
        method: 'POST', headers: { 'Idempotency-Key': startKey.current },
      });
      startKey.current = '';
      setAttempt(data); setAnswers(data.answers); setQuestionIndex(0);setStatus('');
    } catch (e) { setError(explain((e as { code?: string }).code)); }
    finally { setBusy(false); }
  }

  async function choose(questionId: string, choiceId: string) {
    if (!attempt || attempt.state !== 'IN_PROGRESS' || busy || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    const previous = answers[questionId];
    setAnswers(a => ({ ...a, [questionId]: choiceId }));
    setStatus('Salvando resposta…');
    try {
      await call(`/api/lms/exams/tentativas/${attempt.attemptId}/respostas`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, choiceId }),
      });
      setStatus('Resposta salva.');
    } catch (e) {
      setAnswers(a => {
        const next = { ...a };
        if (previous) next[questionId] = previous; else delete next[questionId];
        return next;
      });
      const code = (e as { code?: string }).code;
      setStatus(code && MESSAGES[code] ? explain(code) :
        'Não foi possível salvar esta resposta. Selecione novamente.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  const questionList = attempt?.sections.flatMap((section,si)=>
    section.questions.map(q=>({...q,sectionIndex:si,moduleId:section.moduleId})))||[];
  const total=questionList.length;
  const answered=questionList.filter(q=>!!answers[q.questionId]).length;
  const unanswered=total-answered;
  const remainingMs=attempt?.expiresAt?Math.max(0,Date.parse(attempt.expiresAt)-now):null;
  const remainingLabel=remainingMs===null?'':[
    Math.floor(remainingMs/3600000),
    Math.floor(remainingMs%3600000/60000),
    Math.floor(remainingMs%60000/1000),
  ].map(n=>String(n).padStart(2,'0')).join(':');

  async function submit() {
    // Never seal an attempt while its last answer is still in flight.
    if (!attempt || busy || saveInFlight.current) return;
    setBusy(true); setError('');
    try {
      const data = await call<Attempt>(`/api/lms/exams/tentativas/${attempt.attemptId}/enviar`, { method: 'POST' });
      setAttempt(data); setConfirming(false);
      await load();
    } catch (e) { setError(explain((e as { code?: string }).code)); }
    finally { setBusy(false); }
  }

  async function finalize() {
    setBusy(true); setError('');
    try {
      const res = await fetchWithAuth(`/api/lms/matriculas/${matriculaId}/finalizar`, { method: 'POST' });
      const body = (await res.json()) as { success?: boolean; code?: string };
      if (!res.ok || !body.success) throw new Error(body.code ?? 'FINALIZE_FAILED');
      void invalidateTrainingEvidenceProjections(queryClient);
      const updated=await call<ExamState>(base+'/prova');
      setExam(updated);
      if(updated.state==='COMPLETED'){setCompletionConfirmed(true);setAttempt(null);setStatus('Conclusão confirmada pelo LMS.');}
      else setStatus('Solicitação aceita; aguardando confirmação da conclusão no LMS. Consulte o histórico antes de considerar o curso encerrado.');
    } catch {
      setError('A prova foi aprovada, mas a conclusão ainda não foi confirmada. Consulte o histórico ou tente novamente.');
    } finally { setBusy(false); }
  }

  async function retryCertificate() {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      // Backend rechecks tenant/ownership and idempotently retries issuance for CONCLUIDO.
      // A 200 response does not guarantee issuance: rendering/R2 failures are logged server-side.
      const res = await fetchWithAuth(`/api/lms/matriculas/${matriculaId}/finalizar`, { method: 'POST' });
      const body = (await res.json()) as { success?: boolean; code?: string };
      if (!res.ok || !body.success) throw new Error(body.code ?? 'CERTIFICATE_RETRY_FAILED');
      void invalidateTrainingEvidenceProjections(queryClient);
      setStatus('Solicitação recebida. A emissão só é tentada para matrículas com qualificação EAD elegível e vinculada; esta resposta não confirma emissão. Consulte seus certificados e, se estiver ausente, contate a Gerência de Treinamento.');
    } catch {
      setError('Não foi possível solicitar uma nova tentativa de emissão do certificado. Tente novamente mais tarde.');
    } finally { setBusy(false); }
  }

  const card=examCard;
  const primary=examPrimary;
  const secondary=examSecondary;

  return (
    <AppLayout><div className={examPage+' max-w-3xl'} aria-labelledby="prova-titulo">
      <h1 id="prova-titulo" className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Prova final</h1>
      <p className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
        <a href={'/lms/player/' + matriculaId + '?review=1&source=exam'}
          target="_blank" rel="noopener noreferrer" className="underline"
          aria-label="Consultar o conteúdo do treinamento em outra aba, sem alterar a prova">
          Consultar conteúdo em outra aba (somente leitura)
        </a>
        <Link to={`/lms/player/${matriculaId}`} className="underline">Voltar ao treinamento</Link>
      </p>
      {error ? <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <p role="status" aria-live="polite" className="mb-2 min-h-5 text-xs text-slate-500 dark:text-slate-400">{status}</p>

      {!exam && !error ? <p className={card}>Carregando…</p> : null}

      {exam && !attempt ? (
        <section className={card} aria-label="Situação da prova">
          {exam.state === 'NOT_AVAILABLE' ? <p>Este treinamento não tem avaliação disponível para você no momento.</p> : null}
          {exam.state === 'STUDY_PENDING' ? <p>Conclua todo o conteúdo do treinamento para liberar a avaliação.</p> : null}
          {exam.state === 'COMPLETED' ? (
            <>
              <h2 className="mb-3 text-lg font-semibold">{completionConfirmed?'Conclusão confirmada pelo LMS':'Treinamento já concluído.'}</h2>
              <p className="mb-2 text-sm">Matrícula #{matriculaId}. {exam.certificate==='ISSUED'?'Certificado emitido.':exam.certificate==='NOT_APPLICABLE'?'Não há certificado EAD aplicável.':'Emissão de certificado ainda não confirmada.'}</p>
              <Link to="/lms" className={secondary+' mb-4'}>Consultar meus treinamentos</Link>
              {exam.certificate === 'ISSUED' ? <p className="text-sm">Certificado emitido. Consulte seus certificados.</p> : null}
              {exam.certificate !== 'ISSUED' && exam.certificate !== 'NOT_APPLICABLE' ? (
                <>
                  <p className="mb-3 text-sm">Solicite uma nova tentativa apenas se este treinamento gera certificado EAD e o documento ainda não aparece. A solicitação não garante emissão.</p>
                  <button type="button" className={secondary} disabled={busy} onClick={() => void retryCertificate()}>
                    Solicitar nova tentativa de emissão do certificado
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          {exam.state === 'READY' ? (
            <>
              <p className="mb-3">Estudo concluído. A prova avalia o conteúdo do treinamento e as respostas são corrigidas pelo sistema.
                {exam.attemptsUsed > 0 ? ` Tentativas anteriores: ${exam.attemptsUsed}.` : ''}</p>
              {exam.attemptPolicy ? <p className="mb-3 text-sm">
                Limite: {exam.attemptPolicy.maxAttempts} tentativa(s).
                {exam.attemptPolicy.timeLimitMinutes===null
                  ? ' Sem limite de tempo por tentativa.'
                  : ` Tempo máximo: ${exam.attemptPolicy.timeLimitMinutes} minutos por tentativa.`}
              </p> : null}
              {!exam.hasOpenAttempt&&exam.attemptPolicy&&exam.attemptsUsed>=exam.attemptPolicy.maxAttempts
                ? <p role="alert" className="mb-3 text-sm">Limite de tentativas atingido. Procure a gestão de treinamento.</p> : null}
              {!exam.hasOpenAttempt&&exam.nextAttemptAt&&Date.parse(exam.nextAttemptAt)>Date.now()
                ? <p role="alert" className="mb-3 text-sm">Uma nova tentativa estará disponível após o intervalo obrigatório da prova.</p> : null}
              <button type="button" className={primary}
                disabled={busy||(!exam.hasOpenAttempt&&(
                  (exam.attemptPolicy!==null&&exam.attemptPolicy!==undefined&&exam.attemptsUsed>=exam.attemptPolicy.maxAttempts)||
                  (!!exam.nextAttemptAt&&Date.parse(exam.nextAttemptAt)>Date.now())))}
                onClick={() => void start()}>
                {exam.hasOpenAttempt ? 'Retomar prova' : exam.attemptsUsed > 0 ? 'Tentar novamente' : 'Iniciar prova'}
              </button>
            </>
          ) : null}
          {exam.state === 'PASSED' ? (
            <>
              <p className="mb-3 font-semibold">Aprovado na prova final.</p>
              <p className="mb-3 text-sm">Falta registrar a conclusão do treinamento.</p>
              <button type="button" className={primary} disabled={busy} onClick={() => void finalize()}>Concluir treinamento</button>
            </>
          ) : null}
        </section>
      ) : null}

      {attempt && attempt.state === 'IN_PROGRESS' ? (
        <form onSubmit={e => { e.preventDefault(); if (!busy && !saveInFlight.current) setConfirming(true); }} aria-label={`Tentativa ${attempt.attemptNo}`}>
          {attempt.expiresAt ? <div role="timer" aria-live="off" className={(remainingMs!==null&&remainingMs<=600000?examWarning:card)+' mb-3'}>
            <span className="font-semibold">Tempo restante: {remainingLabel}</span>
            <p className="mt-1 text-sm">Prazo: {new Date(attempt.expiresAt).toLocaleString('pt-BR')}. O tempo continua correndo durante a consulta.</p>
            {remainingMs!==null&&remainingMs<=60000?<p role="alert" className="mt-1 text-sm font-semibold">Menos de 1 minuto restante.</p>:
              remainingMs!==null&&remainingMs<=300000?<p className="mt-1 text-sm font-semibold">Menos de 5 minutos restantes.</p>:
              remainingMs!==null&&remainingMs<=600000?<p className="mt-1 text-sm font-semibold">Menos de 10 minutos restantes.</p>:null}
          </div>:null}
          <section className={card+' mb-4'} aria-label="Progresso da prova">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{answered} de {total} questões respondidas</strong>
              <span className="text-sm">{unanswered} pendente(s)</span>
            </div>
            <progress className="mt-2 h-3 w-full accent-primary" max={Math.max(total,1)} value={answered} aria-label="Progresso de respostas"/>
            <nav className="mt-3 flex flex-wrap gap-2" aria-label="Selecionar questão">
              {questionList.map((q,i)=><button type="button" key={q.questionId} aria-current={questionIndex===i?'step':undefined}
                aria-label={'Ir para questão '+(i+1)+(answers[q.questionId]?' respondida':' pendente')}
                className={(i===questionIndex?primary:secondary)+' min-w-11'}
                onClick={()=>setQuestionIndex(i)}>{i+1}{answers[q.questionId]?' ✓':''}</button>)}
            </nav>
          </section>
          {questionList.map((q,i)=>i!==questionIndex?null:<section key={q.questionId} className="mb-6" aria-label={'Questão '+(i+1)}>
            <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Módulo {q.moduleId} · Questão {i+1} de {total}</h2>
            <fieldset className={card+' mb-3'}>
              <legend className="px-1 text-base font-semibold">Questão {i+1}. {q.prompt}</legend>
              {q.choices.map(c=><label key={c.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2 text-sm">
                <input type="radio" name={q.questionId} value={c.id} className="mt-1"
                  checked={answers[q.questionId]===c.id} disabled={busy||saving}
                  onChange={()=>void choose(q.questionId,c.id)}/>
                <span>{c.text}</span>
              </label>)}
              {saving?<span role="status" className="text-xs">Salvando resposta. Aguarde a confirmação.</span>:null}
            </fieldset>
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className={secondary} disabled={i===0||saving} onClick={()=>setQuestionIndex(Math.max(0,i-1))}>Anterior</button>
              <button type="button" className={secondary} disabled={i===total-1||saving} onClick={()=>setQuestionIndex(Math.min(total-1,i+1))}>Próxima questão</button>
            </div>
          </section>)}
          {confirming ? (
            <div role="alertdialog" ref={dialogRef} aria-modal="true" aria-labelledby="confirmar-envio" onKeyDown={e=>{if(e.key==='Escape'){setConfirming(false);sendRef.current?.focus();}if(e.key==='Tab'){const buttons=dialogRef.current?.querySelectorAll('button');if(buttons?.length){if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1].focus();}else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0].focus();}}}}} className={`${card} mb-3`}>
              <p id="confirmar-envio" className="mb-3 text-sm">
                {unanswered > 0
                  ? `Você deixou ${unanswered} questão(ões) sem resposta; elas contam como erradas. Enviar mesmo assim?`
                  : 'Enviar a prova agora? Depois do envio não é possível alterar as respostas.'}
              </p>
              <div className="flex gap-2">
                <button type="button" className={primary} disabled={busy || saving} onClick={() => void submit()}>Confirmar envio</button>
                <button type="button" className={secondary} onClick={() => setConfirming(false)}>Voltar às questões</button>
              </div>
            </div>
          ) : (
            <button type="submit" className={primary} ref={sendRef} disabled={busy || saving}>Enviar prova</button>
          )}
        </form>
      ) : null}

      {attempt && attempt.state === 'SUBMITTED' && attempt.result ? (
        <section className={card} aria-label="Resultado da prova">
          <p className="mb-2 font-semibold">{attempt.result.passed ? 'Aprovado' : 'Não aprovado'}</p>
          {attempt.result.expired ? <p role="alert" className="mb-2 text-sm">Tempo esgotado: esta tentativa foi encerrada sem aprovação.</p> : null}
          <ul className="mb-3 list-disc pl-5 text-sm">
            {attempt.result.sections.map((s, i) => (
              <li key={s.moduleId}>Parte {i + 1}: {s.scorePct}% — {attempt.result?.expired ? 'tentativa encerrada por tempo' : s.passed ? 'atingiu o mínimo' : 'abaixo do mínimo'}</li>
            ))}
          </ul>
          {attempt.result.unanswered > 0 ? <p className="mb-3 text-sm">Questões sem resposta: {attempt.result.unanswered}.</p> : null}
          {attempt.result.passed ? (
            <button type="button" className={primary} disabled={busy} onClick={() => void finalize()}>Concluir treinamento</button>
          ) : exam?.attemptPolicy&&exam.attemptsUsed>=exam.attemptPolicy.maxAttempts ? (
            <p className="text-sm" role="alert">Limite de tentativas atingido. Contate a gestão de treinamento.</p>
          ) : exam?.nextAttemptAt&&Date.parse(exam.nextAttemptAt)>Date.now() ? (
            <p className="text-sm" role="alert">Aguarde o intervalo obrigatório antes de uma nova tentativa.</p>
          ) : (
            <button type="button" className={primary} disabled={busy} onClick={() => { setAttempt(null); void start(); }}>Tentar novamente</button>
          )}
        </section>
      ) : null}
    </div></AppLayout>
  );
}

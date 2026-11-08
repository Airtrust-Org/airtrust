/**
 * Learner final exam screen. Everything that matters is decided by the Worker:
 * this page only shows the server state, saves choices and submits. It never
 * grades, never receives an answer key and never completes the enrollment by
 * itself: after a pass it calls the canonical /finalizar endpoint.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateTrainingEvidenceProjections } from '@/react-app/lib/compliance-source-invalidation';
import { fetchWithAuth } from '../../../config/api';

type Choice = { id: string; text: string };
type ExamQuestion = { questionId: string; prompt: string; choices: Choice[] };
type Section = { moduleId: string; questions: ExamQuestion[] };
type Result = {
  passed: boolean; answered: number; unanswered: number;
  sections: { moduleId: string; scorePct: number; passed: boolean }[];
};
type Attempt = {
  attemptId: string; attemptNo: number; state: 'IN_PROGRESS' | 'SUBMITTED';
  sections: Section[]; answers: Record<string, string>; result: Result | null;
};
type ExamState = {
  state: 'NOT_AVAILABLE' | 'STUDY_PENDING' | 'READY' | 'PASSED' | 'COMPLETED';
  certificate?: 'ISSUED' | 'MISSING' | 'NOT_APPLICABLE';
  missing: string[]; attemptsUsed: number; hasOpenAttempt?: boolean; finalizeRequired: boolean;
};
type Envelope<T> = { success: boolean; data?: T; code?: string };

const MESSAGES: Record<string, string> = {
  EXAM_RUNTIME_NOT_ACTIVATED: 'A prova final ainda não está disponível neste ambiente.',
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [exam, setExam] = useState<ExamState | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Synchronous guard: React state updates may be batched between rapid clicks.
  const saveInFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  // One key per start click: a network retry reuses it, so no duplicate attempt.
  const startKey = useRef<string>('');

  const base = `/api/lms/exams/matriculas/${matriculaId}`;
  const load = useCallback(async () => {
    setError('');
    try { setExam(await call<ExamState>(`${base}/prova`)); }
    catch (e) { setError(explain((e as { code?: string }).code)); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true); setError(''); setConfirming(false);
    if (!startKey.current) startKey.current = `exam-${crypto.randomUUID()}`;
    try {
      const data = await call<Attempt>(`${base}/tentativas`, {
        method: 'POST', headers: { 'Idempotency-Key': startKey.current },
      });
      startKey.current = '';
      setAttempt(data); setAnswers(data.answers); setStatus('');
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

  const total = attempt ? attempt.sections.reduce((n, s) => n + s.questions.length, 0) : 0;
  const unanswered = total - Object.keys(answers).length;

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
      navigate('/lms');
    } catch {
      setError('A prova foi aprovada, mas a conclusão ainda não foi registrada. Tente novamente em instantes.');
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

  const card = 'rounded-xl border border-slate-200 bg-white p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
  const primary = 'inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
  const secondary = 'inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

  return (
    <main className="mx-auto max-w-3xl px-4 py-6" aria-labelledby="prova-titulo">
      <h1 id="prova-titulo" className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Prova final</h1>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        <Link to={`/lms/player/${matriculaId}`} className="underline">Voltar ao treinamento</Link>
      </p>
      {error ? <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <p role="status" aria-live="polite" className="mb-2 min-h-5 text-xs text-slate-500 dark:text-slate-400">{status}</p>

      {!exam && !error ? <p className={card}>Carregando…</p> : null}

      {exam && !attempt ? (
        <section className={card} aria-label="Situação da prova">
          {exam.state === 'NOT_AVAILABLE' ? <p>Este treinamento não tem prova final disponível para você no momento.</p> : null}
          {exam.state === 'STUDY_PENDING' ? <p>Conclua todo o conteúdo do treinamento para liberar a prova.</p> : null}
          {exam.state === 'COMPLETED' ? (
            <>
              <p className="mb-3">Treinamento já concluído.</p>
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
              <button type="button" className={primary} disabled={busy} onClick={() => void start()}>
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
          {attempt.sections.map((section, si) => (
            <div key={section.moduleId} className="mb-6">
              <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Parte {si + 1}</h2>
              {section.questions.map((q, qi) => (
                <fieldset key={q.questionId} className={`${card} mb-3`}>
                  <legend className="px-1 text-sm font-semibold">Questão {qi + 1}. {q.prompt}</legend>
                  {q.choices.map(c => (
                    <label key={c.id} className="flex cursor-pointer items-start gap-2 py-1.5 text-sm">
                      <input type="radio" name={q.questionId} value={c.id} className="mt-1"
                        checked={answers[q.questionId] === c.id} disabled={busy || saving}
                        onChange={() => void choose(q.questionId, c.id)} />
                      <span>{c.text}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          ))}
          {confirming ? (
            <div role="alertdialog" aria-labelledby="confirmar-envio" className={`${card} mb-3`}>
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
            <button type="submit" className={primary} disabled={busy || saving}>Enviar prova</button>
          )}
        </form>
      ) : null}

      {attempt && attempt.state === 'SUBMITTED' && attempt.result ? (
        <section className={card} aria-label="Resultado da prova">
          <p className="mb-2 font-semibold">{attempt.result.passed ? 'Aprovado' : 'Não aprovado'}</p>
          <ul className="mb-3 list-disc pl-5 text-sm">
            {attempt.result.sections.map((s, i) => (
              <li key={s.moduleId}>Parte {i + 1}: {s.scorePct}% — {s.passed ? 'atingiu o mínimo' : 'abaixo do mínimo'}</li>
            ))}
          </ul>
          {attempt.result.unanswered > 0 ? <p className="mb-3 text-sm">Questões sem resposta: {attempt.result.unanswered}.</p> : null}
          {attempt.result.passed ? (
            <button type="button" className={primary} disabled={busy} onClick={() => void finalize()}>Concluir treinamento</button>
          ) : (
            <button type="button" className={primary} disabled={busy} onClick={() => { setAttempt(null); void start(); }}>Tentar novamente</button>
          )}
        </section>
      ) : null}
    </main>
  );
}

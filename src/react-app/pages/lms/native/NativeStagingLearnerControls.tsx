/**
 * Native V1 staging learner pilot: explicit start, durable lesson visits and
 * server-graded attempts. Never sets a completion status or certificate.
 * All mutations are re-read from the authenticated, pinned edition/cycle.
 */
import { useRef, useState } from 'react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import type { NativeAsset, NativeLearnerCourse } from '../../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';
import NativeCoursePreview from './NativeCoursePreview';

export type NativePilotSession = {
  nextSequence: number;
  seenLessonIds: string[];
  lastVisitedUnitId: string | null;
  latestAttempt: null | {
    attempt_number: number;
    score_pct: number | null;
    assessment_satisfied: boolean;
  };
};

type Props = {
  matriculaId: number;
  cycleId: number;
  editionHash: string;
  course: NativeLearnerCourse;
  initialSession: NativePilotSession;
  fetchAuthorizedAsset: (asset: NativeAsset, signal: AbortSignal) => Promise<Blob>;
};

function newEventId(): string {
  // Cryptographically random event ID, not a credential. Never use the
  // lesson ID as an idempotency key across enrollment cycles or retries.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'v-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function NativeStagingLearnerControls({
  matriculaId, cycleId, editionHash, course, initialSession, fetchAuthorizedAsset,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const base = `${API_BASE_URL}/lms/native/matriculas/${matriculaId}`;
  const lessonIds = new Set(course.units.filter((unit) => unit.kind === 'lesson').map((unit) => unit.id));

  async function refreshSession(): Promise<NativePilotSession> {
    const response = await fetchWithAuth(`${base}/sessao`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error('NATIVE_SESSION_RECHECK_FAILED');
    const body = await response.json() as { success?: boolean; data?: Record<string, unknown> };
    const data = body.data;
    if (body.success !== true || !data ||
        data.matricula_id !== matriculaId || data.ciclo_id !== cycleId ||
        data.edition_sha256 !== editionHash || data.mode !== 'LEARN' ||
        data.completion_supported !== false ||
        !Number.isSafeInteger(data.next_sequence) ||
        (data.next_sequence as number) < 1 || (data.next_sequence as number) > 10001 ||
        !Array.isArray(data.seen_lesson_ids) ||
        data.seen_lesson_ids.some((id: unknown) => typeof id !== 'string' || !lessonIds.has(id)) ||
        new Set(data.seen_lesson_ids).size !== data.seen_lesson_ids.length ||
        (data.last_visited_unit_id !== null &&
          (typeof data.last_visited_unit_id !== 'string' ||
            !data.seen_lesson_ids.includes(data.last_visited_unit_id)))) {
      throw new Error('NATIVE_SESSION_SCOPE_OR_LEDGER_CONFLICT');
    }
    const latest = data.latest_attempt;
    if (latest != null && (
      typeof latest !== 'object' || Array.isArray(latest) ||
      !Number.isSafeInteger((latest as Record<string, unknown>).attempt_number) ||
      ((latest as Record<string, number>).attempt_number < 1) ||
      typeof (latest as Record<string, unknown>).assessment_satisfied !== 'boolean' ||
      ((latest as Record<string, unknown>).score_pct !== null &&
        (typeof (latest as Record<string, unknown>).score_pct !== 'number' ||
         !Number.isFinite((latest as Record<string, number>).score_pct)))
    )) throw new Error('NATIVE_SESSION_INVALID_ATTEMPT');
    const next: NativePilotSession = {
      nextSequence: data.next_sequence as number,
      seenLessonIds: data.seen_lesson_ids as string[],
      lastVisitedUnitId: data.last_visited_unit_id as string | null,
      latestAttempt: latest as NativePilotSession['latestAttempt'] ?? null,
    };
    setSession(next);
    return next;
  }

  async function postEvidence(path: 'iniciar' | 'checkpoints' | 'tentativas', payload: unknown): Promise<Record<string, unknown>> {
    const response = await fetchWithAuth(`${base}/${path}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('NATIVE_WRITE_REJECTED');
    const json = await response.json() as { success?: boolean; data?: Record<string, unknown> };
    if (json.success !== true || !json.data || json.data.edition_sha256 !== editionHash ||
        json.data.completion_supported !== false) throw new Error('NATIVE_WRITE_SCOPE_CONFLICT');
    return json.data;
  }

  async function mutate(action: () => Promise<void>): Promise<void> {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch {
      // The server may have committed despite a transport error. Lock writes
      // rather than risk replay with an invented sequence or attempt number.
      setLocked(true);
      setMessage('Não foi possível confirmar o registro. Atualize a página antes de tentar novamente.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const start = () => void mutate(async () => {
    const receipt = await postEvidence('iniciar', {});
    if (receipt.ciclo_id !== cycleId ||
        !['STARTED', 'ALREADY_STARTED'].includes(String(receipt.state))) throw new Error('NATIVE_START_MISMATCH');
    await refreshSession();
    setStarted(true);
    setMessage('Registro de aprendizagem habilitado neste ciclo. Ainda não é uma conclusão.');
  });

  const visit = (unitId: string) => void mutate(async () => {
    if (!started || !lessonIds.has(unitId) ||
        session.seenLessonIds.includes(unitId) ||
        session.nextSequence > 10000) throw new Error('NATIVE_VISIT_INVALID');
    const sequence = session.nextSequence;
    const receipt = await postEvidence('checkpoints', {
      eventId: newEventId(), sequence, unitId,
    });
    if (receipt.committed_sequence !== sequence ||
        !['APPLIED', 'IDEMPOTENT_REPLAY'].includes(String(receipt.state))) {
      throw new Error('NATIVE_CHECKPOINT_MISMATCH');
    }
    const updated = await refreshSession();
    if (!updated.seenLessonIds.includes(unitId) || updated.nextSequence <= sequence) {
      throw new Error('NATIVE_CHECKPOINT_UNCONFIRMED');
    }
    setMessage('Visita registrada pelo servidor. Isso não comprova conclusão da aula.');
  });

  const submit = (answers: Array<{ questionId: string; optionId: string }>) => void mutate(async () => {
    if (!started || answers.length !== course.questions.length ||
        course.questions.some((question, i) =>
          answers[i]?.questionId !== question.id ||
          !question.options.some((option) => option.id === answers[i].optionId))) {
      throw new Error('NATIVE_ATTEMPT_INVALID');
    }
    const attemptNumber = (session.latestAttempt?.attempt_number ?? 0) + 1;
    if (attemptNumber > 500) throw new Error('NATIVE_ATTEMPTS_EXHAUSTED');
    const receipt = await postEvidence('tentativas', { attemptNumber, answers });
    if (receipt.attempt_number !== attemptNumber ||
        typeof receipt.assessment_satisfied !== 'boolean') throw new Error('NATIVE_ATTEMPT_MISMATCH');
    const updated = await refreshSession();
    if (updated.latestAttempt?.attempt_number !== attemptNumber ||
        updated.latestAttempt.assessment_satisfied !== receipt.assessment_satisfied ||
        updated.latestAttempt.score_pct !== receipt.score_pct) throw new Error('NATIVE_ATTEMPT_UNCONFIRMED');
    setMessage(updated.latestAttempt.assessment_satisfied
      ? 'Avaliação registrada e critérios de avaliação atendidos. Certificação ainda indisponível.'
      : 'Avaliação registrada; critérios de aprovação ainda não atendidos. Nenhum certificado emitido.');
  });

  return (
    <section aria-label="Piloto Native com evidências" className="space-y-4">
      <div className="mx-auto max-w-5xl space-y-2 px-4 pt-4">
        <p className="text-sm font-semibold">Piloto exclusivo de staging. Registros não emitem certificados.</p>
        {!started && !locked && (
          <button type="button" onClick={start} disabled={busy}
            className="rounded border px-4 py-2 disabled:opacity-50">
            Iniciar ou retomar registro do treinamento
          </button>
        )}
        {message && <p role={locked ? 'alert' : 'status'}>{message}</p>}
      </div>
      <NativeCoursePreview
        course={course}
        resolveAssetHref={() => null}
        fetchAuthorizedAsset={fetchAuthorizedAsset}
        initialUnitId={initialSession.lastVisitedUnitId}
        serverSeenLessonIds={session.seenLessonIds}
        onRecordLessonVisit={started && !locked ? visit : undefined}
        onSubmitAssessment={started && !locked ? submit : undefined}
        evidenceBusy={busy}
      />
    </section>
  );
}

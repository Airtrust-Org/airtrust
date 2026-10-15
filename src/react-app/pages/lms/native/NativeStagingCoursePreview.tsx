/**
 * Staging-only component, intentionally not registered in the LMS route tree.
 * It reads the server's safe learner projection with the existing rotating
 * bearer-token client. It never requests private answers or writes progress.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import type { NativeAsset, NativeLearnerCourse } from '../../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';
import NativeCoursePreview from './NativeCoursePreview';
import NativeStagingLearnerControls, { type NativePilotSession } from './NativeStagingLearnerControls';

type PreviewResponse = {
  success: boolean;
  data?: {
    matricula_id: number;
    ciclo_id: number;
    edition_sha256: string;
    mode: 'LEARN' | 'REVIEW';
    completion_supported: boolean;
    evidence_write_enabled?: boolean;
    course: NativeLearnerCourse;
  };
};

type ResumeResponse = {
  success: boolean;
  data?: {
    matricula_id: number;
    ciclo_id: number;
    edition_sha256: string;
    mode: 'LEARN' | 'REVIEW';
    last_visited_unit_id: string | null;
    next_sequence: number;
    seen_lesson_ids: string[];
    latest_attempt?: {
      attempt_number: number;
      score_pct: number | null;
      assessment_satisfied: boolean;
    } | null;
    completion_supported: boolean;
  };
};
type NativeResume = NativePilotSession & { initialUnitId: string | null };

export default function NativeStagingCoursePreview({ matriculaId, onVerifiedStarted }: {
  matriculaId: number; onVerifiedStarted?: () => void;
}) {
  const [course, setCourse] = useState<NativeLearnerCourse | null>(null);
  const [resume, setResume] = useState<NativeResume | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'UNAVAILABLE'>('LOADING');
  // READY belongs to the enrollment whose Worker snapshots were checked.
  // Effect cleanup runs after render, so state alone cannot guard a prop switch.
  const [authorizedMatriculaId,setAuthorizedMatriculaId]=useState<number|null>(null);
  const [writeScope, setWriteScope] = useState<{ cycleId: number; editionHash: string; enabled: boolean; completionSupported: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCourse(null);
    setResume(null);
    setAuthorizedMatriculaId(null);
    setWriteScope(null);
    setStatus('LOADING');
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
      setStatus('UNAVAILABLE');
      return () => controller.abort();
    }
    void (async () => {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/lms/native/matriculas/${matriculaId}/curso`,
        { method: 'GET', signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) throw new Error('NATIVE_COURSE_UNAVAILABLE');
      const payload = await response.json() as PreviewResponse;
      if (payload.success !== true || !payload.data ||
          payload.data.matricula_id !== matriculaId ||
          typeof payload.data.completion_supported !== 'boolean' ||
          !/^[a-f0-9]{64}$/.test(payload.data.edition_sha256) ||
          payload.data.course?.schema !== 'AIRTRUST_NATIVE_COURSE_V1' ||
          !Array.isArray(payload.data.course.units) ||
          !Array.isArray(payload.data.course.assets) ||
          !Array.isArray(payload.data.course.questions) ||
          payload.data.course.questions.some((q) =>
            'correctOptionId' in q || 'feedbackCorrect' in q || 'feedbackIncorrect' in q
          )) throw new Error('NATIVE_UNSAFE_PREVIEW_PAYLOAD');
      // A resume snapshot is accepted only for the exact edition, cycle,
      // enrollment and mode already authenticated by the course endpoint.
      const resumeResponse = await fetchWithAuth(
        `${API_BASE_URL}/lms/native/matriculas/${matriculaId}/sessao`,
        { method: 'GET', signal: controller.signal, cache: 'no-store' },
      );
      if (!resumeResponse.ok) throw new Error('NATIVE_RESUME_UNAVAILABLE');
      const resumePayload = await resumeResponse.json() as ResumeResponse;
      const state = resumePayload.data;
      if (!resumePayload.success || !state ||
          state.matricula_id !== matriculaId ||
          state.edition_sha256 !== payload.data.edition_sha256 ||
          state.ciclo_id !== payload.data.ciclo_id ||
          state.mode !== payload.data.mode ||
          state.completion_supported !== payload.data.completion_supported ||
          !Number.isSafeInteger(state.next_sequence) ||
          state.next_sequence < 1 || state.next_sequence > 10001 ||
          (state.latest_attempt != null && (
            !Number.isSafeInteger(state.latest_attempt.attempt_number) ||
            state.latest_attempt.attempt_number < 1 ||
            state.latest_attempt.attempt_number > 500 ||
            typeof state.latest_attempt.assessment_satisfied !== 'boolean' ||
            (state.latest_attempt.score_pct !== null &&
              (typeof state.latest_attempt.score_pct !== 'number' ||
                !Number.isFinite(state.latest_attempt.score_pct) ||
                state.latest_attempt.score_pct < 0 ||
                state.latest_attempt.score_pct > 100))
          )) ||
          !Array.isArray(state.seen_lesson_ids) ||
          state.seen_lesson_ids.some((id) => typeof id !== 'string') ||
          (state.last_visited_unit_id !== null &&
            typeof state.last_visited_unit_id !== 'string')) {
        throw new Error('NATIVE_RESUME_EDITION_CONFLICT');
      }
      const lessonIds = new Set(payload.data.course.units
        .filter((unit) => unit.kind === 'lesson').map((unit) => unit.id));
      if (new Set(state.seen_lesson_ids).size !== state.seen_lesson_ids.length ||
          state.seen_lesson_ids.some((id) => !lessonIds.has(id)) ||
          (state.last_visited_unit_id !== null &&
            !state.seen_lesson_ids.includes(state.last_visited_unit_id))) {
        throw new Error('NATIVE_RESUME_INVALID_UNITS');
      }
      if (!controller.signal.aborted) {
        setCourse(payload.data.course);
        setResume({
          initialUnitId: state.last_visited_unit_id,
          lastVisitedUnitId: state.last_visited_unit_id,
          seenLessonIds: state.seen_lesson_ids,
          nextSequence: state.next_sequence,
          latestAttempt: state.latest_attempt ?? null,
        });
        setWriteScope({
          cycleId: payload.data.ciclo_id,
          editionHash: payload.data.edition_sha256,
          enabled: payload.data.evidence_write_enabled === true && payload.data.mode === 'LEARN',
          completionSupported: payload.data.completion_supported === true,
        });
        setAuthorizedMatriculaId(matriculaId);
        setStatus('READY');
      }
    })().catch(() => {
      if (!controller.signal.aborted) setStatus('UNAVAILABLE');
    });
    return () => controller.abort();
  }, [matriculaId]);

  const fetchAsset = useCallback(async (asset: NativeAsset, signal: AbortSignal): Promise<Blob> => {
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(asset.id)) {
      throw new Error('NATIVE_INVALID_ASSET_REQUEST');
    }
    const response = await fetchWithAuth(
      `${API_BASE_URL}/lms/native/matriculas/${matriculaId}/assets/${encodeURIComponent(asset.id)}`,
      { method: 'GET', cache: 'no-store', signal },
    );
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== asset.mime) {
      throw new Error('NATIVE_ASSET_UNAVAILABLE');
    }
    // The Worker restricts media to 12 MiB and verifies SHA before responding.
    // Retain a browser-side bound; do not consume an unbounded error/stream body.
    const declared = Number(response.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > 12 * 1024 * 1024) {
      throw new Error('NATIVE_ASSET_OVERSIZE');
    }
    const blob = await response.blob();
    if (blob.size !== declared || blob.type !== asset.mime) {
      throw new Error('NATIVE_ASSET_INVALID_RESPONSE');
    }
    return blob;
  }, [matriculaId]);

  // Hide the old course immediately on a React prop change, before the new
  // request effect can clear its previous course, assessments or write scope.
  if (status === 'READY' && authorizedMatriculaId !== matriculaId) {
    return <p role="status">Carregando prévia do treinamento…</p>;
  }
  if (status !== 'READY' || !course || !resume) {
    return <p role={status === 'UNAVAILABLE' ? 'alert' : 'status'}>
      {status === 'LOADING'
        ? 'Carregando prévia do treinamento…'
        : 'Prévia nativa indisponível. Nenhum progresso foi alterado.'}
    </p>;
  }
  if (writeScope?.enabled) {
    return <NativeStagingLearnerControls
      key={`${matriculaId}:${writeScope.cycleId}:${writeScope.editionHash}`}
      course={course}
      matriculaId={matriculaId}
      cycleId={writeScope.cycleId}
      editionHash={writeScope.editionHash}
      initialSession={resume}
      completionSupported={writeScope.completionSupported}
      fetchAuthorizedAsset={fetchAsset}
      onVerifiedStarted={onVerifiedStarted}
    />;
  }
  return (
    <NativeCoursePreview
      course={course}
      resolveAssetHref={() => null}
      fetchAuthorizedAsset={fetchAsset}
      initialUnitId={resume.initialUnitId}
      serverSeenLessonIds={resume.seenLessonIds}
    />
  );
}

/**
 * Staging-only component, intentionally not registered in the LMS route tree.
 * It reads the server's safe learner projection with the existing rotating
 * bearer-token client. It never requests private answers or writes progress.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import type { NativeAsset, NativeLearnerCourse } from '../../../../../worker-airtrust/src/lib/lms/lms-native-course-contract';
import NativeCoursePreview from './NativeCoursePreview';

type PreviewResponse = {
  success: boolean;
  data?: {
    matricula_id: number;
    ciclo_id: number;
    edition_sha256: string;
    mode: 'LEARN' | 'REVIEW';
    completion_supported: boolean;
    course: NativeLearnerCourse;
  };
};

export default function NativeStagingCoursePreview({ matriculaId }: { matriculaId: number }) {
  const [course, setCourse] = useState<NativeLearnerCourse | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'UNAVAILABLE'>('LOADING');

  useEffect(() => {
    const controller = new AbortController();
    setCourse(null);
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
          payload.data.completion_supported !== false ||
          !/^[a-f0-9]{64}$/.test(payload.data.edition_sha256) ||
          payload.data.course?.schema !== 'AIRTRUST_NATIVE_COURSE_V1' ||
          !Array.isArray(payload.data.course.units) ||
          !Array.isArray(payload.data.course.assets) ||
          !Array.isArray(payload.data.course.questions) ||
          payload.data.course.questions.some((q) =>
            'correctOptionId' in q || 'feedbackCorrect' in q || 'feedbackIncorrect' in q
          )) throw new Error('NATIVE_UNSAFE_PREVIEW_PAYLOAD');
      if (!controller.signal.aborted) {
        setCourse(payload.data.course);
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

  if (status !== 'READY' || !course) {
    return <p role={status === 'UNAVAILABLE' ? 'alert' : 'status'}>
      {status === 'LOADING'
        ? 'Carregando prévia do treinamento…'
        : 'Prévia nativa indisponível. Nenhum progresso foi alterado.'}
    </p>;
  }
  return (
    <NativeCoursePreview
      course={course}
      resolveAssetHref={() => null}
      fetchAuthorizedAsset={fetchAsset}
    />
  );
}

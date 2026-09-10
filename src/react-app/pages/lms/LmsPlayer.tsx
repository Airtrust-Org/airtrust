import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useMatriculaDetalhe } from '@/react-app/hooks/useLms';
import LmsPlayerBase from './LmsPlayerBase';

export { resolveLmsDisplayProgress, sanitizeDiagnosticCode } from './LmsPlayerBase';

/**
 * Thin lifecycle wrapper around the canonical player.
 *
 * The base player already clears stale rejection UI when the backend confirms
 * canonical completion. This wrapper covers the remaining presentation edge:
 * if a live enrollment actually transitions from a non-completed status to
 * CONCLUIDO without an explicit lms:completed message, surface the success
 * acknowledgement once. Opening an enrollment that was already completed does
 * not trigger a new success notification, and explicit review mode stays quiet.
 */
export default function LmsPlayer() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const [searchParams] = useSearchParams();
  const id = Number(matriculaId);
  const { data: matricula } = useMatriculaDetalhe(id);

  const previousStatusRef = useRef<string | null>(null);
  const observedNonCompletedRef = useRef(false);
  const canonicalSuccessShownRef = useRef(false);
  const reviewParam = searchParams.get('review') === '1';
  const status = matricula?.status ?? null;

  useEffect(() => {
    if (!status) return;

    if (status !== 'CONCLUIDO') {
      previousStatusRef.current = status;
      observedNonCompletedRef.current = true;
      canonicalSuccessShownRef.current = false;
      return;
    }

    const transitionedToConcluded =
      observedNonCompletedRef.current && previousStatusRef.current !== 'CONCLUIDO';

    previousStatusRef.current = status;

    if (reviewParam || !transitionedToConcluded || canonicalSuccessShownRef.current) {
      return;
    }

    canonicalSuccessShownRef.current = true;

    // Let the base player's canonical cleanup effect settle first. Using the
    // same toast id also coalesces with an lms:completed success notification
    // instead of producing a duplicate toast.
    const timer = window.setTimeout(() => {
      toast.success('Curso concluído e registrado com sucesso.', {
        id: `lms-scorm-completion-${id}`,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [id, reviewParam, status]);

  return <LmsPlayerBase />;
}

import { fetchWithAuth } from '@/react-app/config/api';

/**
 * The SCORM asset HttpOnly-cookie handshake is a scoped, non-completion POST.
 * Token refresh may hang before fetch starts, so an AbortController by itself
 * cannot guarantee release of the student's player loading screen.
 */
export async function authorizeScormAssetSession(params: {
  matriculaId: number;
  expectedHandoffId: number | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (params.signal?.aborted) controller.abort();
  else params.signal?.addEventListener('abort', abort, { once: true });
  let deadlineId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    deadlineId = setTimeout(() => {
      controller.abort();
      reject(new Error('ASSET_SESSION_TIMEOUT'));
    }, params.timeoutMs ?? 20_000);
  });
  try {
    return await Promise.race([
      fetchWithAuth('/api/lms/assets/session', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          matricula_id: params.matriculaId,
          expected_handoff_id: params.expectedHandoffId,
        }),
      }),
      deadline,
    ]);
  } finally {
    if (deadlineId !== undefined) clearTimeout(deadlineId);
    params.signal?.removeEventListener('abort', abort);
  }
}

/**
 * All learner PDF/PPTX asset downloads must use the same rotating, tenant-bound
 * authenticated transport as the rest of the LMS. Reading a cached access
 * token and sending an unauthenticated transport request strands learners on 401
 * after an access-token rotation. This helper never grants completion.
 */
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

export type LmsProtectedAssetKind = 'pdf' | 'pptx';

export async function fetchLmsCourseAsset(
  kind: LmsProtectedAssetKind,
  cursoId: number,
): Promise<Response> {
  if ((kind !== 'pdf' && kind !== 'pptx') ||
      !Number.isSafeInteger(cursoId) || cursoId <= 0) {
    throw new Error('LMS_PROTECTED_ASSET_INVALID_SCOPE');
  }
  // fetchWithAuth handles an expired access token and 401 exactly once;
  // do not forward a cached bearer token that would override its refresh.
  return fetchWithAuth(`${API_BASE_URL}/lms/${kind}/asset/${cursoId}`, {
    method: 'GET',
    cache: 'no-store',
  });
}

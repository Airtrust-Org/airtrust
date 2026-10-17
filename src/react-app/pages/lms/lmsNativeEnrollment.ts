import { fetchWithAuth } from '@/react-app/config/api';

/**
 * Native pilot only. Unlike SCORM enrollment, the backend derives the
 * employee and edition from the authenticated session and verified R2.
 * No fallback to legacy matrícula if this endpoint is not enabled.
 */
export async function createNativeEnrollment(cursoId: number): Promise<number> {
  if (!Number.isSafeInteger(cursoId) || cursoId <= 0) {
    throw new Error('Identificação do curso inválida.');
  }
  const response = await fetchWithAuth(`/api/lms/native/cursos/${cursoId}/matricular`, {
    method: 'POST',
  });
  const json = await response.json().catch(() => null) as {
    success?: boolean; data?: { matricula_id?: number };
  } | null;
  if (!response.ok || !json?.success ||
      !Number.isSafeInteger(json?.data?.matricula_id) || (json?.data?.matricula_id ?? 0) <= 0) {
    // Never attempt the old SCORM enrollment on failed Native authorization.
    throw new Error('A matrícula Native ainda não está disponível para este curso.');
  }
  return json.data!.matricula_id!;
}

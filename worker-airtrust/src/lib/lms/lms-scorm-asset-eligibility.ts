/** Shared SCORM asset boundary: never grant legacy playback to a Native course. */
import { ApiError } from '../../middleware/error-handler';

export function assertScormAssetEligibility(tipoConteudo: string | null | undefined, message: string): void {
  if (String(tipoConteudo ?? '').trim().toLowerCase() === 'native') throw new ApiError(message, 409);
}

export function isPrivilegedRole(rawRole: unknown): boolean {
  const role = String(rawRole ?? '')
    .trim()
    .toLowerCase();
  return ['admin', 'administrador', 'manager', 'gestor', 'instrutor', 'instructor'].includes(role);
}

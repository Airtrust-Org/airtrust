/** Shared SCORM asset boundary: never grant legacy playback to a Native course. */
import { ApiError } from '../../middleware/error-handler';
import { isNativeForLegacyLmsPath } from '../../services/lms-native-catalog-legacy-guard';
import type { Env } from '../../types';

export function assertScormAssetEligibility(tipoConteudo: string | null | undefined, message: string): void {
  if (String(tipoConteudo ?? '').trim().toLowerCase() === 'native') throw new ApiError(message, 409);
}

export function isPrivilegedRole(rawRole: unknown): boolean {
  const role = String(rawRole ?? '')
    .trim()
    .toLowerCase();
  return ['admin', 'administrador', 'manager', 'gestor', 'instrutor', 'instructor'].includes(role);
}

/** Single boundary for physical Native AND staging-activated SCORM editions. */
export async function assertScormAssetRouteAllowed(
  env: Env, empresaId: number, cursoId: number,
  tipoConteudo: string | null | undefined, message: string,
): Promise<void> {
  if (await isNativeForLegacyLmsPath(env, empresaId, cursoId, tipoConteudo)) {
    throw new ApiError(message, 409);
  }
}

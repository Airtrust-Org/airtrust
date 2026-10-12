/**
 * Staging-only defensive read barrier for a future immutable Native catalog
 * activation side-table. This is NOT approval to create or activate a course.
 * The flag must be enabled after the governed table exists and BEFORE any row
 * is activated. D1 lookup failures fail closed; physical Native always blocks.
 */
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';

function exactTenantAllowed(raw: string | undefined, empresaId: number): boolean {
  return !!raw && !raw.includes('*') &&
    raw.split(',').some((value) => value.trim() === String(empresaId));
}

export function canReadNativeCatalogActivation(env: Env, empresaId: number): boolean {
  return env.ENVIRONMENT === 'staging' &&
    Number.isSafeInteger(empresaId) && empresaId > 0 &&
    exactTenantAllowed(env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS, empresaId);
}

/**
 * Binds any Native course selection to the effective type when the staging
 * activation table is enabled. No activation SQL is referenced in production
 * or until the exact tenant is allowlisted.
 */
export function nativeCourseIdentityPredicate(env: Env | undefined, empresaId: number): string {
  if (!env || !canReadNativeCatalogActivation(env, empresaId)) return "c.tipo_conteudo='native'";
  return "(c.tipo_conteudo='native' OR (c.tipo_conteudo='scorm' AND EXISTS (" +
    "SELECT 1 FROM lms_native_catalog_activation a " +
    "WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id)))";
}

export async function isNativeForLegacyLmsPath(
  env: Env, empresaId: number, cursoId: number, tipoConteudo: string | null | undefined,
): Promise<boolean> {
  const physical = String(tipoConteudo ?? '').trim().toLowerCase();
  if (physical === 'native') return true;
  if (physical !== 'scorm') return false;
  if (env.ENVIRONMENT !== 'staging' ||
      !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(cursoId) || cursoId <= 0 ||
      !exactTenantAllowed(env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS, empresaId)) {
    return false;
  }
  try {
    const row = await env.DB.prepare(
      'SELECT curso_id FROM lms_native_catalog_activation ' +
      'WHERE empresa_id = ? AND curso_id = ? LIMIT 1',
    ).bind(empresaId, cursoId).first<{ curso_id: number }>();
    return row?.curso_id === cursoId;
  } catch {
    throw new ApiError('Catálogo Native indisponível para validar a rota legada.',
      503, 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED');
  }
}

/**
 * Staging-only Native catalog guard in front of ALL legacy course-id writes:
 * POST/PUT/PATCH/DELETE on the canonical router and hardened upload router.
 *
 * All requests have already passed the route's auth() middleware; RBAC
 * authorization remains enforced by the downstream handler. No request
 * body is buffered, no R2 keys are read, and missing marker-table lookups
 * fail closed only when an explicit staging tenant read flag is enabled.
 */
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { ApiError } from './error-handler';
import { isNativeForLegacyLmsPath } from '../services/lms-native-catalog-legacy-guard';
import { getEmpresaIdSafe } from '../routes/escalas-shared';

export async function guardLegacyCourseMutation(
  c: Context<{ Bindings: Env }>, next: Next,
): Promise<void | Response> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    await next();
    return;
  }
  const rawId = c.req.param('id');
  if (!rawId || !/^[1-9][0-9]{0,15}$/.test(rawId)) {
    await next();
    return;
  }
  const cursoId = Number(rawId);
  if (!Number.isSafeInteger(cursoId)) {
    await next();
    return;
  }
  const empresaId = getEmpresaIdSafe(c);
  const curso = await c.env.DB.prepare(
    'SELECT id, tipo_conteudo FROM lms_cursos ' +
    'WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
  ).bind(cursoId, empresaId).first<{ id: number; tipo_conteudo: string | null }>();

  // Preserve original 404/permission logic for non-existent course IDs.
  if (curso && await isNativeForLegacyLmsPath(
    c.env, empresaId, cursoId, curso.tipo_conteudo,
  )) {
    throw new ApiError('Curso Native exige gestão e publicação pelo fluxo próprio.',
      409, 'NATIVE_LEGACY_COURSE_MUTATION_BLOCKED');
  }
  await next();
}

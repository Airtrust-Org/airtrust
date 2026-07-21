/**
 * Permissões explícitas da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Não reutiliza requireRole()/RBAC de role cacheada no JWT: consulta
 * `usuarios_empresas` diretamente, por requisição, escopada à empresa ativa
 * do tenant. Isso evita depender de over-provisioning de role "instructor"
 * e garante que o vínculo usuário↔empresa↔role esteja ativo agora, não no
 * momento em que o token foi emitido.
 *
 *   simuladores.guias_instrutor.read   → INSTRUTOR, GESTOR, ADMIN, SUPER_ADMIN
 *   simuladores.guias_instrutor.manage → GESTOR, ADMIN, SUPER_ADMIN (não instrutor)
 */

import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { getTenantContext, normalizeContextUserId } from './tenant';
import { forbidden, unauthorized } from './error-handler';

const READ_ROLES = new Set(['INSTRUTOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN']);
const MANAGE_ROLES = new Set(['GESTOR', 'ADMIN', 'SUPER_ADMIN']);

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

async function resolveActiveVinculoRole(
  db: D1Database,
  usuarioId: number,
  empresaId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT role FROM usuarios_empresas
       WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(usuarioId, empresaId)
    .first<{ role: string }>();

  return row?.role ? String(row.role).toUpperCase() : null;
}

function guardWithAllowedRoles(
  allowedRoles: Set<string>,
  deniedMessage: string,
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    if (isDevAuthBypassEnabled(c.env)) {
      await next();
      return;
    }

    const userId = normalizeContextUserId(c.get('userId'));
    if (!userId) {
      throw unauthorized('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    const { empresaId } = getTenantContext(c);

    const role = await resolveActiveVinculoRole(c.env.DB, userId, empresaId);
    if (!role || !allowedRoles.has(role)) {
      throw forbidden(deniedMessage, 'GUIAS_INSTRUTOR_FORBIDDEN');
    }

    c.set('guiasInstrutorRole' as never, role as never);
    await next();
  };
}

export const requireGuiaInstrutorRead = () =>
  guardWithAllowedRoles(
    READ_ROLES,
    'Acesso restrito a instrutores autorizados da empresa ativa',
  );

export const requireGuiaInstrutorManage = () =>
  guardWithAllowedRoles(
    MANAGE_ROLES,
    'Publicação de guias restrita a gestores/administradores autorizados',
  );

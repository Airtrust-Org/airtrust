/**
 * RBAC MIDDLEWARE - Role-Based Access Control
 * Controla acesso às rotas por papel (role)
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { forbidden } from './error-handler';
import { enforceLegacyTenantBoundaries } from './legacy-tenant-boundaries';
import { normalizeTenantRole } from './tenant';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

export type UserRole = 'admin' | 'manager' | 'instructor' | 'student' | 'viewer' | 'editor';

/**
 * Normaliza role do banco (PT-BR) para o padrão RBAC.
 * Delega para normalizeTenantRole (fonte canônica do mapeamento):
 *   ADMIN/admin/administrador            → admin
 *   GESTOR/gestor/manager/compliance     → manager
 *   INSTRUTOR/instructor                 → instructor
 *   EDITOR/editor                        → editor
 *   USUARIO/usuario/aluno/student/member → student
 *   VIEWER/viewer (e desconhecidos)      → viewer
 */
function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  return normalizeTenantRole(raw);
}

/**
 * Middleware para exigir role específica
 *
 * @param roles Lista de roles permitidas
 * @returns Middleware handler
 *
 * @example
 * ```typescript
 * // Apenas admin pode deletar funcionários
 * app.delete('/api/funcionarios/:id', auth(), requireRole('admin'), handlerDelete);
 *
 * // Admin e manager podem criar funcionários
 * app.post('/api/funcionarios', auth(), requireRole('admin', 'manager'), handlerCreate);
 * ```
 */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const devBypassEnabled = isDevAuthBypassEnabled(c.env);

    if (devBypassEnabled) {
      console.log('[RBAC] 🔓 DEV_AUTH_BYPASS enabled - skipping role check');
      await next();
      return;
    }

    const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));

    if (!userRole) {
      throw forbidden('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    if (!roles.includes(userRole)) {
      console.warn(
        `[RBAC] Access denied: user role "${userRole}" not in allowed roles [${roles.join(', ')}]`,
      );

      throw forbidden(`Permissão negada. Acesso restrito a: ${roles.join(', ')}`, 'RBAC_FORBIDDEN');
    }

    await enforceLegacyTenantBoundaries(c);
    await next();
  };
}

/**
 * Helper: verificar se usuário tem role específica.
 *
 * A assinatura é genérica para preservar as Variables tipadas de cada contexto
 * Hono sem alterar a lógica RBAC ou permitir novos papéis.
 *
 * @param c Context do Hono
 * @param roles Roles permitidas
 * @returns true se usuário tem uma das roles
 */
export function hasRole<E extends { Bindings: Env }>(
  c: Context<E>,
  ...roles: UserRole[]
): boolean {
  const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));
  return !!userRole && roles.includes(userRole);
}

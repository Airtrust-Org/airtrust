/**
 * RBAC MIDDLEWARE - Role-Based Access Control
 * Controla acesso às rotas por papel (role)
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { forbidden } from './error-handler';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

export type UserRole = 'admin' | 'manager' | 'user';

/**
 * Normaliza role do banco (PT-BR) para o padrão RBAC:
 *   ADMIN/admin → admin
 *   GESTOR/gestor/manager → manager
 *   USUARIO/usuario/user  → user
 */
function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().trim();
  if (r === 'admin' || r === 'administrador') return 'admin';
  if (r === 'gestor' || r === 'manager') return 'manager';
  if (r === 'instrutor' || r === 'instructor') return 'manager'; // instrutor has manager-level access for routes
  if (r === 'usuario' || r === 'user' || r === 'aluno' || r === 'student') return 'user';
  return r as UserRole;
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

    await next();
  };
}

/**
 * Helper: verificar se usuário tem role específica
 *
 * @param c Context do Hono
 * @param roles Roles permitidas
 * @returns true se usuário tem uma das roles
 */
export function hasRole(c: Context<{ Bindings: Env }>, ...roles: UserRole[]): boolean {
  const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));
  return !!userRole && roles.includes(userRole);
}

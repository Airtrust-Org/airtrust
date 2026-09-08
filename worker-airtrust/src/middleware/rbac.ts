/**
 * RBAC MIDDLEWARE - Role-Based Access Control
 * Controla acesso às rotas por papel (role)
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { forbidden } from './error-handler';
import { enforceLegacyTenantBoundaries } from './legacy-tenant-boundaries';
import { getTenantContext, normalizeTenantRole } from './tenant';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

export type UserRole = 'admin' | 'manager' | 'instructor' | 'student' | 'viewer' | 'editor';
export type DynamicPermissionModule =
  | 'qualificacoes'
  | 'escalas'
  | 'lms'
  | 'certificados'
  | 'frms'
  | 'simuladores'
  | 'funcionarios'
  | 'relatorios'
  | 'agendamentos';
export type DynamicPermissionAction = 'visualizar' | 'editar' | 'criar' | 'deletar';

type DynamicPermissionProfile = 'GESTOR' | 'INSTRUTOR' | 'ALUNO';

type DynamicPermissionRow = {
  permitido: number;
};

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

function dynamicProfileForRole(role: UserRole): DynamicPermissionProfile | null {
  switch (role) {
    case 'manager':
      return 'GESTOR';
    case 'instructor':
      return 'INSTRUTOR';
    case 'student':
      return 'ALUNO';
    default:
      return null;
  }
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
 * Autoridade server-side para permissões dinâmicas por perfil/tenant.
 *
 * Regras:
 * - `defaultRoles` preserva exatamente o RBAC estático atual quando não há override configurado;
 * - ADMIN/EDITOR/VIEWER não possuem linha configurável em `perfis_permissoes` e seguem o baseline;
 * - GESTOR/INSTRUTOR/ALUNO consultam somente o tenant autenticado;
 * - uma linha existente é autoridade explícita, permitindo DENY ou GRANT sobre o baseline;
 * - ausência de linha mantém o baseline, evitando mudança de comportamento na adoção;
 * - erro de leitura nunca concede acesso: a exceção interrompe a requisição (fail-closed).
 */
export function requirePermission(
  modulo: DynamicPermissionModule,
  acao: DynamicPermissionAction,
  ...defaultRoles: UserRole[]
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (isDevAuthBypassEnabled(c.env)) {
      console.log('[RBAC] 🔓 DEV_AUTH_BYPASS enabled - skipping dynamic permission check');
      await next();
      return;
    }

    const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));
    if (!userRole) {
      throw forbidden('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    await enforceLegacyTenantBoundaries(c);

    const baselineAllowed = defaultRoles.includes(userRole);
    const perfil = dynamicProfileForRole(userRole);

    if (!perfil) {
      if (!baselineAllowed) {
        throw forbidden('Permissão negada', 'RBAC_FORBIDDEN');
      }
      await next();
      return;
    }

    const { empresaId } = getTenantContext(c);
    const override = await c.env.DB.prepare(
      `SELECT permitido
       FROM perfis_permissoes
       WHERE empresa_id = ? AND perfil = ? AND modulo = ? AND acao = ?
       LIMIT 1`,
    )
      .bind(empresaId, perfil, modulo, acao)
      .first<DynamicPermissionRow>();

    const allowed = override ? Number(override.permitido) === 1 : baselineAllowed;
    if (!allowed) {
      console.warn(
        `[RBAC] Dynamic access denied: role="${userRole}" module="${modulo}" action="${acao}" tenant="${empresaId}" override=${override ? Number(override.permitido) : 'none'}`,
      );
      throw forbidden('Permissão negada', 'RBAC_FORBIDDEN');
    }

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
export function hasRole<E extends { Bindings: Env }>(c: Context<E>, ...roles: UserRole[]): boolean {
  const userRole = normalizeRole((c.get as (key: string) => string | undefined)('userRole'));
  return !!userRole && roles.includes(userRole);
}

/**
 * Gate de acesso da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Capabilities (mesmo padrão de `usuario_permissoes` já usado pelo RDV —
 * ver `services/controle-voos/rdv-workflow.ts`): DENY explícito > GRANT
 * explícito > default do role. Nunca confia em role cacheada no JWT —
 * sempre re-lê `usuarios_empresas` no momento da requisição.
 *
 *   simuladores.guias.visualizar → default: role >= instructor (instrutor,
 *     manager, admin); demais roles (editor/student/viewer) só com GRANT
 *     explícito. Platform admin sempre passa.
 *   simuladores.guias.gerenciar  → SEM default de role (nem para manager) —
 *     só platform admin ou GRANT explícito de `simuladores.guias.gerenciar`.
 *     Decisão de produto explícita: publicação de guias não é liberada
 *     automaticamente para todo gestor.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { getTenantContext, isPlatformAdminContext, normalizeTenantRole } from './tenant';
import { forbidden, unauthorized } from './error-handler';

export const GUIAS_INSTRUTOR_CAPABILITIES = {
  visualizar: 'simuladores.guias.visualizar',
  gerenciar: 'simuladores.guias.gerenciar',
} as const;

type GuiaInstrutorCapability =
  (typeof GUIAS_INSTRUTOR_CAPABILITIES)[keyof typeof GUIAS_INSTRUTOR_CAPABILITIES];

const ROLE_LEVEL: Record<string, number> = {
  admin: 100,
  manager: 80,
  instructor: 60,
  editor: 50,
  student: 20,
  viewer: 10,
};

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

async function readPermissionOverride(
  db: D1Database,
  userId: number | string,
  capability: string,
): Promise<'GRANT' | 'DENY' | null> {
  const rows = await db
    .prepare(`SELECT tipo FROM usuario_permissoes WHERE usuario_id = ? AND permissao = ?`)
    .bind(userId, capability)
    .all<{ tipo: string }>()
    .catch(() => ({ results: [] as Array<{ tipo: string }> }));

  const results = rows.results || [];
  if (results.some((r) => String(r.tipo).toUpperCase() === 'DENY')) return 'DENY';
  if (results.some((r) => String(r.tipo).toUpperCase() === 'GRANT')) return 'GRANT';
  return null;
}

function defaultGrantForRole(capability: GuiaInstrutorCapability, role: string): boolean {
  const level = ROLE_LEVEL[role] ?? 0;
  if (capability === GUIAS_INSTRUTOR_CAPABILITIES.visualizar) {
    return level >= ROLE_LEVEL.instructor;
  }
  // gerenciar: sem default de role — exige GRANT explícito (ou platform admin).
  return false;
}

async function resolveActiveVinculoRole(
  db: D1Database,
  usuarioId: number,
  empresaId: number,
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT role FROM usuarios_empresas
       WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(usuarioId, empresaId)
    .first<{ role: string }>();

  return normalizeTenantRole(row?.role);
}

export async function hasGuiaInstrutorCapability(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  capability: GuiaInstrutorCapability,
): Promise<boolean> {
  if (isDevAuthBypassEnabled(c.env)) return true;

  const userId = (c.get as (key: string) => unknown)('userId');
  const numericUserId = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  if (!numericUserId) return false;

  // DENY explícito é absoluto — checado antes até do bypass de platform admin,
  // para que um DENY intencional nunca seja contornado por um axis distinto.
  const override = await readPermissionOverride(c.env.DB, numericUserId, capability);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;

  if (isPlatformAdminContext(c)) return true;

  const { empresaId } = getTenantContext(c);
  const role = await resolveActiveVinculoRole(c.env.DB, numericUserId, empresaId);
  return defaultGrantForRole(capability, role);
}

function guard(
  capability: GuiaInstrutorCapability,
  deniedMessage: string,
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const userId = (c.get as (key: string) => unknown)('userId');
    if (!userId) {
      throw unauthorized('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }
    const allowed = await hasGuiaInstrutorCapability(c, capability);
    if (!allowed) {
      throw forbidden(deniedMessage, 'GUIAS_INSTRUTOR_FORBIDDEN');
    }
    await next();
  };
}

export const requireGuiaInstrutorRead = () =>
  guard(
    GUIAS_INSTRUTOR_CAPABILITIES.visualizar,
    'Acesso restrito a instrutores autorizados da empresa ativa',
  );

export const requireGuiaInstrutorManage = () =>
  guard(
    GUIAS_INSTRUTOR_CAPABILITIES.gerenciar,
    'Publicação de guias restrita a administradores autorizados (platform admin ou GRANT explícito)',
  );

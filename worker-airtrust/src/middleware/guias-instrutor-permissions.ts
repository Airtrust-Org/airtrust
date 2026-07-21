/**
 * Gate de acesso da Biblioteca de Guias do Instrutor de Simulador.
 *
 * Ordem de resolução (decisão de produto explícita — Administrador
 * Master/Platform Admin é um axis de acesso da PLATAFORMA, não da empresa,
 * e nunca deve ficar refém de configuração feita dentro de um tenant):
 *
 *   1. não autenticado → 401;
 *   2. Platform Admin / Administrador Master → acesso permitido
 *      IMEDIATAMENTE, incondicional — nenhum DENY de tenant bloqueia;
 *   3. usuário comum: DENY explícito > GRANT explícito > default do role
 *      (mesmo padrão de `usuario_permissoes` já usado pelo RDV — ver
 *      `services/controle-voos/rdv-workflow.ts`). Nunca confia em role
 *      cacheada no JWT — sempre re-lê `usuarios_empresas` no momento da
 *      requisição.
 *
 *   simuladores.guias.visualizar → default: role >= instructor (instrutor,
 *     manager, admin); demais roles (editor/student/viewer) só com GRANT
 *     explícito.
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
  // Colunas confirmadas reais de `usuarios_empresas` (staging e produção,
  // via PRAGMA table_info): id, usuario_id, empresa_id, role, is_primary,
  // created_at — sem `ativo` nem `deleted_at`. Vínculo é removido por
  // DELETE físico, não soft-delete.
  const row = await db
    .prepare(`SELECT role FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ? LIMIT 1`)
    .bind(usuarioId, empresaId)
    .first<{ role: string }>();

  return normalizeTenantRole(row?.role);
}

export async function hasGuiaInstrutorCapability(
  c: Context<any>,
  capability: GuiaInstrutorCapability,
): Promise<boolean> {
  if (isDevAuthBypassEnabled(c.env)) return true;

  const userId = (c.get as (key: string) => unknown)('userId');
  const numericUserId = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  if (!numericUserId) return false;

  // Platform Admin / Administrador Master: acesso incondicional, checado
  // ANTES de qualquer DENY/GRANT de tenant. Este axis é da plataforma, não
  // da empresa — um DENY registrado dentro de um tenant nunca deve poder
  // bloquear o administrador master da própria plataforma.
  if (isPlatformAdminContext(c)) return true;

  const override = await readPermissionOverride(c.env.DB, numericUserId, capability);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;

  const { empresaId } = getTenantContext(c);
  const role = await resolveActiveVinculoRole(c.env.DB, numericUserId, empresaId);
  return defaultGrantForRole(capability, role);
}

/**
 * Resolve as três flags de autorização de uma vez, para o endpoint de
 * capabilities consumido pelo frontend (`useGuiasInstrutorPermissions`).
 * Nunca deriva autorização de texto de role/perfil — sempre da mesma
 * lógica de `hasGuiaInstrutorCapability` usada pelos guards reais.
 */
export async function resolveGuiaInstrutorPermissions(
  c: Context<any>,
): Promise<{ podeVisualizar: boolean; podeGerenciar: boolean; isPlatformAdmin: boolean }> {
  const isPlatformAdmin = isDevAuthBypassEnabled(c.env) || isPlatformAdminContext(c);
  const [podeVisualizar, podeGerenciar] = await Promise.all([
    hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar),
    hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar),
  ]);
  return { podeVisualizar, podeGerenciar, isPlatformAdmin };
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

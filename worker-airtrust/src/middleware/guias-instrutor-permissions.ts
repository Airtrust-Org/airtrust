/**
 * Gate de acesso da Biblioteca de Guias do Instrutor de Simulador.
 *
 * IMPORTANTE — o que isto É e o que NÃO É:
 * Isto é um allowlist de roles resolvido por requisição (não é permissão
 * granular por-guia/por-recurso). A melhoria real sobre `requireRole()` é
 * que a role é lida direto de `usuarios_empresas` a cada requisição —
 * escopada à empresa ativa do tenant, com `ativo=1 AND deleted_at IS NULL`
 * — em vez de confiar numa role cacheada no JWT/contexto. Isso fecha a
 * janela entre "vínculo foi revogado" e "token ainda diz que a pessoa tem
 * acesso", mas continua sendo checagem por-role, não por-usuário/por-guia.
 *
 *   simuladores.guias_instrutor.read   → INSTRUTOR, GESTOR, ADMIN, SUPER_ADMIN
 *   simuladores.guias_instrutor.manage → GESTOR, ADMIN, SUPER_ADMIN (não instrutor)
 *
 * Decisão consciente, não a ideal: o projeto não tem hoje nenhuma
 * infraestrutura de permissão granular (nem `requirePermission()`, nem
 * tabela de permissões por recurso) — ver auditoria arquitetural desta
 * feature. Construir isso do zero seria RBAC global novo, fora do escopo
 * desta entrega. "GESTOR" aqui herda o mesmo significado amplo que já tem
 * em todo o resto do sistema; se a intenção de produto for restringir
 * publicação a um subconjunto de gestores (ex: só quem é responsável pelo
 * programa de treinamento daquela aeronave), isso precisa de uma decisão
 * de governança explícita do time — não decidida unilateralmente aqui.
 * BACKLOG: `simuladores.guias_instrutor.manage` como permissão granular
 * real (tabela de vínculo usuário↔recurso), se/quando o produto precisar
 * de administradores de conteúdo mais restritos que "todo GESTOR".
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

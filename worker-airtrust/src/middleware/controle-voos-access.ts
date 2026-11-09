import type { Context, MiddlewareHandler } from 'hono';
import { ApiError } from './error-handler';
import { getUserPermissionOverride } from './rbac';
import { checkPermission } from './tenant';
import { hasRdvCapability, requireAnyRdvAccess } from './controle-voos-rdv-access';
import { RDV_CAPABILITIES } from '../services/controle-voos/rdv-workflow';
import type { Env } from '../types';

export function isControleVoosCoordinationRole(c: Context<{ Bindings: Env }>): boolean {
  return String((c.get as (key: string) => unknown)('userRole') || '').trim().toUpperCase() === 'COORDENACAO_VOO';
}

async function hasConfiguredAccess(
  c: Context<{ Bindings: Env }>,
  permission: 'controle_voos.edit' | 'controle_voos.sigvoos_preview',
  fallbackRole: 'editor' | 'manager',
): Promise<boolean> {
  const override = await getUserPermissionOverride(c, permission);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;
  if (permission === 'controle_voos.edit' && isControleVoosCoordinationRole(c)) return true;
  return checkPermission(c, fallbackRole);
}

export function requireControleVoosWrite(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!(await hasConfiguredAccess(c, 'controle_voos.edit', 'editor'))) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_RBAC_FORBIDDEN');
    }
    await next();
  };
}

export function assertControleVoosCoordination(c: Context<{ Bindings: Env }>): void {
  if (!checkPermission(c, 'manager') && !isControleVoosCoordinationRole(c)) {
    throw new ApiError(
      'Permissao insuficiente para Coordenacao',
      403,
      'CONTROLE_VOOS_COORDINATION_RBAC_FORBIDDEN',
    );
  }
}

export function requireControleVoosCoordination(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (isControleVoosCoordinationRole(c)) {
      const permission = await getUserPermissionOverride(c, 'controle_voos.edit');
      if (permission === 'DENY') throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_COORDINATION_RBAC_FORBIDDEN');
    }
    assertControleVoosCoordination(c);
    await next();
  };
}

export function requireControleVoosSigvoosPreview(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!(await hasConfiguredAccess(c, 'controle_voos.sigvoos_preview', 'manager'))) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN');
    }
    await next();
  };
}

/**
 * Leitura da programacao de Controle de Voos (voos, jornadas, dashboard,
 * relatorios) - P06-01. Precedencia: DENY explicito em `controle_voos.view` >
 * GRANT em `controle_voos.view` ou `controle_voos.edit` > Coordenacao de Voo >
 * capability RDV `visualizar_todos` > papel com direito de edicao (mesmo
 * criterio da escrita). Alunos/viewers sem grant ficam de fora. O frontend nao
 * concede nada: isto e a autoridade.
 */
export async function hasControleVoosViewAccess(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const view = await getUserPermissionOverride(c, 'controle_voos.view');
  if (view === 'DENY') return false;
  if (view === 'GRANT') return true;
  if ((await getUserPermissionOverride(c, 'controle_voos.edit')) === 'GRANT') return true;
  if (isControleVoosCoordinationRole(c)) return true;
  if (await hasRdvCapability(c, RDV_CAPABILITIES.visualizarTodos)) return true;
  if (checkPermission(c, 'editor')) return true;
  // Leitores (membership `viewer`) continuam podendo ver o painel operacional
  // (decisao de produto da OCC), exceto contas cujo perfil canonico e ALUNO.
  const tenantRole = String(
    (c.get as (key: string) => { role?: string } | undefined)('tenantContext')?.role || '',
  ).toLowerCase();
  if (tenantRole === 'viewer') return !(await isViewerWithStudentProfile(c));
  return false;
}

/**
 * Alguns alunos mantem membership tenant `viewer` com perfil canonico ALUNO
 * (ver controle-voos-rdv-access). Eles nao sao leitores operacionais. Falha
 * fechada: se o perfil nao puder ser lido, tratamos como aluno.
 */
async function isViewerWithStudentProfile(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const get = c.get as (key: string) => unknown;
  const userId = Number(get('userId'));
  const empresaId = Number(get('empresaId'));
  if (!Number.isInteger(userId) || userId <= 0) return true;
  if (!Number.isInteger(empresaId) || empresaId <= 0) return true;
  try {
    const row = await c.env.DB.prepare(
      `SELECT u.perfil
         FROM usuarios u
         JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id
          AND ue.empresa_id = ?
        WHERE u.id = ?
          AND u.deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(empresaId, userId)
      .first<{ perfil: string | null }>();
    const profile = String(row?.perfil || '').trim().toUpperCase();
    return profile === 'ALUNO' || profile === 'STUDENT' || profile === 'MEMBER';
  } catch {
    return true;
  }
}

export function requireControleVoosView(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!(await hasControleVoosViewAccess(c))) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_RBAC_FORBIDDEN');
    }
    await next();
  };
}

/**
 * Catalogos (aeroportos, tipos, contratos, funcoes de bordo, motivos) alimentam
 * os formularios do piloto; quem tem acesso proprio ao RDV tambem precisa lê-los.
 * DENY explicito em `controle_voos.view` continua valendo.
 */
export function requireControleVoosViewOrPilotAccess(): MiddlewareHandler<{ Bindings: Env }> {
  const pilotGate = requireAnyRdvAccess();
  return async (c, next) => {
    if (await hasControleVoosViewAccess(c)) return next();
    if ((await getUserPermissionOverride(c, 'controle_voos.view')) === 'DENY') {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_RBAC_FORBIDDEN');
    }
    return pilotGate(c, next);
  };
}

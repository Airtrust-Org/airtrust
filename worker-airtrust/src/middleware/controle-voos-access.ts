import type { Context, MiddlewareHandler } from 'hono';
import { ApiError } from './error-handler';
import { getUserPermissionOverride } from './rbac';
import { checkPermission } from './tenant';
import type { Env } from '../types';

async function hasConfiguredAccess(
  c: Context<{ Bindings: Env }>,
  permission: 'controle_voos.edit' | 'controle_voos.sigvoos_preview',
  fallbackRole: 'editor' | 'manager',
): Promise<boolean> {
  const override = await getUserPermissionOverride(c, permission);
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;
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

export function requireControleVoosSigvoosPreview(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!(await hasConfiguredAccess(c, 'controle_voos.sigvoos_preview', 'manager'))) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN');
    }
    await next();
  };
}

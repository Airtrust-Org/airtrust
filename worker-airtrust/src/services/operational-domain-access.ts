/**
 * Operational-domain access facade.
 *
 * The core guard remains unchanged for managers and every operational
 * resource. Qualification-type catalog administration is the sole
 * exception: this UI is admin-only and every handler remains tenant-scoped,
 * so a tenant ADMINISTRADOR may maintain its own qualification models
 * without also holding an operational manager assignment.
 */
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import * as core from './operational-domain-access-core';

export * from './operational-domain-access-core';

type RequireOperationalAccessOptions = Parameters<typeof core.requireOperationalAccess>[0];

function isTenantAdminQualificationCatalogRequest(
  options: RequireOperationalAccessOptions,
  userRole: unknown,
): boolean {
  return options.resourceType === 'qualificacao_tipo' && core.normalizeTenantRole(userRole) === 'admin';
}

export function requireOperationalAccess(
  options: RequireOperationalAccessOptions,
): MiddlewareHandler<{ Bindings: Env }> {
  const guardedMiddleware = core.requireOperationalAccess(options);

  if (options.resourceType !== 'qualificacao_tipo') {
    return guardedMiddleware;
  }

  return async (c, next) => {
    const userRole = (c.get as (key: string) => unknown)('userRole');
    if (!isTenantAdminQualificationCatalogRequest(options, userRole)) {
      await guardedMiddleware(c, next);
      return;
    }

    // Preserve the tenant rollout/state integrity checks. Query failures,
    // missing tenants and invalid feature flags still fail closed.
    await core.resolveOperationalAccess({
      db: c.env.DB,
      empresaId: Number((c.get as (key: string) => unknown)('empresaId') || 0),
      userId: Number((c.get as (key: string) => unknown)('userId') || 0),
      userRole,
    });

    // The qualification handlers themselves always resolve the resource
    // with empresa_id from the authenticated tenant. A cross-tenant id
    // therefore remains 404 and cannot be mutated.
    await next();
  };
}

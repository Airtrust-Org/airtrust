import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: { get: (key: string) => unknown }) => c.get('tenantContext'),
  isPlatformAdminContext: (c: { get: (key: string) => unknown }) =>
    (c.get('platformAccessState') as { hasPersistedPlatformAdmin?: boolean } | undefined)
      ?.hasPersistedPlatformAdmin === true,
  requireTenantRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

import empresasUsuariosRoutes from '../../routes/empresas-usuarios';

function makeApp(platformAdmin: boolean) {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      const stmt = {
        bind() { return stmt; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { throw new Error('UNEXPECTED_DB_WRITE'); },
      };
      return stmt;
    },
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('tenantContext', {
      empresaId: 1, empresaCodigo: 'airtrust', empresaNome: 'AirTrust',
      role: 'admin', plano: 'pro', permissions: ['*'],
    });
    c.set('platformAccessState', {
      userId: 42,
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: platformAdmin,
      hasSupportReadOnlyRole: false,
      hasSupportElevatedRole: false,
      supportGrants: [],
      source: platformAdmin ? 'persisted' : 'none',
    });
    await next();
  });
  app.route('/api/empresas', empresasUsuariosRoutes);
  return {
    queries,
    request: (path: string, options: RequestInit = {}) =>
      app.request(path, options, { DB: db, ENVIRONMENT: 'test' } as unknown as Env),
  };
}

describe('empresas-usuarios — cross-tenant platform boundary', () => {
  it('tenant administrator in empresa airtrust cannot list a different company', async () => {
    const app = makeApp(false);
    const response = await app.request('/api/empresas/7/usuarios');
    expect(response.status).toBe(403);
    expect(app.queries.every((sql) => !/^\\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql))).toBe(true);
  });

  it('tenant administrator in empresa airtrust cannot add a user to another company', async () => {
    const app = makeApp(false);
    const response = await app.request('/api/empresas/7/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: 100, role: 'student' }),
    });
    expect(response.status).toBe(403);
    expect(app.queries).toHaveLength(0);
  });

  it('persisted platform administrator may read users from a different active company', async () => {
    const app = makeApp(true);
    const response = await app.request('/api/empresas/7/usuarios');
    expect(response.status).toBe(200);
    const payload = await response.json() as { success: boolean; data: unknown[] };
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual([]);
  });

  it('non-platform tenant administrator cannot read another company user access list', async () => {
    const app = makeApp(false);
    const response = await app.request('/api/empresas/usuarios/100/acessos');
    expect(response.status).toBe(403);
  });
});

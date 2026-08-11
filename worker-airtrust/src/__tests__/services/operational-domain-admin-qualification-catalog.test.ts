import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requireOperationalAccess } from '../../services/operational-domain-access';

function createDb(flag: unknown = 1): D1Database {
  return {
    prepare: (query: string) => ({
      all: async () => ({ results: [] }),
      bind: () => ({
        first: async () =>
          query.includes('operational_domain_rbac_enabled')
            ? { operational_domain_rbac_enabled: flag }
            : null,
        all: async () => ({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 1 as never);
    c.set('userId' as never, 10 as never);
    c.set('userRole' as never, (c.req.header('x-test-role') || 'admin') as never);
    await next();
  });
  app.put(
    '/tipos/:id',
    requireOperationalAccess({ action: 'update', resourceType: 'qualificacao_tipo' }),
    (c) => c.json({ success: true }),
  );
  app.put(
    '/cursos/:id',
    requireOperationalAccess({ action: 'update', resourceType: 'lms_curso' }),
    (c) => c.json({ success: true }),
  );
  return app;
}

describe('admin qualification catalog operational access', () => {
  it('allows a tenant admin to maintain a qualification model without manager grants', async () => {
    const response = await createApp().request(
      '/tipos/1',
      { method: 'PUT', headers: { 'x-test-role': 'admin' } },
      { DB: createDb() } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('keeps managers without an operational grant fail-closed', async () => {
    const response = await createApp().request(
      '/tipos/1',
      { method: 'PUT', headers: { 'x-test-role': 'manager' } },
      { DB: createDb() } as Env,
    );

    expect(response.status).toBe(403);
  });

  it('does not create a generic admin bypass for other operational resources', async () => {
    const response = await createApp().request(
      '/cursos/1',
      { method: 'PUT', headers: { 'x-test-role': 'admin' } },
      { DB: createDb() } as Env,
    );

    expect(response.status).toBe(403);
  });

  it('preserves fail-closed tenant RBAC state validation', async () => {
    const response = await createApp().request(
      '/tipos/1',
      { method: 'PUT', headers: { 'x-test-role': 'admin' } },
      { DB: createDb('invalid') } as Env,
    );

    expect(response.status).toBe(500);
  });
});

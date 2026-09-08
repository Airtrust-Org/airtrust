import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requirePermission, type UserRole } from '../../middleware/rbac';
import { errorHandler } from '../../middleware/error-handler';

type OverrideRow = { permitido: number } | null;

function makeDb(resolve: (binds: unknown[]) => OverrideRow | Promise<OverrideRow>) {
  return {
    prepare: (_sql: string) => ({
      bind: (...binds: unknown[]) => ({
        first: async () => resolve(binds),
      }),
    }),
  } as unknown as D1Database;
}

function createApp(options: { role: UserRole; empresaId: number; defaults?: UserRole[] }) {
  const app = new Hono<any>();
  app.onError(errorHandler as any);
  app.use('*', async (c, next) => {
    c.set('userRole', options.role);
    c.set('empresaId', options.empresaId);
    c.set('tenantContext', {
      empresaId: options.empresaId,
      empresaCodigo: `tenant-${options.empresaId}`,
      empresaNome: `Tenant ${options.empresaId}`,
      role: options.role,
      plano: 'test',
      permissions: [],
    });
    await next();
  });
  app.get(
    '/protected',
    requirePermission('lms', 'visualizar', ...(options.defaults ?? ['admin', 'manager'])) as any,
    (c) => c.json({ ok: true }),
  );
  return app;
}

function env(db: D1Database) {
  return {
    DB: db,
    ENVIRONMENT: 'test',
    ENABLE_DEV_AUTH_BYPASS: 'false',
  } as any;
}

describe('requirePermission', () => {
  it('preserves the existing role baseline when no tenant override exists', async () => {
    const app = createApp({ role: 'manager', empresaId: 6 });
    const response = await app.request('/protected', {}, env(makeDb(() => null)));
    expect(response.status).toBe(200);
  });

  it('applies an explicit tenant-scoped DENY over an otherwise allowed role', async () => {
    let seenBinds: unknown[] = [];
    const db = makeDb((binds) => {
      seenBinds = binds;
      return { permitido: 0 };
    });
    const app = createApp({ role: 'manager', empresaId: 6 });
    const response = await app.request('/protected', {}, env(db));

    expect(response.status).toBe(403);
    expect(seenBinds).toEqual([6, 'GESTOR', 'lms', 'visualizar']);
  });

  it('applies an explicit tenant-scoped GRANT over a role excluded by the baseline', async () => {
    const app = createApp({ role: 'instructor', empresaId: 7 });
    const response = await app.request(
      '/protected',
      {},
      env(makeDb(() => ({ permitido: 1 }))),
    );
    expect(response.status).toBe(200);
  });

  it('does not reuse an override from another tenant', async () => {
    const db = makeDb((binds) => (binds[0] === 6 ? { permitido: 1 } : null));
    const app = createApp({ role: 'instructor', empresaId: 7 });
    const response = await app.request('/protected', {}, env(db));
    expect(response.status).toBe(403);
  });

  it('fails closed if dynamic permission storage cannot be read', async () => {
    const db = makeDb(async () => {
      throw new Error('D1 unavailable');
    });
    const app = createApp({ role: 'manager', empresaId: 6 });
    const response = await app.request('/protected', {}, env(db));
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  it('keeps non-configurable roles on their static baseline without querying overrides', async () => {
    let queried = false;
    const db = makeDb(() => {
      queried = true;
      return { permitido: 1 };
    });
    const app = createApp({ role: 'admin', empresaId: 6 });
    const response = await app.request('/protected', {}, env(db));
    expect(response.status).toBe(200);
    expect(queried).toBe(false);
  });
});

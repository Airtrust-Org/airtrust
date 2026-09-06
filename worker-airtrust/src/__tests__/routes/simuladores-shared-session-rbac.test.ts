import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../services/operational-domain-access', async () => {
  const actual = await vi.importActual<typeof import('../../services/operational-domain-access')>(
    '../../services/operational-domain-access',
  );
  return {
    ...actual,
    requireOperationalAccess:
      () =>
      async (c: { get: (key: string) => unknown; json: (body: unknown, status: number) => Response }, next: () => Promise<void>) => {
        const role = String(c.get('userRole') || '').toLowerCase();
        if (!['admin', 'manager'].includes(role)) {
          return c.json({ success: false, error: 'Acesso negado' }, 403);
        }
        await next();
      },
  };
});

import sharedRoutes from '../../routes/simuladores-shared-session';

function createEnv(): Env {
  const db = {
    prepare: vi.fn(() => {
      const statement = {
        bind: () => statement,
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
      };
      return statement;
    }),
  } as unknown as D1Database;
  return {
    DB: db,
    ENVIRONMENT: 'test',
    SIMULADORES_SHARED_SESSION_ENABLED: 'true',
  } as unknown as Env;
}

function createApp(role: string) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/simuladores/*', async (c, next) => {
    c.set('userId', 10);
    c.set('empresaId', 6);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: role.toLowerCase() as 'admin' | 'manager' | 'instructor' | 'editor' | 'student' | 'viewer',
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  });
  app.route('/api/simuladores', sharedRoutes);
  return app;
}

const mutations = [
  ['POST', '/api/simuladores/sessoes/compartilhada'],
  ['PUT', '/api/simuladores/sessoes/compartilhada/1'],
  ['PUT', '/api/simuladores/sessoes/1/converter-compartilhada'],
  ['POST', '/api/simuladores/sessoes/compartilhada/1/atribuicoes/2/cancelar'],
] as const;

describe('shared simulator session RBAC', () => {
  it.each(['viewer', 'student', 'instructor', 'editor'])(
    'blocks %s from shared-session mutations before DB access',
    async (role) => {
      for (const [method, path] of mutations) {
        const env = createEnv();
        const response = await createApp(role).request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }, env);
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(env.DB.prepare).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['admin', 'manager'])('admits %s through the shared create gate', async (role) => {
    const env = createEnv();
    const response = await createApp(role).request('/api/simuladores/sessoes/compartilhada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);
    expect(response.status).not.toBe(403);
  });
});

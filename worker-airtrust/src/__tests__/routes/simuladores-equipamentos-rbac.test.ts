import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import routes from '../../routes/simuladores-equipamentos';

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
  return { DB: db, ENVIRONMENT: 'test' } as unknown as Env;
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
  app.route('/api/simuladores', routes);
  return app;
}

describe('simulator equipment mutation RBAC', () => {
  it.each(['viewer', 'student', 'instructor', 'editor'])(
    'blocks %s from simulator catalog writes before DB access',
    async (role) => {
      for (const [method, path] of [
        ['POST', '/api/simuladores'],
        ['PUT', '/api/simuladores/1'],
        ['DELETE', '/api/simuladores/1'],
      ] as const) {
        const env = createEnv();
        const response = await createApp(role).request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'DELETE' ? undefined : JSON.stringify({}),
        }, env);
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(env.DB.prepare).not.toHaveBeenCalled();
      }
    },
  );

  it('blocks student from resolving a reinforcement alert before DB access', async () => {
    const env = createEnv();
    const response = await createApp('student').request('/api/simuladores/alertas/1/resolver', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);
    expect(response.status).toBe(403);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it.each(['admin', 'manager', 'instructor'])(
    'admits %s through the alert-resolution role gate',
    async (role) => {
      const env = createEnv();
      const response = await createApp(role).request('/api/simuladores/alertas/1/resolver', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, env);
      expect(response.status).not.toBe(403);
    },
  );
});

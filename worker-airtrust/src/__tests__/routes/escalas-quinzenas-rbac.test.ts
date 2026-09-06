import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import quinzenasRoutes from '../../routes/escalas-quinzenas';

function createEnv(): Env {
  const db = {
    prepare: vi.fn(() => {
      const statement = {
        bind: () => statement,
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: { changes: 1, last_row_id: 1 } }),
      };
      return statement;
    }),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
  return { DB: db, ENVIRONMENT: 'test' } as unknown as Env;
}

function createApp(role: string, empresaId = 6) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/escalas/quinzenas/*', async (c, next) => {
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: 'tenant',
      empresaNome: 'Tenant',
      role: role.toLowerCase() as 'admin' | 'manager' | 'instructor' | 'editor' | 'student' | 'viewer',
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  });
  app.route('/api/escalas/quinzenas', quinzenasRoutes);
  return app;
}

const writeCases = [
  ['POST', '/api/escalas/quinzenas/gerar-ano'],
  ['POST', '/api/escalas/quinzenas'],
  ['PUT', '/api/escalas/quinzenas/1'],
  ['DELETE', '/api/escalas/quinzenas/1'],
] as const;

describe('escalas quinzenas RBAC', () => {
  it.each(['viewer', 'student', 'instructor', 'editor'])(
    'blocks %s from every quinzena mutation',
    async (role) => {
      for (const [method, path] of writeCases) {
        const env = createEnv();
        const response = await createApp(role).request(
          path,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'DELETE' ? undefined : JSON.stringify({}),
          },
          env,
        );
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(env.DB.prepare, `${method} ${path}`).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['admin', 'manager'])('allows %s through the mutation gate', async (role) => {
    const env = createEnv();
    const response = await createApp(role).request(
      '/api/escalas/quinzenas',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(response.status).toBe(400);
  });

  it('keeps authenticated reads available to non-manager roles', async () => {
    const env = createEnv();
    const response = await createApp('viewer').request(
      '/api/escalas/quinzenas?ano=2026',
      {},
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: [] });
  });
});

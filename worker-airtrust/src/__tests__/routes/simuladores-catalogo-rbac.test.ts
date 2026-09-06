import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import catalogoRoutes from '../../routes/simuladores-catalogo';

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

function createApp(role: string, empresaId = 7) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/simuladores/*', async (c, next) => {
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `empresa-${empresaId}`,
      empresaNome: `Empresa ${empresaId}`,
      role: role.toLowerCase() as 'admin' | 'manager' | 'student' | 'viewer',
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  });
  app.route('/api/simuladores', catalogoRoutes);
  return app;
}

const jsonRequest = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
};

describe('simulator catalog RBAC', () => {
  it.each([
    ['viewer', '/api/simuladores/categorias'],
    ['student', '/api/simuladores/manobras'],
    ['instructor', '/api/simuladores/categorias'],
    ['editor', '/api/simuladores/manobras'],
  ])('blocks %s from mutating %s', async (role, path) => {
    const env = createEnv();
    const response = await createApp(role).request(path, jsonRequest, env);

    expect(response.status).toBe(403);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it.each(['admin', 'manager'])('allows %s through the mutation gate', async (role) => {
    const env = createEnv();
    const response = await createApp(role).request('/api/simuladores/categorias', jsonRequest, env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it('keeps authenticated catalog reads available to non-manager roles', async () => {
    const env = createEnv();
    const response = await createApp('viewer').request('/api/simuladores/categorias', {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: [] });
  });
});

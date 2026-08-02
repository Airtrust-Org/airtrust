import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

type MockAuthContext = {
  env: Env & { __mockRole?: string; __mockEmpresaId?: number };
  set: (key: string, value: unknown) => void;
};

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: MockAuthContext, next: () => Promise<void>) => {
    const role = String(c.env.__mockRole || 'viewer');
    const empresaId = Number(c.env.__mockEmpresaId ?? 77);

    c.set('userId', 55);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: 'acme',
      empresaNome: 'Acme Air',
      role: role.toLowerCase(),
      plano: 'pro',
      permissions: role.toLowerCase() === 'admin' ? ['*'] : ['read'],
    });

    await next();
  },
}));

import sgsoRoutes from '../../routes/sgso';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/sgso', sgsoRoutes);
  return app;
}

function createEnv(role: string) {
  const db = {
    prepare: vi.fn(() => {
      throw new Error('database must not be reached before RBAC');
    }),
  } as unknown as D1Database;

  return {
    DB: db,
    ENVIRONMENT: 'test',
    __mockRole: role,
    __mockEmpresaId: 77,
  } as unknown as Env;
}

const protectedMutations = [
  ['PATCH', '/sgso/relatos/rel-1/status'],
  ['POST', '/sgso/relatos/rel-1/avaliacao-risco'],
  ['POST', '/sgso/relatos/rel-1/acoes'],
  ['PATCH', '/sgso/acoes/1'],
  ['POST', '/sgso/auditorias'],
  ['PATCH', '/sgso/auditorias/aud-1/item'],
  ['POST', '/sgso/auditorias/aud-1/concluir'],
  ['POST', '/sgso/nao-conformidades'],
  ['PATCH', '/sgso/nao-conformidades/1'],
] as const;

describe('SGSO regulatory mutations RBAC', () => {
  it.each(['viewer', 'student', 'instructor', 'editor'])(
    'blocks %s before database access',
    async (role) => {
      const app = createApp();
      const env = createEnv(role);

      for (const [method, path] of protectedMutations) {
        const response = await app.request(
          path,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
          env,
        );

        expect(response.status, `${method} ${path}`).toBe(403);
      }

      expect(env.DB.prepare).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'manager'])('allows %s through the role gate', async (role) => {
    const app = createApp();
    const env = createEnv(role);

    const response = await app.request(
      '/sgso/auditorias',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});

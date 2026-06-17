import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

type TenantContext = {
  empresaId: number;
  empresaCodigo: string;
};

let tenantContext: TenantContext;

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', 10);
      c.set('userEmail', 'gestor@tenant.test');
      c.set('userRole', 'GESTOR');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => tenantContext,
}));

vi.mock('../../utils/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/security')>();
  return {
    ...actual,
    hashPassword: vi.fn(async () => 'hashed-password'),
  };
});

import { adminUsuariosRoutes } from '../../routes/admin-usuarios';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/admin/usuarios', adminUsuariosRoutes);
  return app;
}

function createDb() {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
    },
  } as unknown as D1Database;

  return { db, queries };
}

describe('admin usuarios invite tenant boundary', () => {
  beforeEach(() => {
    tenantContext = { empresaId: 6, empresaCodigo: 'costa-do-sol' };
  });

  it('blocks tenant admins/managers from inviting users into a different empresa_id', async () => {
    const { db, queries } = createDb();
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({
          email: 'pessoa@yahoo.com.br',
          nome: 'Pessoa Externa',
          perfil: 'ALUNO',
          empresa_id: 7,
        }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );

    const json = await response.json<{ success: boolean; code: string; error: string }>();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'WRONG_TENANT',
      error: 'Sem permissão para convidar usuários para outra empresa',
    });
    expect(queries).toHaveLength(0);
  });
});

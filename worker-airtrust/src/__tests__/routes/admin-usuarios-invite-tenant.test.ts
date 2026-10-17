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

function createInstructorDb() {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        args: [] as unknown[],
        bind(...args: unknown[]) { statement.args = args; return statement; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          writes.push({ sql, args: statement.args });
          if (sql.includes('INSERT INTO usuarios (')) return { meta: { last_row_id: 101, changes: 1 } };
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
  return { db, writes };
}

describe('admin usuarios invite tenant boundary', () => {
  beforeEach(() => {
    tenantContext = { empresaId: 6, empresaCodigo: 'costa-do-sol' };
  });

  it('persists Instrutor and Aluno explicitly in the same tenant when requested', async () => {
    const { db, writes } = createInstructorDb();
    const response = await createApp().fetch(
      new Request('http://localhost/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({
          email: 'instrutor@tenant.test', nome: 'Instrutor de Teste',
          perfil: 'INSTRUTOR', aluno_tambem: true, funcionario_id: 44,
        }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(201);
    const explicit = writes.filter((row) => row.sql.includes('INSERT INTO usuarios_empresas_perfis'));
    expect(explicit).toHaveLength(2);
    expect(explicit.map((row) => row.args)).toEqual([
      [101, 6, 'INSTRUTOR'],
      [101, 6, 'ALUNO'],
    ]);
    expect(writes.some((row) => row.sql.includes('INSERT OR IGNORE INTO usuarios_empresas') &&
      row.args[1] === 6)).toBe(true);
  });

  it('rejects an additional student flag when the selected role is not Instrutor', async () => {
    const { db, writes } = createInstructorDb();
    const response = await createApp().fetch(
      new Request('http://localhost/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({
          email: 'aluno@tenant.test', nome: 'Aluno de Teste',
          perfil: 'ALUNO', aluno_tambem: true, funcionario_id: 44,
        }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
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

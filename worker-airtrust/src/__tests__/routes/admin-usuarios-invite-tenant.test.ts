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

function createInstructorDb(options: { existing?: boolean } = {}) {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        args: [] as unknown[],
        bind(...args: unknown[]) { statement.args = args; return statement; },
        async first() {
          if (!options.existing) return null;
          if (sql.includes('FROM usuarios u') && sql.includes('WHERE u.id = ?')) {
            return { id: 101, email: 'instrutor@tenant.test', nome: 'Instrutor de Teste',
              perfil: 'INSTRUTOR', active: 1, funcionario_id: 44,
              empresa_id: 6, funcionario_nome: 'Instrutor de Teste' };
          }
          if (sql.includes('FROM usuarios u') && sql.includes('WHERE u.id = ?')) return { id: 101, perfil: 'INSTRUTOR' };
          if (sql.includes('SELECT u.id, u.perfil FROM usuarios')) {
            return { id: 101, perfil: 'INSTRUTOR' };
          }
          if (sql.includes('SELECT 1 FROM usuarios_empresas')) return { active: 1 };
          if (sql.includes("perfil = 'INSTRUTOR'")) return { active: 1 };
          return null;
        },
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

  it('adds student mode to an existing Instructor without replacing tenant roles', async () => {
    const { db, writes } = createInstructorDb({ existing: true });
    const response = await createApp().fetch(
      new Request('http://localhost/api/admin/usuarios/101', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ nome: 'Instrutor Atualizado', aluno_tambem: true }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const explicit = writes.filter((row) => row.sql.includes('INSERT INTO usuarios_empresas_perfis'));
    expect(explicit.map((row) => row.args)).toEqual([
      [101, 6, 'INSTRUTOR'], [101, 6, 'ALUNO'],
    ]);
    expect(writes.some((row) => row.sql.includes('DELETE FROM usuarios_empresas_perfis'))).toBe(false);
  });

  it('disables only student mode in the current tenant when Instructor option is unchecked', async () => {
    const { db, writes } = createInstructorDb({ existing: true });
    const response = await createApp().fetch(
      new Request('http://localhost/api/admin/usuarios/101', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ nome: 'Instrutor Atualizado', aluno_tambem: false }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const updates = writes.filter((row) => row.sql.includes('UPDATE usuarios_empresas_perfis'));
    expect(updates).toHaveLength(1);
    expect(updates[0].args).toEqual([101, 6]);
    expect(updates[0].sql).toContain("perfil = 'ALUNO'");
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

  it('does not treat a Gestor in the airtrust tenant as platform administrator', async () => {
    tenantContext = { empresaId: 1, empresaCodigo: 'airtrust' };
    const { db, queries } = createDb();
    const response = await createApp().fetch(
      new Request('http://localhost/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({
          email: 'outsider@test.invalid', nome: 'Conta de Teste',
          perfil: 'INSTRUTOR', aluno_tambem: true, empresa_id: 7,
        }),
      }),
      { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
    expect(queries.every((sql) => !/^\\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql))).toBe(true);
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
    expect(queries.every((sql) => !/^\\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql))).toBe(true);
  });
});

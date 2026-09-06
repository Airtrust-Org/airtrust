/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.req.header('x-test-empresa-id')),
    empresaCodigo: c.req.header('x-test-platform-admin') === 'true' ? 'airtrust' : 'empresa-teste',
  }),
  requireTenantRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../utils/security', () => ({
  generateRefreshToken: () => 'refresh-token',
}));

vi.mock('../../services/setores-gestores', () => ({
  assertSetoresValidosParaEmpresa: async () => {},
  buildManagerSetorInsertStatements: () => [],
  SetorGestorValidationError: class SetorGestorValidationError extends Error {},
}));

import empresasUsuariosRoutes from '../../routes/empresas-usuarios';

type DbState = {
  memberships: number[];
  writes: string[];
};

function createDb(memberships: number[]): D1Database {
  const state: DbState = { memberships, writes: [] };
  const db = {
    state,
    prepare(sql: string) {
      const stmt: any = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first() {
          const lower = sql.toLowerCase();
          if (lower.includes('from usuarios u') && lower.includes('inner join usuarios_empresas ue')) {
            const [empresaId] = stmt.params.map(Number);
            return state.memberships.includes(empresaId)
              ? { id: 200, nome: 'Usuário alvo', email: 'alvo@empresa.test' }
              : null;
          }
          if (lower.includes('from usuarios where')) {
            return { id: 200, nome: 'Usuário alvo', email: 'alvo@empresa.test' };
          }
          return null;
        },
        async all() {
          const lower = sql.toLowerCase();
          if (lower.includes("pragma table_info('usuarios_empresas')")) {
            return { results: [{ name: 'modulos_ativos' }] };
          }
          if (lower.includes('from usuarios_empresas ue')) {
            return {
              results: state.memberships.map((empresa_id) => ({
                empresa_id,
                role: 'viewer',
                is_primary: 1,
                modulos_ativos: '[]',
                empresa_nome: `Empresa ${empresa_id}`,
                perfis: '[]',
              })),
            };
          }
          if (lower.includes('select role') && lower.includes('from usuarios_empresas')) {
            return { results: [{ role: 'viewer' }] };
          }
          return { results: [] };
        },
        async run() {
          state.writes.push(sql);
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

function createApp() {
  const app = new Hono();
  app.onError((error: any, c) =>
    c.json(
      { success: false, error: error.message, code: error.code },
      (typeof error.status === 'number' ? error.status : 500) as any,
    ),
  );
  app.route('/api/empresas', empresasUsuariosRoutes);
  return app;
}

async function request(
  method: string,
  path: string,
  options: { empresaId: number; memberships: number[]; platformAdmin?: boolean; body?: unknown },
) {
  const db = createDb(options.memberships) as D1Database & { state: DbState };
  const headers: Record<string, string> = { 'x-test-empresa-id': String(options.empresaId) };
  if (options.platformAdmin) headers['x-test-platform-admin'] = 'true';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await createApp().fetch(
    new Request(`http://localhost/api/empresas${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    { DB: db } as unknown as Env,
    {} as ExecutionContext,
  );
  return { response, writes: db.state.writes };
}

describe('empresas usuários acessos tenant boundary', () => {
  it('permite ler os acessos de uma identidade já vinculada ao tenant atual', async () => {
    const { response } = await request('GET', '/usuarios/200/acessos', {
      empresaId: 1,
      memberships: [1],
    });

    expect(response.status).toBe(200);
  });

  it('nega enumeração dos acessos de uma identidade de outro tenant sem expor seus dados', async () => {
    const { response } = await request('GET', '/usuarios/200/acessos', {
      empresaId: 1,
      memberships: [2],
    });

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('alvo@empresa.test');
  });

  it('nega takeover por PUT cross-tenant antes de qualquer mutação', async () => {
    const { response, writes } = await request('PUT', '/usuarios/200/acessos', {
      empresaId: 1,
      memberships: [2],
      body: { acessos: [{ empresaId: 1, role: 'viewer' }] },
    });

    expect(response.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('permite a substituição de acesso do próprio tenant', async () => {
    const { response, writes } = await request('PUT', '/usuarios/200/acessos', {
      empresaId: 1,
      memberships: [1],
      body: { acessos: [{ empresaId: 1, role: 'viewer' }] },
    });

    expect(response.status).toBe(200);
    expect(writes.length).toBeGreaterThan(0);
  });

  it('preserva o acesso cross-tenant do platform admin conforme o contrato atual', async () => {
    const { response } = await request('GET', '/usuarios/200/acessos', {
      empresaId: 1,
      memberships: [2],
      platformAdmin: true,
    });

    expect(response.status).toBe(200);
  });
});

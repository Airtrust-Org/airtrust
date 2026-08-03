/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', c.req.header('x-test-role') || 'admin');
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 101, origem: 'test' }),
}));

import funcoesRoutes from '../../routes/funcoes';
import setoresRoutes from '../../routes/setores';

function createDbMock() {
  const calls: Array<{ query: string; args: unknown[]; method: 'all' | 'run' }> = [];

  const db = {
    prepare(query: string) {
      const bind = (...args: unknown[]) => ({
        all: async () => {
          calls.push({ query, args, method: 'all' });

          if (query.includes('SELECT id') && query.includes('FROM funcoes WHERE id = ?')) {
            return { results: args[1] === 6 ? [{ id: 1, codigo: 'CMD', nome: 'Comandante' }] : [] };
          }
          if (query.includes('SELECT id') && query.includes('FROM setores WHERE id = ?')) {
            return { results: args[1] === 6 ? [{ id: 1, codigo: 'OPS', nome: 'Operações' }] : [] };
          }
          if (query.includes('SELECT id, codigo, nome')) {
            return { results: [] };
          }

          return { results: [] };
        },
        first: async () => ({ total: 0 }),
        run: async () => {
          calls.push({ query, args, method: 'run' });
          return { meta: { changes: 1, last_row_id: 77 } };
        },
      });

      return {
        bind,
        all: () => bind().all(),
        run: () => bind().run(),
      };
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('organizational catalog tenant isolation', () => {
  it('funcoes POST ignores empresa_id from body and writes tenant from session', async () => {
    const { db, calls } = createDbMock();

    const response = await funcoesRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({
          codigo: 'CMD',
          nome: 'Comandante',
          empresa_id: 999,
        }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const insert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO funcoes'),
    );
    expect(insert).toBeDefined();
    expect(insert?.args.at(-1)).toBe(6);
  });

  it('funcoes PUT/DELETE keep empresa_id in the final write WHERE clause', async () => {
    const { db, calls } = createDbMock();

    const putResponse = await funcoesRoutes.fetch(
      new Request('http://localhost/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({ nome: 'Comandante Chefe' }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(putResponse.status).toBe(200);

    const update = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE funcoes SET'),
    );
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args.at(-2)).toBe('1');
    expect(update?.args.at(-1)).toBe(6);

    const deleteResponse = await funcoesRoutes.fetch(
      new Request('http://localhost/1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(deleteResponse.status).toBe(200);
    const softDelete = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes('UPDATE funcoes SET deleted_at = datetime("now")'),
    );
    expect(softDelete?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(softDelete?.args).toEqual(['1', 6]);
  });

  it('setores POST ignores empresa_id from body and writes tenant from session', async () => {
    const { db, calls } = createDbMock();

    const response = await setoresRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({
          codigo: 'OPS',
          nome: 'Operações',
          empresa_id: 999,
        }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const insert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO setores'),
    );
    expect(insert).toBeDefined();
    expect(insert?.args.at(-1)).toBe(6);
  });

  it('setores PUT/DELETE keep empresa_id in the final write WHERE clause', async () => {
    const { db, calls } = createDbMock();

    const putResponse = await setoresRoutes.fetch(
      new Request('http://localhost/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({ nome: 'Operações de Voo' }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(putResponse.status).toBe(200);

    const update = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE setores SET'),
    );
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args.at(-2)).toBe('1');
    expect(update?.args.at(-1)).toBe(6);

    const deleteResponse = await setoresRoutes.fetch(
      new Request('http://localhost/1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );

    expect(deleteResponse.status).toBe(200);
    const softDelete = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes('UPDATE setores SET deleted_at = datetime("now")'),
    );
    expect(softDelete?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(softDelete?.args).toEqual(['1', 6]);
  });
});

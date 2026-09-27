/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return { ...actual, getEmpresaId: (c: any) => Number(c.get('empresaId') || 0) };
});

import router from '../../routes/qualificacoes-areas';

function createDbMock() {
  const calls: Array<{ query: string; args: unknown[]; method: 'all' | 'first' | 'run' }> = [];
  const row = {
    id: 77,
    empresa_id: 6,
    codigo: 'OPERACOES',
    nome: 'Operações',
    descricao: null,
    ativo: 1,
    created_at: '2026-09-27',
    updated_at: '2026-09-27',
  };

  const db = {
    prepare(query: string) {
      const bind = (...args: unknown[]) => ({
        all: async () => {
          calls.push({ query, args, method: 'all' });
          return { results: [row] };
        },
        first: async () => {
          calls.push({ query, args, method: 'first' });
          if (query.includes('COUNT(*) AS total')) return { total: 0 };
          if (query.includes('AND (UPPER(TRIM(nome))')) return null;
          if (query.includes('SELECT id, empresa_id, nome, codigo')) return row;
          if (query.includes('SELECT id, empresa_id, codigo, nome')) return row;
          return null;
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });
          return { meta: { changes: 1, last_row_id: 77 } };
        },
      });
      return { bind, all: () => bind().all(), first: () => bind().first(), run: () => bind().run() };
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualification areas tenant isolation', () => {
  it('GET is always scoped by session empresa_id', async () => {
    const { db, calls } = createDbMock();
    const response = await router.fetch(
      new Request('http://localhost/', {
        headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '6' },
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const select = calls.find((call) => call.method === 'all');
    expect(select?.query).toContain('empresa_id = ?');
    expect(select?.args).toEqual([6]);
  });

  it('POST ignores empresa_id from body and writes the session tenant', async () => {
    const { db, calls } = createDbMock();
    const response = await router.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({ nome: 'Operações', empresa_id: 999 }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(201);
    const insert = calls.find((call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_areas'));
    expect(insert?.args[0]).toBe(6);
    expect(insert?.args).not.toContain(999);
  });

  it('PUT keeps empresa_id in lookup and final write', async () => {
    const { db, calls } = createDbMock();
    const response = await router.fetch(
      new Request('http://localhost/77', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test',
          'x-test-empresa-id': '6',
        },
        body: JSON.stringify({ nome: 'Operações de Voo', empresa_id: 999 }),
      }),
      { DB: db } as any,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const update = calls.find((call) => call.method === 'run' && call.query.includes('UPDATE qualificacoes_areas'));
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args.at(-2)).toBe(77);
    expect(update?.args.at(-1)).toBe(6);
  });
});

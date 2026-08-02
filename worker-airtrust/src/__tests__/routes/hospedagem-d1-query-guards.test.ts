import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const { registrarAuditoriaMock } = vi.hoisted(() => ({
  registrarAuditoriaMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 77,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
}));

import hospedagemRoutes from '../../routes/hospedagem';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

type QueryCall = {
  query: string;
  args: unknown[];
  method: 'first' | 'run' | 'all';
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: QueryCall[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query}`);
      const handler = entry[1];

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };
      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      return {
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        all: async () => executeAll([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
          all: async () => executeAll(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/hospedagem', hospedagemRoutes);
  return app;
}

const hospedagemRow = {
  id: 8,
  empresa_id: 77,
  funcionario_id: 5,
  tipo: 'HOTEL',
  local: 'Hotel Alpha',
  cidade: 'Rio',
  estado: 'RJ',
  data_checkin: '2026-06-10',
  data_checkout: null,
  numero_quarto: '101',
  custo_diaria: 300,
  moeda: 'BRL',
  escala_id: null,
  observacoes: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: null,
  deleted_at: null,
};

describe('hospedagem D1 query guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarAuditoriaMock.mockResolvedValue(undefined);
  });

  it('uses explicit columns, secure join and deterministic list order', async () => {
    const { db, calls } = createMockDb([['FROM hospedagem h', { all: () => ({ results: [] }) }]]);

    const response = await createApp().request(
      '/hospedagem?funcionario_id=5&tipo=hotel&data_inicio=2026-06-01&data_fim=2026-06-30&ativo=1',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    const list = calls.find((call) => call.method === 'all');
    expect(list?.args).toEqual([77, 5, 'HOTEL', '2026-06-01', '2026-06-30']);
    expect(list?.query).not.toMatch(/SELECT\s+(?:h\.)?\*/i);
    expect(list?.query).toContain('f.empresa_id = h.empresa_id');
    expect(list?.query).toContain('f.deleted_at IS NULL');
    expect(list?.query).toContain('h.empresa_id = ?');
    expect(list?.query).toContain('h.deleted_at IS NULL');
    expect(list?.query).toContain('ORDER BY h.data_checkin DESC, h.id DESC LIMIT 500');
  });

  it('preserves the complete single-record payload without SELECT star', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM hospedagem h',
        {
          first: () => ({
            ...hospedagemRow,
            funcionario_nome: 'Tripulante',
            funcionario_matricula: 'MAT-5',
          }),
        },
      ],
    ]);

    const response = await createApp().request('/hospedagem/8', { method: 'GET' }, {
      DB: db,
    } as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 8,
        empresa_id: 77,
        funcionario_id: 5,
        deleted_at: null,
        funcionario_nome: 'Tripulante',
      },
    });

    const single = calls.find((call) => call.method === 'first');
    expect(single?.args).toEqual([8, 77]);
    expect(single?.query).not.toMatch(/SELECT\s+h\.\*/i);
    expect(single?.query).toContain('h.empresa_id');
    expect(single?.query).toContain('h.deleted_at');
    expect(single?.query).toContain('f.empresa_id = h.empresa_id');
    expect(single?.query).toContain('WHERE h.id = ? AND h.empresa_id = ? AND h.deleted_at IS NULL');
  });

  it('scopes the create readback to an active row in the tenant', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        { first: () => ({ id: 5 }) },
      ],
      ['INSERT INTO hospedagem', { run: () => ({ meta: { changes: 1, last_row_id: 12 } }) }],
      ['FROM hospedagem', { first: () => ({ ...hospedagemRow, id: 12 }) }],
    ]);

    const response = await createApp().request(
      '/hospedagem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 5,
          tipo: 'HOTEL',
          local: 'Hotel Alpha',
          data_checkin: '2026-06-10',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    const readback = calls.find(
      (call) => call.method === 'first' && call.query.includes('FROM hospedagem'),
    );
    expect(readback?.args).toEqual([12, 77]);
    expect(readback?.query).not.toMatch(/SELECT\s+\*/i);
    expect(readback?.query).toContain('empresa_id');
    expect(readback?.query).toContain('deleted_at');
    expect(readback?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
  });

  it('keeps update predicates and bind order tenant-scoped', async () => {
    const { db, calls } = createMockDb([
      ['FROM hospedagem', { first: () => hospedagemRow }],
      ['UPDATE hospedagem', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const response = await createApp().request(
      '/hospedagem/8',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local: 'Hotel Beta', cidade: null }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    const update = calls.find((call) => call.method === 'run');
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args).toEqual(['Hotel Beta', null, 8, 77]);
    expect(calls.every((call) => !/SELECT\s+\*/i.test(call.query))).toBe(true);
  });

  it('keeps checkout predicates and bind order tenant-scoped', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, data_checkin, data_checkout',
        {
          first: () => ({
            id: 8,
            data_checkin: '2026-06-10',
            data_checkout: null,
          }),
        },
      ],
      ['UPDATE hospedagem', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const response = await createApp().request(
      '/hospedagem/8/checkout',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_checkout: '2026-06-12' }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    const update = calls.find((call) => call.method === 'run');
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args).toEqual(['2026-06-12', 8, 77]);
  });

  it('keeps soft delete predicates and bind order tenant-scoped', async () => {
    const { db, calls } = createMockDb([
      ['FROM hospedagem', { first: () => hospedagemRow }],
      ['UPDATE hospedagem', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const response = await createApp().request('/hospedagem/8', { method: 'DELETE' }, {
      DB: db,
    } as Env);

    expect(response.status).toBe(200);
    const update = calls.find((call) => call.method === 'run');
    expect(update?.query).toContain('SET deleted_at = datetime');
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
    expect(update?.args).toEqual([8, 77]);
  });

  it.each([
    { method: 'GET', path: '/hospedagem/99', body: undefined },
    { method: 'PUT', path: '/hospedagem/99', body: { local: 'Cross tenant' } },
    {
      method: 'PATCH',
      path: '/hospedagem/99/checkout',
      body: { data_checkout: '2026-06-12' },
    },
    { method: 'DELETE', path: '/hospedagem/99', body: undefined },
  ])(
    'returns 404 and performs no cross-tenant write for $method $path',
    async ({ method, path, body }) => {
      const { db, calls } = createMockDb([
        ['FROM hospedagem h', { first: () => null }],
        ['FROM hospedagem', { first: () => null }],
      ]);

      const response = await createApp().request(
        path,
        {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
        { DB: db } as Env,
      );

      expect(response.status).toBe(404);
      expect(calls.some((call) => call.method === 'run')).toBe(false);
      const lookup = calls.find((call) => call.method === 'first');
      expect(lookup?.query).toMatch(/empresa_id\s*=\s*\?/);
      expect(lookup?.query).toMatch(/deleted_at\s+IS\s+NULL/i);
      expect(lookup?.args).toEqual([99, 77]);
    },
  );
});

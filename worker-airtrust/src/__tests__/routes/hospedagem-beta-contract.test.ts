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

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

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

describe('hospedagem beta contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarAuditoriaMock.mockResolvedValue(undefined);
  });

  it('lista hospedagens filtrando pela empresa do tenant', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM hospedagem h',
        {
          all: () => ({
            results: [
              {
                id: 1,
                empresa_id: 77,
                funcionario_id: 5,
                tipo: 'HOTEL',
                local: 'Hotel Alpha',
                cidade: 'Rio',
                estado: 'RJ',
                data_checkin: '2026-06-10',
                data_checkout: null,
              },
            ],
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.route('/hospedagem', hospedagemRoutes);

    const response = await app.request(
      '/hospedagem?ativo=1',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [
        {
          id: 1,
          funcionario_id: 5,
          local: 'Hotel Alpha',
        },
      ],
    });

    const listCall = calls.find((call) => call.method === 'all' && call.query.includes('FROM hospedagem h'));
    expect(listCall?.args[0]).toBe(77);
  });

  it('cria hospedagem valida no tenant atual e registra auditoria', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        {
          first: () => ({ id: 5 }),
        },
      ],
      [
        'INSERT INTO hospedagem',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 12 } }),
        },
      ],
      [
        'SELECT * FROM hospedagem WHERE id = ?',
        {
          first: () => ({
            id: 12,
            empresa_id: 77,
            funcionario_id: 5,
            tipo: 'HOTEL',
            local: 'Hotel Alpha',
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.route('/hospedagem', hospedagemRoutes);

    const response = await app.request(
      '/hospedagem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 5,
          tipo: 'HOTEL',
          local: 'Hotel Alpha',
          cidade: 'Rio',
          estado: 'RJ',
          data_checkin: '2026-06-10',
          data_checkout: '2026-06-12',
          numero_quarto: '101',
          custo_diaria: 300,
          moeda: 'BRL',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 12 },
      message: 'Hospedagem registrada com sucesso',
    });

    const insertCall = calls.find((call) => call.method === 'run' && call.query.includes('INSERT INTO hospedagem'));
    expect(insertCall?.args[0]).toBe(77);
    expect(insertCall?.args[1]).toBe(5);
    expect(registrarAuditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: 'hospedagem',
        acao: 'INSERT',
        registro_id: '12',
      }),
    );
  });

  it('bloqueia checkout anterior ao checkin sem gravar a hospedagem', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        {
          first: () => ({ id: 5 }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.route('/hospedagem', hospedagemRoutes);

    const response = await app.request(
      '/hospedagem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 5,
          tipo: 'HOTEL',
          local: 'Hotel Alpha',
          data_checkin: '2026-06-12',
          data_checkout: '2026-06-10',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Data de checkout não pode ser anterior ao checkin',
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO hospedagem'))).toBe(false);
    expect(registrarAuditoriaMock).not.toHaveBeenCalled();
  });
});

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', 'manager');
    c.set('tenantContext', {
      empresaId: 77,
      empresaCodigo: 'acme',
      empresaNome: 'Acme Air',
      role: 'manager',
      plano: 'pro',
      permissions: ['read', 'write'],
    });

    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 77,
}));

import sgsoRoutes from '../../routes/sgso';

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

describe('sgso relatos beta contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista relatos filtrando pelo tenant atual', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT COUNT(*) as n FROM sgso_relatos r',
        {
          first: () => ({ n: 1 }),
        },
      ],
      [
        'FROM sgso_relatos r',
        {
          all: () => ({
            results: [
              {
                id: 'relato-1',
                numero_protocolo: 'REL-2026-0001',
                tipo: 'INCIDENTE',
                status: 'ABERTO',
                anonimo: 0,
                relator_nome: 'Ana Costa',
              },
            ],
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/sgso', sgsoRoutes);

    const response = await app.request(
      '/sgso/relatos?page=1&limit=20',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: { page: 1, limit: 20, total: 1 },
      data: [
        {
          id: 'relato-1',
          relator_nome: 'Ana Costa',
        },
      ],
    });

    const listCall = calls.find((call) => call.method === 'all' && call.query.includes('FROM sgso_relatos r'));
    expect(listCall?.args[0]).toBe(77);
  });

  it('cria relato SGSO simples no tenant atual', async () => {
    const { db, calls } = createMockDb([
      [
        'INSERT OR IGNORE INTO sgso_protocolo_sequencia',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'UPDATE sgso_protocolo_sequencia SET ultimo_numero = ultimo_numero + 1',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT ultimo_numero FROM sgso_protocolo_sequencia',
        {
          first: () => ({ ultimo_numero: 7 }),
        },
      ],
      [
        'FROM frms_jornada fj',
        {
          first: () => null,
        },
      ],
      [
        'FROM escala_alocacoes ea',
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO sgso_relatos (',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 1 } }),
        },
      ],
      [
        'INSERT INTO sgso_relatos_historico_status',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/sgso', sgsoRoutes);

    const response = await app.request(
      '/sgso/relatos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'INCIDENTE',
          data_ocorrencia: '2026-06-02T12:00:00.000Z',
          descricao: 'Descricao funcional minima do relato',
          local_descricao: 'Pista principal',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: expect.any(String),
        numero_protocolo: 'REL-2026-0007',
        status: 'ABERTO',
        vinculado_frms: false,
        vinculado_escala: false,
      },
    });

    const insertCall = calls.find((call) => call.method === 'run' && call.query.includes('INSERT INTO sgso_relatos ('));
    expect(insertCall?.args[1]).toBe(77);
    expect(insertCall?.args[2]).toBe('REL-2026-0007');
    expect(insertCall?.args[3]).toBe('INCIDENTE');
    expect(insertCall?.args[14]).toBe('Descricao funcional minima do relato');
  });

  it('cria relato com relatorId e vincula escala automaticamente', async () => {
    const { db, calls } = createMockDb([
      [
        'INSERT OR IGNORE INTO sgso_protocolo_sequencia',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'UPDATE sgso_protocolo_sequencia SET ultimo_numero = ultimo_numero + 1',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT ultimo_numero FROM sgso_protocolo_sequencia',
        {
          first: () => ({ ultimo_numero: 8 }),
        },
      ],
      [
        'FROM frms_jornada fj',
        {
          first: () => null,
        },
      ],
      [
        'FROM escala_alocacoes ea',
        {
          first: () => ({ escala_id: 'esc-abc-123', quinzena: 1 }),
        },
      ],
      [
        'INSERT INTO sgso_relatos (',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 1 } }),
        },
      ],
      [
        'INSERT INTO sgso_relatos_historico_status',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/sgso', sgsoRoutes);

    const response = await app.request(
      '/sgso/relatos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'OCORRENCIA',
          data_ocorrencia: '2026-07-01T10:00:00.000Z',
          descricao: 'Relato com escala vinculada via relator_id',
          local_descricao: 'SBBR',
          relator_id: 42,
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.vinculado_escala).toBe(true);
    expect(json.data.vinculado_frms).toBe(false);

    // Verificar que a query de escala foi chamada (args: relator_id, empresa_id, data_ocorrencia)
    const escalaCall = calls.find((call) => call.query.includes('FROM escala_alocacoes ea'));
    expect(escalaCall).toBeDefined();
    expect(escalaCall?.args[0]).toBe(42);
    expect(escalaCall?.args[1]).toBe(77);

    // Verificar que a query de escala NÃO contém JOIN escalas (legacy)
    expect(escalaCall?.query).not.toContain('JOIN escalas');

    // Verificar que escala_id foi passado no INSERT
    const insertCall = calls.find((call) => call.method === 'run' && call.query.includes('INSERT INTO sgso_relatos ('));
    expect(insertCall?.args).toContain('esc-abc-123');
  });
});

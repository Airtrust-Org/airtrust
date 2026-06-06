import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', c.req.header('x-role') ?? 'manager');
    c.set('empresaId', Number(c.req.header('x-empresa-id') ?? 1));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.includes(role)) {
        return c.json({ success: false, error: 'forbidden', code: 'RBAC_FORBIDDEN' }, 403);
      }
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') ?? 0),
}));

import evdRoutes from '../../routes/escalas-evd';

type QueryCall = { query: string; args: unknown[]; method: 'first' | 'all' | 'run' };

type ExistingRow = {
  id: string;
  status: string;
  data: string;
  escala_id: string | null;
  pic_id: number | null;
  sic_id: number | null;
  pic_funcao: string | null;
  sic_funcao: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
  hora_decolagem_real: string | null;
  hora_pouso_real: string | null;
  hora_corte_motor: string | null;
  origem: string | null;
  destino: string | null;
  tipo_missao: string | null;
  observacoes: string | null;
};

function baseExisting(overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id: 'evd-1',
    status: 'RASCUNHO',
    data: '2026-06-01',
    escala_id: 'esc-1',
    pic_id: 101,
    sic_id: 202,
    pic_funcao: 'PIC',
    sic_funcao: 'SIC',
    aeronave_prefixo: 'PR-AAA',
    aeronave_modelo: 'AW139',
    hora_apresentacao: '08:00',
    hora_decolagem_prevista: '08:30',
    hora_pouso_previsto: '10:00',
    hora_decolagem_real: null,
    hora_pouso_real: null,
    hora_corte_motor: null,
    origem: 'SBSP',
    destino: 'SBGL',
    tipo_missao: 'OFFSHORE',
    observacoes: null,
    ...overrides,
  };
}

function createMockDb(options?: {
  existing?: ExistingRow | null;
  conflictRows?: Array<Record<string, unknown>>;
  lastCut?: { hora_corte_motor: string | null; data: string } | null;
  hasJustificativa?: boolean;
}) {
  const calls: QueryCall[] = [];

  const db = {
    prepare: (query: string) => {
      const runner = {
        first: async (...args: unknown[]) => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('FROM escala_voo_diaria') && query.includes('WHERE id = ? AND empresa_id = ?')) {
            return options?.existing ?? baseExisting();
          }

          if (query.includes('SELECT hora_corte_motor, data FROM (')) {
            return options?.lastCut ?? null;
          }

          if (query.includes('FROM escala_voo_diaria_justificativas') && query.includes('LIMIT 1')) {
            return options?.hasJustificativa ? { id: 'just-1' } : null;
          }

          return null;
        },
        all: async (...args: unknown[]) => {
          calls.push({ query, args, method: 'all' });

          if (query.includes('pic_id IN (') || query.includes('sic_id IN (')) {
            return { results: options?.conflictRows ?? [] };
          }

          return { results: [] };
        },
        run: async (...args: unknown[]) => {
          calls.push({ query, args, method: 'run' });
          return { meta: { changes: 1 } };
        },
      };

      return {
        first: async () => runner.first(),
        all: async () => runner.all(),
        run: async () => runner.run(),
        bind: (...boundArgs: unknown[]) => ({
          first: async () => runner.first(...boundArgs),
          all: async () => runner.all(...boundArgs),
          run: async () => runner.run(...boundArgs),
        }),
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/evd', evdRoutes);
  return app;
}

describe('EVD PUT operational guard', () => {
  it('keeps valid PUT working and preserves tenant binding', async () => {
    const { db, calls } = createMockDb();
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/evd/evd-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '77' },
        body: JSON.stringify({ origem: 'SBCF' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const selectCall = calls.find(
      (call) =>
        call.method === 'first' &&
        call.query.includes('FROM escala_voo_diaria') &&
        call.query.includes('WHERE id = ? AND empresa_id = ?'),
    );
    expect(selectCall?.args).toEqual(['evd-1', 77]);

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE escala_voo_diaria SET'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.args.at(-2)).toBe('evd-1');
    expect(updateCall?.args.at(-1)).toBe(77);
  });

  it('blocks PUT when update introduces duplicate crew conflict', async () => {
    const { db, calls } = createMockDb({
      conflictRows: [
        {
          id: 'evd-2',
          pic_id: 303,
          sic_id: 202,
          hora_apresentacao: '08:00',
          hora_decolagem_prevista: '08:30',
          hora_pouso_previsto: '10:00',
        },
      ],
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/evd/evd-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ pic_id: 303 }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Tripulante já alocado em outra escala diária na mesma data/intervalo.' });
    expect(calls.some((call) => call.method === 'run' && call.query.includes('UPDATE escala_voo_diaria SET'))).toBe(false);
  });

  it('blocks published EVD update when rest becomes invalid', async () => {
    const { db, calls } = createMockDb({
      existing: baseExisting({ status: 'PUBLICADA' }),
      lastCut: { data: '2026-06-01', hora_corte_motor: '07:30' },
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/evd/evd-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ hora_apresentacao: '08:00' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Repouso mínimo não atendido.' });
    expect(calls.some((call) => call.method === 'run' && call.query.includes('UPDATE escala_voo_diaria SET'))).toBe(false);
  });

  it('A1: alterar a tripulação faz a EVD consultar compromissos de treinamento do tripulante', async () => {
    const { db, calls } = createMockDb();
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/evd/evd-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        // pic_id é campo crítico -> dispara as checagens operacionais.
        body: JSON.stringify({ pic_id: 303 }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    // A EVD passou a enxergar treinamento como compromisso operacional: deve consultar
    // treinamentos_dias para o novo PIC (303).
    const trainingQuery = calls.find(
      (call) => call.method === 'first' && call.query.includes('treinamentos_dias'),
    );
    expect(trainingQuery).toBeDefined();
    expect(trainingQuery?.args).toEqual(expect.arrayContaining([303]));
  });

  it('blocks invalid composition when PIC and SIC are the same in PUT', async () => {
    const { db } = createMockDb();
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/evd/evd-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ pic_id: 999, sic_id: 999 }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'PIC e SIC não podem ser o mesmo tripulante.' });
  });
});

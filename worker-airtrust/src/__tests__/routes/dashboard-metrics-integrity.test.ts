import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const getTaxaConclusaoMensalMock = vi.fn();
const getUtilizacaoSimuladoresMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.req.header('x-empresa-id') || 1),
    empresaCodigo: 'empresa-test',
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../services/dashboardService', () => ({
  getDashboardMetrics: vi.fn(async () => ({})),
  getDashboardAlerts: vi.fn(async () => []),
  getComplianceScore: vi.fn(async () => ({})),
  getDemandaTreinamento: vi.fn(async () => ({})),
  getAtividadesRecentes: vi.fn(async () => []),
  getTaxaConclusaoMensal: (...args: unknown[]) => getTaxaConclusaoMensalMock(...args),
  getUtilizacaoSimuladores: (...args: unknown[]) => getUtilizacaoSimuladoresMock(...args),
  getSystemHealth: vi.fn(async () => ({})),
}));

import dashboardRoutes from '../../routes/dashboard';

type DashboardMetricBody = {
  success: boolean;
  data: {
    total_ativas: number;
    validas: number;
    a_vencer_30_dias: number;
    vencidas: number;
    renovadas?: number;
    planejadas?: number;
    por_categoria?: Array<{ categoria: string; total: number }>;
    por_tipo?: Array<{ tipo: string; total: number }>;
  };
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/dashboard', dashboardRoutes);
  return app;
}

function createPreparedDb(queue: Array<{ first?: unknown; all?: { results: unknown[] } }>) {
  let index = 0;
  const bindCalls: unknown[][] = [];

  const env = {
    DB: {
      prepare: vi.fn().mockImplementation(() => ({
        bind: (...args: unknown[]) => {
          bindCalls.push(args);
          const entry = queue[index++];
          return {
            first: vi.fn().mockResolvedValue(entry?.first ?? null),
            all: vi.fn().mockResolvedValue(entry?.all ?? { results: [] }),
          };
        },
      })),
    },
  } as unknown as Env;

  return { env, bindCalls };
}

describe('dashboard metrics integrity routes', () => {
  beforeEach(() => {
    getTaxaConclusaoMensalMock.mockReset();
    getUtilizacaoSimuladoresMock.mockReset();
  });

  it('propaga tenant em /dashboard/taxa-conclusao-mensal', async () => {
    getTaxaConclusaoMensalMock.mockResolvedValueOnce({ meses: ['Jan'], taxas: [93], meta: 90 });

    const app = createApp();
    const db = {} as D1Database;
    const response = await app.fetch(
      new Request('http://localhost/dashboard/taxa-conclusao-mensal', {
        method: 'GET',
        headers: {
          'x-empresa-id': '42',
        },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getTaxaConclusaoMensalMock).toHaveBeenCalledTimes(1);
    expect(getTaxaConclusaoMensalMock).toHaveBeenCalledWith(db, 42);
  });

  it('propaga tenant em /dashboard/utilizacao-simuladores', async () => {
    getUtilizacaoSimuladoresMock.mockResolvedValueOnce({ simuladores: [] });

    const app = createApp();
    const db = {} as D1Database;
    const response = await app.fetch(
      new Request('http://localhost/dashboard/utilizacao-simuladores', {
        method: 'GET',
        headers: {
          'x-empresa-id': '7',
        },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getUtilizacaoSimuladoresMock).toHaveBeenCalledTimes(1);
    expect(getUtilizacaoSimuladoresMock).toHaveBeenCalledWith(db, 7);
  });

  it('mantem /dashboard/qualificacoes com no-cache e agregados numericos coerentes', async () => {
    const { env, bindCalls } = createPreparedDb([
      { first: { dias_alerta_vencimento: 30 } },
      {
        first: {
          total: 12,
          validas: 5,
          vencendo: 3,
          vencidas: 2,
          renovadas: 1,
          planejadas: 1,
        },
      },
      {
        all: {
          results: [
            { categoria: 'IFR', total: 7 },
            { categoria: 'CRM', total: 5 },
          ],
        },
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/dashboard/qualificacoes', {
        method: 'GET',
        headers: { 'x-empresa-id': '9' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const body = (await response.json()) as DashboardMetricBody;
    expect(body).toMatchObject({
      success: true,
      data: {
        total_ativas: 12,
        validas: 5,
        a_vencer_30_dias: 3,
        vencidas: 2,
        renovadas: 1,
        planejadas: 1,
      },
    });
    expect(body.data.por_categoria).toEqual([
      { categoria: 'IFR', total: 7 },
      { categoria: 'CRM', total: 5 },
    ]);
    expect(bindCalls[0]).toEqual([9]);
    expect(bindCalls[1]?.at(-1)).toBe(9);
    expect(bindCalls[2]).toEqual([9]);
  });

  it('propaga tenant em /dashboard/licencas e preserva soma consistente', async () => {
    const { env, bindCalls } = createPreparedDb([
      { first: { dias_alerta_vencimento: 30 } },
      { first: { total: 9 } },
      { first: { total: 2 } },
      { first: { total: 3 } },
      { first: { total: 4 } },
      {
        all: {
          results: [
            { tipo: 'CMA', total: 6 },
            { tipo: 'CHT', total: 3 },
          ],
        },
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/dashboard/licencas', {
        method: 'GET',
        headers: { 'x-empresa-id': '15' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DashboardMetricBody;
    expect(body).toMatchObject({
      success: true,
      data: {
        total_ativas: 9,
        vencidas: 2,
        a_vencer_30_dias: 3,
        validas: 4,
      },
    });
    expect(body.data.vencidas + body.data.a_vencer_30_dias + body.data.validas).toBe(
      body.data.total_ativas,
    );
    expect(body.data.por_tipo).toEqual([
      { tipo: 'CMA', total: 6 },
      { tipo: 'CHT', total: 3 },
    ]);
    for (const call of bindCalls.slice(0, 6)) {
      expect(call[0]).toBe(15);
    }
  });
});

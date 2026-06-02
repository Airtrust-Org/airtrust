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

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/dashboard', dashboardRoutes);
  return app;
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
});

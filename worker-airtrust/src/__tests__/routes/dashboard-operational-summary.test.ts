import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const getEmployeeSectorAccessMock = vi.fn();
const getDashboardMetricsMock = vi.fn();
const getDashboardAlertsMock = vi.fn();
const getDashboardFrmsAlertsMock = vi.fn();
const getDashboardEscalasResumoMock = vi.fn();
const getDashboardUpcomingSessionsMock = vi.fn();
const getDashboardSimuladoresAlertasMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (
      c: {
        set: (key: string, value: string) => void;
        req: { header: (name: string) => string | undefined };
      },
      next: () => Promise<void>,
    ) => {
      c.set('userRole', c.req.header('x-user-role') || 'viewer');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();

  return {
    ...actual,
    getTenantContext: (c: { req: { header: (name: string) => string | undefined } }) => ({
      empresaId: Number(c.req.header('x-empresa-id') || 1),
      empresaCodigo: 'empresa-test',
      empresaNome: 'Empresa Teste',
      role: c.req.header('x-user-role') || 'viewer',
      plano: 'pro',
      permissions: ['read', 'write'],
    }),
  };
});

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: (...args: unknown[]) => getEmployeeSectorAccessMock(...args),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1 = 1', bindings: [] })),
}));

vi.mock('../../services/dashboardService', () => ({
  getDashboardMetrics: (...args: unknown[]) => getDashboardMetricsMock(...args),
  getDashboardAlerts: (...args: unknown[]) => getDashboardAlertsMock(...args),
  getDashboardFrmsAlerts: (...args: unknown[]) => getDashboardFrmsAlertsMock(...args),
  getDashboardEscalasResumo: (...args: unknown[]) => getDashboardEscalasResumoMock(...args),
  getDashboardUpcomingSessions: (...args: unknown[]) => getDashboardUpcomingSessionsMock(...args),
  getDashboardSimuladoresAlertas: (...args: unknown[]) =>
    getDashboardSimuladoresAlertasMock(...args),
  getComplianceScore: vi.fn(async () => ({})),
  getDemandaTreinamento: vi.fn(async () => ({})),
  getAtividadesRecentes: vi.fn(async () => []),
  getTaxaConclusaoMensal: vi.fn(async () => ({})),
  getUtilizacaoSimuladores: vi.fn(async () => ({})),
  getSystemHealth: vi.fn(async () => ({})),
}));

import dashboardRoutes from '../../routes/dashboard';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/dashboard', dashboardRoutes);
  return app;
}

function createEnv(sectors: Array<{ id: number; codigo: string; nome: string }>) {
  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn(async () => ({ results: sectors })),
    })),
  }));

  return { DB: { prepare } } as unknown as Env;
}

function primeSources() {
  getDashboardMetricsMock.mockResolvedValue({ tripulantesAtivos: 4 });
  getDashboardAlertsMock.mockResolvedValue([]);
  getDashboardFrmsAlertsMock.mockResolvedValue([]);
  getDashboardEscalasResumoMock.mockResolvedValue([]);
  getDashboardUpcomingSessionsMock.mockResolvedValue([]);
  getDashboardSimuladoresAlertasMock.mockResolvedValue({
    fichas_pendentes_avaliacao: 0,
    fichas_aguardando_assinatura_aluno: 0,
    fichas_aguardando_assinatura_instrutor: 0,
    fichas_aguardando_assinatura: 0,
    sessoes_proximas_sem_ficha_completa: 0,
    edicoes_pendentes: 0,
    janela_sessoes_proximas_horas: 24,
  });
}

describe('GET /dashboard/operational-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeSources();
  });

  it('permite ao administrador selecionar um subconjunto do tenant', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
    const env = createEnv([
      { id: 1, codigo: 'OPS', nome: 'Operações' },
      { id: 2, codigo: 'TRN', nome: 'Treinamento' },
    ]);

    const response = await createApp().fetch(
      new Request('http://localhost/dashboard/operational-summary?setor_ids=2,999', {
        headers: { 'x-empresa-id': '6', 'x-user-role': 'admin' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getDashboardMetricsMock).toHaveBeenCalledWith(env.DB, 6, {
      mode: 'restricted',
      setorIds: [2],
      funcionarioId: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        scope: {
          mode: 'all',
          selectable: true,
          selectedSetorIds: [2],
          ignoredRequestedSetorIds: 1,
        },
        unavailableSources: [],
      },
    });
  });

  it('mantem o gestor limitado aos setores autorizados', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [2],
      funcionarioId: null,
    });
    const env = createEnv([{ id: 2, codigo: 'TRN', nome: 'Treinamento' }]);

    const response = await createApp().fetch(
      new Request('http://localhost/dashboard/operational-summary?setor_ids=1,2', {
        headers: { 'x-empresa-id': '9', 'x-user-role': 'manager' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(getDashboardAlertsMock).toHaveBeenCalledWith(env.DB, 9, {
      mode: 'restricted',
      setorIds: [2],
      funcionarioId: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        scope: {
          mode: 'restricted',
          selectable: false,
          selectedSetorIds: [2],
          ignoredRequestedSetorIds: 1,
        },
      },
    });
  });

  it('responde com dados parciais sem classificar a fonte ausente como normal', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
    getDashboardFrmsAlertsMock.mockRejectedValueOnce(new Error('FRMS indisponível'));
    const env = createEnv([{ id: 1, codigo: 'OPS', nome: 'Operações' }]);

    const response = await createApp().fetch(
      new Request('http://localhost/dashboard/operational-summary', {
        headers: { 'x-empresa-id': '3', 'x-user-role': 'admin' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        frmsAlertas: null,
        unavailableSources: ['frms'],
      },
    });
  });

  it('nega o resumo consolidado a perfis sem papel administrativo ou gerencial', async () => {
    const env = createEnv([{ id: 1, codigo: 'OPS', nome: 'Operações' }]);

    const response = await createApp().fetch(
      new Request('http://localhost/dashboard/operational-summary', {
        headers: { 'x-empresa-id': '3', 'x-user-role': 'student' },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    expect(getEmployeeSectorAccessMock).not.toHaveBeenCalled();
  });
});

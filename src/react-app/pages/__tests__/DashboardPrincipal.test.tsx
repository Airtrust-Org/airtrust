import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPrincipal from '../DashboardPrincipal';

const {
  useAuthMock,
  usePermissionsMock,
  useMetricsQueryMock,
  useAlertasQueryMock,
  useFrmsAlertasQueryMock,
  useEscalasQueryMock,
  useSessoesSimuladorQueryMock,
  useSimuladoresAlertasQueryMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePermissionsMock: vi.fn(),
  useMetricsQueryMock: vi.fn(),
  useAlertasQueryMock: vi.fn(),
  useFrmsAlertasQueryMock: vi.fn(),
  useEscalasQueryMock: vi.fn(),
  useSessoesSimuladorQueryMock: vi.fn(),
  useSimuladoresAlertasQueryMock: vi.fn(),
}));

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('../dashboard/queries', () => ({
  useMetricsQuery: (...args: unknown[]) => useMetricsQueryMock(...args),
  useAlertasQuery: (...args: unknown[]) => useAlertasQueryMock(...args),
  useFrmsAlertasQuery: (...args: unknown[]) => useFrmsAlertasQueryMock(...args),
  useEscalasQuery: (...args: unknown[]) => useEscalasQueryMock(...args),
  useSessoesSimuladorQuery: (...args: unknown[]) => useSessoesSimuladorQueryMock(...args),
  useSimuladoresAlertasQuery: (...args: unknown[]) => useSimuladoresAlertasQueryMock(...args),
}));

function buildQueryState<T>(data: T, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: undefined,
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(async () => undefined),
    ...overrides,
  };
}

function buildMetricsData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tripulantesAtivos: 12,
    tripulantesComQualificacoesVencendo: 1,
    tripulantesComQualificacoesVencidas: 1,
    qualificacoesAVencer: 1,
    qualificacoesVencidas: 1,
    qualificacoesValidas: 10,
    totalQualificacoes: 12,
    demandaFutura30Dias: 0,
    demandaFutura60Dias: 0,
    demandaFutura90Dias: 0,
    ...overrides,
  };
}

function buildAuthContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: {
      id: 1,
      nome: 'Gestor Teste',
      email: 'gestor@empresa.com',
      role: 'GESTOR',
      permissions: [],
      funcionario_id: null,
    },
    empresas: [
      {
        id: 1,
        nome: 'AirTrust',
        codigo: 'AIR',
        role: 'GESTOR',
        is_primary: 1,
        is_current: 1,
        modulos_ativos: ['funcionarios', 'qualificacoes', 'simuladores', 'escalas', 'frms', 'sgso'],
      },
    ],
    empresaAtualId: 1,
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPrincipal />
    </MemoryRouter>,
  );
}

describe('DashboardPrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    useAuthMock.mockReturnValue(buildAuthContext());
    usePermissionsMock.mockReturnValue({
      can: (permission: string) =>
        [
          'funcionarios.view',
          'qualificacoes.view',
          'simuladores.view',
          'escalas.view',
          'frms.view',
          'sgso.view',
        ].includes(permission),
      isAdmin: false,
      isGestor: true,
      isInstrutor: false,
      isAluno: false,
    });
    useMetricsQueryMock.mockReturnValue(buildQueryState(buildMetricsData()));
    useAlertasQueryMock.mockReturnValue(buildQueryState([]));
    useFrmsAlertasQueryMock.mockReturnValue(buildQueryState([]));
    useEscalasQueryMock.mockReturnValue(buildQueryState([]));
    useSessoesSimuladorQueryMock.mockReturnValue(buildQueryState([]));
    useSimuladoresAlertasQueryMock.mockReturnValue(
      buildQueryState({
        fichas_pendentes_avaliacao: 0,
        fichas_aguardando_assinatura_aluno: 0,
        fichas_aguardando_assinatura_instrutor: 0,
        fichas_aguardando_assinatura: 0,
        sessoes_proximas_sem_ficha_completa: 0,
        edicoes_pendentes: 0,
        janela_sessoes_proximas_horas: 24,
      }),
    );
  });

  it('mantem o mesmo conjunto de alertas dispensado oculto e reexibe quando muda materialmente', () => {
    const view = renderDashboard();

    expect(screen.getByText(/1 qualificações vencidas/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dispensar alertas/i }));
    expect(screen.queryByText(/1 qualificações vencidas/i)).toBeNull();

    view.rerender(
      <MemoryRouter>
        <DashboardPrincipal />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/1 qualificações vencidas/i)).toBeNull();

    useMetricsQueryMock.mockReturnValue(
      buildQueryState(
        buildMetricsData({
          tripulantesComQualificacoesVencidas: 2,
          qualificacoesVencidas: 2,
        }),
      ),
    );

    view.rerender(
      <MemoryRouter>
        <DashboardPrincipal />
      </MemoryRouter>,
    );

    expect(screen.getByText(/2 qualificações vencidas/i)).toBeInTheDocument();
  });

  it('reavalia o banner quando a empresa atual muda', () => {
    const view = renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /dispensar alertas/i }));
    expect(screen.queryByText(/1 qualificações vencidas/i)).toBeNull();

    useAuthMock.mockReturnValue(
      buildAuthContext({
        empresaAtualId: 2,
        empresas: [
          {
            id: 2,
            nome: 'AirTrust 2',
            codigo: 'AIR2',
            role: 'GESTOR',
            is_primary: 0,
            is_current: 1,
            modulos_ativos: ['funcionarios', 'qualificacoes', 'simuladores', 'escalas'],
          },
        ],
      }),
    );

    view.rerender(
      <MemoryRouter>
        <DashboardPrincipal />
      </MemoryRouter>,
    );

    expect(screen.getByText(/1 qualificações vencidas/i)).toBeInTheDocument();
  });

  it('exibe pendencias de simuladores separadas de proximas sessoes', () => {
    useSimuladoresAlertasQueryMock.mockReturnValue(
      buildQueryState({
        fichas_pendentes_avaliacao: 2,
        fichas_aguardando_assinatura_aluno: 1,
        fichas_aguardando_assinatura_instrutor: 2,
        fichas_aguardando_assinatura: 3,
        sessoes_proximas_sem_ficha_completa: 4,
        edicoes_pendentes: 1,
        janela_sessoes_proximas_horas: 24,
      }),
    );
    useSessoesSimuladorQueryMock.mockReturnValue(
      buildQueryState([
        {
          id: 'sessao-1',
          data: '2026-06-21',
          hora_inicio: '09:00',
          tipo_sessao: 'REC',
          tema_sessao: 'Sessão LOFT',
          simulador_nome: 'AW139',
        },
      ]),
    );

    renderDashboard();

    expect(screen.getByText('Pendências que exigem ação')).toBeInTheDocument();
    expect(screen.getByText('Avaliações pendentes')).toBeInTheDocument();
    expect(screen.getByText('Assinaturas pendentes')).toBeInTheDocument();
    expect(screen.getByText('Edições pendentes')).toBeInTheDocument();
    expect(screen.getByText('Sessões sem ficha completa')).toBeInTheDocument();
    expect(screen.getByText('Próximas sessões')).toBeInTheDocument();
    expect(screen.getByText('Sessão LOFT')).toBeInTheDocument();
  });

  it('mostra estado vazio claro quando nao ha pendencias nem sessoes de simuladores', () => {
    renderDashboard();

    expect(
      screen.getByText('Nenhuma pendência operacional de simuladores.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhuma sessão futura relevante.')).toBeInTheDocument();
  });

  it('nao deixa modulos ocultos pelo menu clicaveis na home', () => {
    useAuthMock.mockReturnValue(
      buildAuthContext({
        user: {
          id: 1,
          nome: 'Admin Comum',
          email: 'admin@empresa.com',
          role: 'ADMINISTRADOR',
          permissions: [],
          funcionario_id: null,
        },
        empresas: [
          {
            id: 1,
            nome: 'AirTrust',
            codigo: 'AIR',
            role: 'ADMINISTRADOR',
            is_primary: 1,
            is_current: 1,
            modulos_ativos: ['funcionarios', 'qualificacoes', 'simuladores', 'frms', 'sgso', 'mro', 'controle_voos'],
          },
        ],
      }),
    );
    usePermissionsMock.mockReturnValue({
      can: (permission: string) =>
        ['funcionarios.view', 'qualificacoes.view', 'simuladores.view'].includes(permission),
      isAdmin: true,
      isGestor: false,
      isInstrutor: false,
      isAluno: false,
    });

    renderDashboard();

    expect(screen.queryByText('FRMS')).toBeNull();
    expect(screen.queryByText('SGSO')).toBeNull();
    expect(screen.queryByText('Manutenção')).toBeNull();
    expect(screen.queryByText('Controle de Voos')).toBeNull();
  });
});

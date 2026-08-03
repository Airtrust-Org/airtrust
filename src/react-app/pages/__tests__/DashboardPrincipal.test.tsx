import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPrincipal from '../DashboardPrincipal';

const { useAuthMock, usePermissionsMock, useOperationalSummaryMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePermissionsMock: vi.fn(),
  useOperationalSummaryMock: vi.fn(),
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

vi.mock('../dashboard/useOperationalSummary', () => ({
  useOperationalSummary: (...args: unknown[]) => useOperationalSummaryMock(...args),
}));

function buildAuthContext(role = 'ADMINISTRADOR') {
  return {
    user: {
      id: 1,
      nome: role === 'GESTOR' ? 'Gestor Setorial' : 'Admin Principal',
      email: role === 'ADMINISTRADOR' ? 'filipe.daumas@icloud.com' : 'gestor@empresa.com',
      role,
      permissions: [],
      funcionario_id: null,
    },
    empresas: [
      {
        id: 1,
        nome: 'AirTrust',
        codigo: 'AIR',
        role,
        is_primary: 1,
        is_current: 1,
        modulos_ativos: ['funcionarios', 'qualificacoes', 'simuladores', 'escalas', 'frms', 'sgso'],
      },
    ],
    empresaAtualId: 1,
  };
}

function buildSummary(selectable = true) {
  return {
    generatedAt: '2026-08-02T23:30:00-03:00',
    scope: {
      mode: selectable ? 'all' : 'restricted',
      selectable,
      sectorOptions: [
        { id: 1, codigo: 'OPS', nome: 'Operações' },
        { id: 2, codigo: 'TRN', nome: 'Treinamento' },
      ],
      selectedSetorIds: selectable ? [1, 2] : [1],
      ignoredRequestedSetorIds: 0,
    },
    metrics: {
      tripulantesAtivos: 12,
      tripulantesComQualificacoesVencendo: 1,
      tripulantesComQualificacoesVencidas: 1,
      qualificacoesAVencer: 1,
      qualificacoesVencidas: 1,
      qualificacoesValidas: 10,
      totalQualificacoes: 12,
      demandaFutura30Dias: 3,
      demandaFutura60Dias: 0,
      demandaFutura90Dias: 0,
      lms: {
        totalCursos: 2,
        totalMatriculas: 6,
        concluidos: 4,
        emAndamento: 2,
        taxaConclusaoPct: 66.7,
      },
    },
    alertas: [
      {
        id: 'qual-1',
        tipo: 'qualificacao_vencendo',
        criticidade: 'CRITICA',
        mensagem: 'CRM vencido',
        tripulanteNome: 'Tripulante Teste',
        qualificacaoNome: 'CRM',
        diasRestantes: -2,
        urlAcao: '/qualificacoes/alertas',
      },
    ],
    frmsAlertas: [],
    escalas: [],
    sessoes: [],
    simuladoresAlertas: {
      fichas_pendentes_avaliacao: 0,
      fichas_aguardando_assinatura_aluno: 0,
      fichas_aguardando_assinatura_instrutor: 0,
      fichas_aguardando_assinatura: 0,
      sessoes_proximas_sem_ficha_completa: 0,
      edicoes_pendentes: 0,
      janela_sessoes_proximas_horas: 24,
    },
    unavailableSources: [],
  };
}

function buildQuery(data: ReturnType<typeof buildSummary> | undefined, overrides = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPrincipal />} />
        <Route path="/funcionarios" element={<div>funcionarios-page</div>} />
        <Route path="*" element={<div>destination-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPrincipal setorial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuthMock.mockReturnValue(buildAuthContext());
    usePermissionsMock.mockReturnValue({
      can: () => true,
      isAdmin: true,
      isGestor: false,
      isInstrutor: false,
      isAluno: false,
    });
    useOperationalSummaryMock.mockReturnValue(buildQuery(buildSummary()));
  });

  it('prioriza decisões e identifica o escopo no lugar de repetir o menu de módulos', () => {
    renderDashboard();

    expect(screen.getByText('Ações que exigem decisão')).toBeInTheDocument();
    expect(screen.getByText('CRM vencida')).toBeInTheDocument();
    expect(screen.getByText(/Tripulante Teste/)).toBeInTheDocument();
    expect(screen.getByText('Indicadores do escopo selecionado')).toBeInTheDocument();
    expect(screen.queryByText('Módulos do sistema')).toBeNull();
  });

  it('só aplica a seleção do administrador quando ele confirma o filtro', () => {
    renderDashboard();

    fireEvent.click(screen.getAllByText('Todos os setores')[0]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Treinamento/ }));

    expect(useOperationalSummaryMock).not.toHaveBeenCalledWith([2], true);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtro' }));

    expect(useOperationalSummaryMock).toHaveBeenLastCalledWith([2], true);
    expect(window.localStorage.getItem('airtrust.dashboard.sectors.v2:1:1')).toBe('[2]');
  });

  it('mostra ao gestor um escopo fixo e mantém acesso à Home', () => {
    useAuthMock.mockReturnValue(buildAuthContext('GESTOR'));
    usePermissionsMock.mockReturnValue({
      can: () => true,
      isAdmin: false,
      isGestor: true,
      isInstrutor: false,
      isAluno: false,
    });
    useOperationalSummaryMock.mockReturnValue(buildQuery(buildSummary(false)));

    renderDashboard();

    expect(screen.getAllByText('Operações').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Aplicar filtro' })).toBeNull();
    expect(screen.queryByText('funcionarios-page')).toBeNull();
    expect(useOperationalSummaryMock).toHaveBeenCalledWith([], true);
  });

  it('informa falha parcial sem tratar a fonte ausente como normal', () => {
    const summary = buildSummary();
    summary.unavailableSources = ['frms'];
    useOperationalSummaryMock.mockReturnValue(buildQuery(summary));

    renderDashboard();

    expect(screen.getByText('Painel carregado com dados parciais')).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhuma fonte indisponível foi interpretada como situação normal/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Situação Normal')).toBeNull();
  });

  it('redireciona perfis sem acesso administrativo ou gerencial', () => {
    useAuthMock.mockReturnValue(buildAuthContext('INSTRUTOR'));
    usePermissionsMock.mockReturnValue({
      can: () => true,
      isAdmin: false,
      isGestor: false,
      isInstrutor: true,
      isAluno: false,
    });

    renderDashboard();

    expect(screen.getByText('funcionarios-page')).toBeInTheDocument();
    expect(useOperationalSummaryMock).toHaveBeenCalledWith([], false);
  });

  it('mantém a ordem dos hooks estável ao sair de loading para carregado', () => {
    useOperationalSummaryMock
      .mockReturnValueOnce(buildQuery(undefined, { isLoading: true }))
      .mockReturnValue(buildQuery(buildSummary()));

    const view = renderDashboard();

    view.rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPrincipal />} />
          <Route path="/funcionarios" element={<div>funcionarios-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Decisões do escopo selecionado')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsDashboard from '../FrmsDashboard';

const useFrmsOperationalSnapshotMock = vi.fn();
const useReadinessTeamMock = vi.fn();
const useFrmsOperationalAccessMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (...args: unknown[]) => useFrmsOperationalSnapshotMock(...args),
}));

vi.mock('@/react-app/hooks/useOperationalReadiness', () => ({
  useReadinessTeam: (...args: unknown[]) => useReadinessTeamMock(...args),
  useReadinessBaseline: () => ({ data: null }),
  useReadinessToday: () => ({ data: null }),
  useSubmitReadiness: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/react-app/hooks/useFrmsOperationalAccess', () => ({
  useFrmsOperationalAccess: (...args: unknown[]) => useFrmsOperationalAccessMock(...args),
  useFrmsMaintenanceTeam: () => ({
    data: {
      date: '2026-08-27',
      items: [],
      meta: { scope: 'maintenance', setor_ids: [11], access_source: 'frms_manager' },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSubmitFrmsMaintenanceCheckin: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 540,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7.5,
    qualidade_sono: 4,
    hora_acordar: '05:30',
    fadiga_score: 20,
    status_operacional_checkin: 'APTO',
    effectiveness_pct: 92,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: null,
    alertas: [],
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: 'Nenhuma ação imediata.',
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    data: [item()],
    summary: {
      total_tripulantes: 1,
      total_escalados: 1,
      checkins_recebidos: 1,
      checkins_pendentes: 0,
      alertas_criticos: 0,
      alertas_atencao: 0,
      dados_estimados: 0,
      inconsistencias: 0,
      sem_fatorizacao: 0,
      quinzena_incompleta: 0,
      quinzena_atencao: 0,
      quinzena_critica: 0,
    },
    meta: { scope: 'team' },
    loading: false,
    error: null,
    unauthorized: false,
    lastUpdatedAt: '2026-08-27T03:00:00.000Z',
    refetch: vi.fn(),
    ...overrides,
  };
}

function operationalAccess(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      administrative_role: 'GESTOR',
      enabled: true,
      domains: ['OPERACOES'],
      setor_ids: [1],
      actions: {},
      frms_profile: 'flight',
      employee: { id: 10, nome: 'Max Monteiro', cargo: 'Piloto', funcao: 'PIC', setor_id: 1 },
      can_manage_maintenance: false,
      maintenance_setor_ids: [],
      ...overrides,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function renderDashboard(initialEntry = '/frms') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FrmsDashboard />
    </MemoryRouter>,
  );
}

describe('FrmsDashboard simplificado', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
    useFrmsOperationalSnapshotMock.mockReturnValue(state());
    useReadinessTeamMock.mockReset();
    useReadinessTeamMock.mockReturnValue({ data: [] });
    useFrmsOperationalAccessMock.mockReset();
    useFrmsOperationalAccessMock.mockReturnValue(operationalAccess());
  });

  it('expõe as áreas primárias e remove a navegação antiga', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: 'Operações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Casos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administração' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manutenção' })).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoramento')).not.toBeInTheDocument();
    expect(screen.queryByText('Análise & Evidências')).not.toBeInTheDocument();
    expect(screen.queryByText('Operação agora')).not.toBeInTheDocument();
  });

  it('gestor de fadiga enxerga Operações e Manutenção e abre o painel de manutenção', () => {
    useFrmsOperationalAccessMock.mockReturnValue(
      operationalAccess({
        domains: ['FRMS'],
        setor_ids: [50],
        can_manage_maintenance: true,
        maintenance_setor_ids: [11],
      }),
    );

    renderDashboard('/frms?area=manutencao');

    expect(screen.getByRole('link', { name: 'Operações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manutenção' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fadiga da Manutenção' })).toBeInTheDocument();
    expect(screen.getByText(/gestão central de fadiga/i)).toBeInTheDocument();
  });

  it('administrador mantém acesso às duas áreas mesmo sem setor operacional próprio', () => {
    useFrmsOperationalAccessMock.mockReturnValue(
      operationalAccess({
        administrative_role: 'ADMINISTRADOR',
        domains: [],
        setor_ids: [],
        can_manage_maintenance: true,
        maintenance_setor_ids: [11],
      }),
    );

    renderDashboard('/frms');

    expect(screen.getByRole('link', { name: 'Operações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manutenção' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operação' })).toBeInTheDocument();
  });

  it('não permite abrir manutenção por query string sem escopo de gestão', () => {
    renderDashboard('/frms?area=manutencao');

    expect(screen.getByRole('heading', { name: 'Operação' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fadiga da Manutenção' })).not.toBeInTheDocument();
  });

  it('usa o dia operacional da URL no snapshot', () => {
    renderDashboard('/frms?data=2026-08-20');

    expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith({
      data_inicio: '2026-08-20',
      data_fim: '2026-08-20',
      include_inconsistencies: true,
    });
    expect(screen.getByLabelText('Dia operacional')).toHaveValue('2026-08-20');
  });

  it('não mostra zero operacional durante a primeira carga', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({ data: [], loading: true, lastUpdatedAt: null }),
    );

    renderDashboard();

    expect(screen.getByLabelText('Carregando situação operacional')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('rebaixa sem pendência e mantém o resumo superior só com métricas de ação', () => {
    renderDashboard();

    const summary = within(screen.getByLabelText('Resumo operacional'));
    expect(summary.getByText('Bloqueia')).toBeInTheDocument();
    expect(summary.getByText('Decidir')).toBeInTheDocument();
    expect(summary.getByText('Confirmar')).toBeInTheDocument();
    expect(summary.queryByText('Sem pendência')).not.toBeInTheDocument();
    expect(screen.getByText(/pessoa\(s\) sem pendência no recorte atual/i)).toBeInTheDocument();
  });

  it('mostra os quatro sinais operacionais em cada linha da fila', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({ data: [item({ checkin_status: 'AUSENTE', fortnight_indicator: null, estado_operacional: 'ATENCAO' })] }),
    );

    renderDashboard();

    const list = screen.getByLabelText('Sinais operacionais do dia');
    const chips = within(list);
    expect(chips.getByLabelText('Fadiga diária: Não realizada — crítico')).toBeInTheDocument();
    expect(chips.getByLabelText('Compliance: Dados incompletos — sem dado')).toBeInTheDocument();
    expect(chips.getByLabelText('Efetividade: 92,0% — normal')).toBeInTheDocument();
    expect(chips.getByLabelText('Prontidão: Não avaliado — sem dado')).toBeInTheDocument();
  });

  it('trata dado incompleto como confirmação, esconde efetividade não confiável e explica o que falta', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [item({
          snapshot_status: 'INCOMPLETO', estado_operacional: 'NAO_AVALIADO', fatorizacao_status: 'AUSENTE',
          jornada_data_source: 'AUSENTE', effectiveness_pct: 0, alertas: ['JORNADA_SEM_FATORIZACAO'],
          motivos_principais: ['Jornada ainda não consolidada.'], acao_recomendada_texto: 'Confirmar a jornada antes do despacho.',
        })],
      }),
    );

    renderDashboard();

    expect(screen.getAllByText('Confirmar').length).toBeGreaterThan(0);
    expect(screen.getByText('Jornada ainda não consolidada.')).toBeInTheDocument();
    expect(screen.getByLabelText('Efetividade: Não calculada — sem dado')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Max/i }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText(/Falta: sem jornada/i)).toBeInTheDocument();
    expect(drawer.getByText('Jornada: ausente')).toBeInTheDocument();
  });

  it('abre o detalhe no mesmo contexto e marca consultas externas como secundárias', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [item({
          funcionario_id: 30, tripulante_id: 30, nome: 'Pessoa Crítica', nome_guerra: null,
          hora_apresentacao: '07:00', snapshot_status: 'CRITICO', estado_operacional: 'CRITICO_VIOLACAO',
          motivos_principais: ['Limite operacional excedido.'], acao_recomendada_texto: 'Não despachar até mitigação.',
        })],
      }),
    );

    renderDashboard('/frms?data=2026-08-27');
    fireEvent.click(screen.getByRole('button', { name: /Pessoa Crítica/i }));

    const drawer = within(screen.getByRole('dialog'));
    expect(screen.getAllByText('Limite operacional excedido.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não despachar até mitigação.').length).toBeGreaterThan(0);
    expect(drawer.getByText(/Consultas secundárias — abrem outra tela/i)).toBeInTheDocument();
    expect(drawer.getByRole('link', { name: 'Abrir histórico (outra tela)' })).toHaveAttribute(
      'href', '/frms/tripulante/30?origem=operacao&data=2026-08-27',
    );
    expect(drawer.getByRole('link', { name: 'Abrir casos (outra tela)' })).toHaveAttribute(
      'href', '/frms/alertas?tripulante_id=30',
    );
    expect(drawer.queryByRole('link', { name: 'Abrir FRAT' })).not.toBeInTheDocument();
  });

  it('mantém o último estado válido visível quando a atualização falha', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(state({ error: 'falha de rede' }));

    renderDashboard();

    expect(screen.getByText(/mantendo o último estado válido/i)).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });
});

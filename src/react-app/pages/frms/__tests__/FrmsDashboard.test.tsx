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

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ isDenied: () => false }),
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
    operacao_requer_decisao: true,
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

  it('não coloca na fila o tripulante da quinzena quando não há atividade no dia', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [item({
          nome: 'Tripulante Sem Voo', nome_guerra: 'Sem Voo', escalado: false, teve_jornada: false,
          operacao_requer_decisao: false, estado_operacional: 'NORMAL',
          escala_source: 'AUSENTE', jornada_data_source: 'AUSENTE', fatorizacao_status: 'AUSENTE',
          effectiveness_pct: null, checkin_status: 'NAO_APLICAVEL', alertas: [],
        })],
      }),
    );

    renderDashboard();

    expect(screen.queryByRole('button', { name: /Sem Voo/i })).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma pendência operacional no recorte')).toBeInTheDocument();
  });

  it('rebaixa sem pendência e mantém o resumo superior só com métricas de ação', () => {
    renderDashboard();

    const summary = within(screen.getByLabelText('Resumo operacional'));
    expect(summary.getByText('Atenção')).toBeInTheDocument();
    expect(summary.getByText('Avaliar')).toBeInTheDocument();
    expect(summary.getByText('Verificar')).toBeInTheDocument();
    expect(summary.queryByText('Sem pendência')).not.toBeInTheDocument();
    expect(screen.getByText(/pessoa\(s\) sem pendência no recorte atual/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Como interpretar' })).toHaveAttribute('href', '/frms/conceitos');
    expect(screen.getByText(/Abra o registro para ver motivo, dados de origem e ação esperada/i)).toBeInTheDocument();
  });

  it('mostra os quatro sinais operacionais em cada linha da fila', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({ data: [item({ checkin_status: 'AUSENTE', fortnight_indicator: null, estado_operacional: 'ATENCAO' })] }),
    );

    renderDashboard();

    const list = screen.getByLabelText('Sinais operacionais do dia');
    const chips = within(list);
    expect(chips.getByLabelText('Check-in diário: Não realizada — crítico')).toBeInTheDocument();
    expect(chips.getByLabelText('Risco do período: Dados incompletos — sem dado')).toBeInTheDocument();
    const effectiveness = chips.getByLabelText(
      'Efetividade: 92,0% — normal — sinal positivo já apurado; a decisão operacional ainda requer avaliação dos demais sinais.',
    );
    expect(effectiveness).toHaveClass('bg-emerald-50');
    expect(effectiveness).not.toHaveClass('bg-slate-50');
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

    expect(screen.getAllByText('Verificar').length).toBeGreaterThan(0);
    expect(screen.getByText('Jornada ainda não consolidada.')).toBeInTheDocument();
    expect(screen.getByLabelText('Efetividade: Não calculada — sem dado')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Max/i }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText(/Falta: sem jornada/i)).toBeInTheDocument();
    expect(drawer.getByText('Jornada: ausente')).toBeInTheDocument();
    expect(drawer.getByText('Jornada: ausente')).toHaveClass('bg-slate-50');
    expect(drawer.getByText('Decisão não confirmada')).toBeInTheDocument();
    expect(drawer.getByText(/Não confirmar aptidão, liberação ou ausência de restrição/i)).toBeInTheDocument();
  });

  it('não exibe códigos internos nem enums de fonte em inglês na operação', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [item({
          snapshot_status: 'INCOMPLETO', estado_operacional: 'NAO_AVALIADO', fatorizacao_status: 'AUSENTE',
          motivos_principais: [
            'ROLLING_REGULATORY_EVIDENCE_MISSING',
            'ACTIVITY_INTERVAL_MISSING',
            'ACTIVITY_REALIZATION_UNCONFIRMED',
          ],
        })],
      }),
    );

    renderDashboard();

    expect(screen.queryByText('ROLLING_REGULATORY_EVIDENCE_MISSING')).not.toBeInTheDocument();
    expect(screen.getByText(/Histórico móvel de voo e jornada/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Max/i }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.queryByText('ACTIVITY_INTERVAL_MISSING')).not.toBeInTheDocument();
    expect(drawer.getByText(/Horário de início ou fim da atividade/i)).toBeInTheDocument();
    expect(drawer.getByText(/Realização da atividade ainda não foi confirmada/i)).toBeInTheDocument();
    expect(drawer.getByText('Jornada: Confirmado')).toBeInTheDocument();
    expect(drawer.getByText('Sono: Confirmado')).toBeInTheDocument();
    expect(drawer.getByText('Sono: Confirmado')).toHaveClass('bg-emerald-50');
  });

  it('distingue horário declarado no check-in de jornada confirmada', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [item({
          escalado: false,
          operacao_requer_decisao: true,
          jornada_data_source: 'AUSENTE',
          hora_apresentacao: '18:00',
          hora_termino: null,
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: null,
          estado_operacional: 'NAO_AVALIADO',
          motivos_principais: ['Horário de início ou fim da atividade ainda não foi informado'],
        })],
      }),
    );

    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: /Max/i }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText('Horário declarado')).toBeInTheDocument();
    expect(drawer.getByText(/Informado no check-in; a escala e a jornada ainda precisam ser confirmadas/i)).toBeInTheDocument();
  });

  it('explica que a jornada do dia em curso fecha após a operação e mantém o acumulado separado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
    try {
      useFrmsOperationalSnapshotMock.mockReturnValue(
        state({
          data: [item({
            data_operacional: '2026-09-29',
            escalado: false,
            jornada_data_source: 'AUSENTE',
            hora_apresentacao: '18:00',
            hora_termino: null,
            teve_jornada: false,
            teve_atividade_frms: false,
            fatorizacao_status: 'AUSENTE',
            effectiveness_pct: null,
            snapshot_status: 'INCOMPLETO',
            estado_operacional: 'NAO_AVALIADO',
            motivos_principais: ['Histórico móvel de voo e jornada ainda incompleto para a avaliação regulatória'],
            fortnight_indicator: {
              periodo_inicio: '2026-09-16', periodo_fim: '2026-09-30', dia_periodo: 14, total_dias_periodo: 15,
              dias_consecutivos_com_jornada: 2, dias_com_checkin_pendente: 0, dias_com_dado_estimado: 0,
              duty_time_periodo_min: 600, duty_time_168h_min: 300, horas_voo_periodo_min: 240,
              horas_voo_168h_min: 120, atividade_frms_periodo_min: 720, dias_atividade_periodo: 2,
              dias_consecutivos_com_atividade: 2, jornadas_periodo: 2, apresentacoes_antes_0600: 0,
              apresentacoes_antes_0700: 0, menor_descanso_entre_jornadas_min: 720, setores_periodo: null,
              sit_periods_estimados: null, fonte_periodo: 'REAL', freshness_dado: 'COMPLETO',
              status_quinzena: 'OK', score_acumulado: 20, tendencia: 'ESTAVEL',
              atenuadores_aplicados: [], agravantes_aplicados: [], natureza_dado: 'CHECKIN_SUBJETIVO',
              explicacao_operacional: 'Acumulado registrado.', mitigacao_recomendada: 'SEM_ACAO',
              decisao: 'INFORMA', limite_referencia: null, alertas_quinzena: [], limitation_notes: [],
            },
          })],
        }),
      );

      renderDashboard('/frms?data=2026-09-29');
      expect(screen.getByText(/Leitura do dia em curso/i)).toBeInTheDocument();
      expect(screen.getByText(/jornada real será confirmada após a operação/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Max/i }));
      const drawer = within(screen.getByRole('dialog'));
      expect(drawer.getByText('Dia em acompanhamento')).toBeInTheDocument();
      expect(drawer.getByText('Acumulado já registrado no período')).toBeInTheDocument();
      expect(drawer.getByText(/jornada aguardando encerramento/i)).toBeInTheDocument();
      expect(drawer.getByText(/ainda não entra nesses totais/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
    expect(drawer.getByRole('link', { name: 'Consultar casos relacionados (outra tela)' })).toHaveAttribute(
      'href', '/frms/alertas?tripulante_id=30',
    );
    expect(drawer.queryByRole('link', { name: 'Abrir FRAT' })).not.toBeInTheDocument();
  });

  it('não apresenta zeros como situação válida quando o snapshot inicial falha', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [],
        summary: null,
        error: 'Erro interno do servidor',
        lastUpdatedAt: null,
      }),
    );

    renderDashboard('/frms?data=2026-09-27');

    expect(screen.getByText(/Situação operacional indisponível — não interpretar como zero pendências/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Situação FRMS indisponível/i })).toBeInTheDocument();
    expect(screen.queryByText(/0 pessoa\(s\) sem pendência/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('mantém o último estado válido visível quando a atualização falha', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(state({ error: 'falha de rede' }));

    renderDashboard();

    expect(screen.getByText(/mantendo o último estado válido/i)).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });
});

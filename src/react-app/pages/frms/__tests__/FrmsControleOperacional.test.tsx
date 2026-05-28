import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FrmsControleOperacional from '../FrmsControleOperacional';

const useFrmsOperationalSnapshotMock = vi.fn();
const useFrmsReadAckEventsMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (filters: unknown) => useFrmsOperationalSnapshotMock(filters),
}));

vi.mock('@/react-app/hooks/useFrmsReadAckEvents', () => ({
  useFrmsReadAckEvents: (filters: unknown) => useFrmsReadAckEventsMock(filters),
}));

function buildHookState(overrides?: Partial<ReturnType<typeof baseHookState>>) {
  return {
    ...baseHookState(),
    ...overrides,
  };
}

function buildReadAckHookState(overrides?: Partial<ReturnType<typeof baseReadAckHookState>>) {
  return {
    ...baseReadAckHookState(),
    ...overrides,
  };
}

function baseHookState() {
  return {
    data: [],
    summary: {
      total_tripulantes: 0,
      total_escalados: 0,
      checkins_recebidos: 0,
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
    loading: false,
    error: null,
    unauthorized: false,
    refetch: vi.fn(),
  };
}

function baseReadAckHookState() {
  return {
    events: [],
    summary: {
      total: 0,
      pending: 0,
      acked: 0,
    },
    loading: false,
    mutating: false,
    error: null,
    refetch: vi.fn(),
    generateEvents: vi.fn(),
    acknowledgeEvent: vi.fn(),
  };
}

describe('FrmsControleOperacional', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
    useFrmsReadAckEventsMock.mockReset();
    useFrmsReadAckEventsMock.mockReturnValue(buildReadAckHookState());
  });

  it('renderiza KPIs e linha com alerta sem quebrar campos nulos', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      buildHookState({
        summary: {
          total_tripulantes: 2,
          total_escalados: 1,
          checkins_recebidos: 1,
          checkins_pendentes: 1,
          alertas_criticos: 1,
          alertas_atencao: 1,
          dados_estimados: 1,
          inconsistencias: 1,
          sem_fatorizacao: 1,
          quinzena_incompleta: 1,
          quinzena_atencao: 0,
          quinzena_critica: 1,
        },
        data: [
          {
            empresa_id: 1,
            data_operacional: '2026-05-25',
            funcionario_id: 10,
            tripulante_id: 10,
            nome: 'Max Monteiro Magioli',
            nome_guerra: 'Max',
            funcao: 'PIC',
            base: 'SBSP',
            aeronave: 'AW139',
            escalado: true,
            escala_source: 'SIGVOOS',
            hora_apresentacao: '08:00',
            hora_termino: '18:00',
            horas_voo_minutos: 180,
            duracao_jornada_minutos: 600,
            teve_jornada: true,
            checkin_status: 'PENDENTE',
            checkin_horario: null,
            kss_score: null,
            horas_sono: null,
            qualidade_sono: null,
            hora_acordar: null,
            fadiga_score: null,
            status_operacional_checkin: null,
            effectiveness_pct: null,
            nivel_fadiga_calculado: null,
            fatorizacao_status: 'AUSENTE',
            sleep_data_source: 'ESTIMADO',
            wake_data_source: 'ESTIMADO',
            jornada_data_source: 'INCONSISTENTE',
            jornada_origem: null,
            snapshot_status: 'CRITICO',
            fortnight_indicator: {
              periodo_inicio: '2026-05-16',
              periodo_fim: '2026-05-31',
              dia_periodo: 10,
              total_dias_periodo: 16,
              dias_consecutivos_com_jornada: 4,
              dias_com_checkin_pendente: 2,
              dias_com_dado_estimado: 2,
              duty_time_periodo_min: 2280,
              duty_time_168h_min: 1020,
              horas_voo_periodo_min: 760,
              horas_voo_168h_min: 320,
              jornadas_periodo: 4,
              apresentacoes_antes_0600: 1,
              apresentacoes_antes_0700: 2,
              menor_descanso_entre_jornadas_min: 640,
              setores_periodo: null,
              sit_periods_estimados: null,
              fonte_periodo: 'INCOMPLETO',
              status_quinzena: 'INCOMPLETO',
              alertas_quinzena: ['PERIODO_PARCIAL_NA_CONSULTA'],
              limitation_notes: ['Janela parcial.'],
            },
            alertas: ['CHECKIN_PENDENTE', 'JORNADA_SEM_FATORIZACAO', 'DADO_INCONSISTENTE'],
          },
        ],
      }),
    );

    render(<FrmsControleOperacional />);

    expect(screen.getByText('Controle Operacional de Fadiga')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Requer avaliação da coordenação')).toBeInTheDocument();
    expect(screen.getByText('Sono estimado')).toBeInTheDocument();
    expect(screen.getByText('Acordar estimado')).toBeInTheDocument();
  });

  it('exibe estado vazio', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(buildHookState());

    render(<FrmsControleOperacional />);

    expect(screen.getByText('Nenhum dado para os filtros informados.')).toBeInTheDocument();
  });

  it('renderiza eventos D1 e permite registrar ciencia mockada', () => {
    const acknowledgeEvent = vi.fn();
    useFrmsOperationalSnapshotMock.mockReturnValue(buildHookState());
    useFrmsReadAckEventsMock.mockReturnValue(
      buildReadAckHookState({
        events: [
          {
            id: 'frms_read_ack_1_2026-05-28_10_CHECKIN_PENDENTE',
            empresa_id: 1,
            data_operacional: '2026-05-28',
            funcionario_id: 10,
            funcionario_nome: 'Max',
            event_type: 'CHECKIN_PENDENTE',
            severity: 'ATENCAO',
            status: 'PENDING',
            source: 'OPERATIONAL_SNAPSHOT',
            snapshot_status: 'ATENCAO',
            snapshot_alertas: ['CHECKIN_PENDENTE'],
            checkin_status: 'PENDENTE',
            sleep_data_source: 'AUSENTE',
            wake_data_source: 'AUSENTE',
            jornada_data_source: 'REAL',
            fortnight_status: null,
            created_at: '2026-05-28T19:00:00Z',
            acknowledged_at: null,
            acknowledged_by: null,
            acknowledged_by_name: null,
            ack_note: null,
            limitations: ['Evento operacional de leitura e ciencia; nao representa mitigacao.'],
          },
        ],
        summary: { total: 1, pending: 1, acked: 0 },
        acknowledgeEvent,
      }),
    );

    render(<FrmsControleOperacional />);

    expect(screen.getByText('Ciência operacional FRMS')).toBeInTheDocument();
    expect(screen.getByText('Check-in pendente')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registrar ciência'));
    expect(acknowledgeEvent).toHaveBeenCalledWith(
      'frms_read_ack_1_2026-05-28_10_CHECKIN_PENDENTE',
    );
  });

  it('exibe erro de carregamento', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      buildHookState({
        error: 'Erro de API',
      }),
    );

    render(<FrmsControleOperacional />);

    expect(screen.getByText('Erro de API')).toBeInTheDocument();
  });

  it('aplica filtros ao clicar em Atualizar', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(buildHookState());

    render(<FrmsControleOperacional />);

    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'SBJR' } });
    fireEvent.change(screen.getByLabelText('Aeronave'), { target: { value: 'SK76' } });
    fireEvent.click(screen.getByText('Atualizar'));

    const calls = useFrmsOperationalSnapshotMock.mock.calls;
    const lastFilters = calls[calls.length - 1]?.[0] as Record<string, unknown>;

    expect(lastFilters.base).toBe('SBJR');
    expect(lastFilters.aeronave).toBe('SK76');
  });
});

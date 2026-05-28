import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FrmsControleOperacional from '../FrmsControleOperacional';

const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (filters: unknown) => useFrmsOperationalSnapshotMock(filters),
}));

function buildHookState(overrides?: Partial<ReturnType<typeof baseHookState>>) {
  return {
    ...baseHookState(),
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
    },
    loading: false,
    error: null,
    unauthorized: false,
    refetch: vi.fn(),
  };
}

describe('FrmsControleOperacional', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
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

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FrmsFortnightIndicator,
  FrmsOperationalSnapshotItem,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  FortnightConsolidatedPanel,
  FortnightCrewSummaryCard,
  FortnightDetailPanel,
} from '../components/FortnightOperationalIndicator';
import { FORTNIGHT_NO_DATA_MESSAGE } from '../fortnightOperationalLabels';

const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', async () => {
  const actual = await vi.importActual('@/react-app/hooks/useFrmsOperationalSnapshot');
  return {
    ...actual,
    useFrmsOperationalSnapshot: (...args: unknown[]) => useFrmsOperationalSnapshotMock(...args),
  };
});

function buildIndicator(
  overrides: Partial<FrmsFortnightIndicator> = {},
): FrmsFortnightIndicator {
  return {
    periodo_inicio: '2026-05-16',
    periodo_fim: '2026-05-31',
    dia_periodo: 10,
    total_dias_periodo: 16,
    dias_consecutivos_com_jornada: 3,
    dias_com_checkin_pendente: 0,
    dias_com_dado_estimado: 0,
    duty_time_periodo_min: 1800,
    duty_time_168h_min: 900,
    horas_voo_periodo_min: 600,
    horas_voo_168h_min: 260,
    jornadas_periodo: 3,
    apresentacoes_antes_0600: 0,
    apresentacoes_antes_0700: 0,
    menor_descanso_entre_jornadas_min: 720,
    setores_periodo: null,
    sit_periods_estimados: null,
    fonte_periodo: 'REAL',
    freshness_dado: 'COMPLETO',
    status_quinzena: 'ATENCAO',
    score_acumulado: 55,
    tendencia: 'CRESCENTE',
    atenuadores_aplicados: [{ codigo: 'A1', descricao: 'Repouso adequado', impacto_score: -5 }],
    agravantes_aplicados: [{ codigo: 'G1', descricao: 'Sequência longa', impacto_score: 8 }],
    natureza_dado: 'PROJECAO',
    explicacao_operacional: 'Projeção operacional com tendência de alta.',
    mitigacao_recomendada: 'REVISAR_CHECKIN',
    decisao: 'ALERTA',
    limite_referencia: null,
    alertas_quinzena: [],
    limitation_notes: [],
    ...overrides,
  };
}

function buildTimelineItem(
  overrides: Partial<FrmsOperationalSnapshotItem> = {},
): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-05-16',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBSP',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'EVD',
    hora_apresentacao: '08:00',
    hora_termino: '16:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 480,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7,
    qualidade_sono: 4,
    hora_acordar: '05:10',
    fadiga_score: 18,
    status_operacional_checkin: 'OK',
    effectiveness_pct: 91,
    nivel_fadiga_calculado: 'VERDE',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: buildIndicator({
      periodo_inicio: '2026-05-16',
      periodo_fim: '2026-05-18',
      dia_periodo: 1,
      total_dias_periodo: 3,
      status_quinzena: 'ATENCAO',
    }),
    alertas: [],
    ...overrides,
  };
}

describe('FortnightOperationalIndicator components', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
  });

  it('renderiza detalhes quando fortnight_indicator existe', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
    render(<FortnightDetailPanel indicator={buildIndicator()} item={{ teve_jornada: true }} />);
    expect(screen.getByText('Ver evolução diária')).toBeInTheDocument();
    expect(screen.getByText(/Indicador operacional da quinzena/)).toBeInTheDocument();
    expect(screen.getByText('Projeção')).toBeInTheDocument();
    expect(screen.getByText(/Score acumulado:/)).toBeInTheDocument();
    expect(screen.getByText(/Sequência longa/)).toBeInTheDocument();
  });

  it('expõe fallbacks honestos para contexto embarcado e campos nulos', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
    render(<FortnightDetailPanel indicator={buildIndicator()} item={{ teve_jornada: true }} />);
    fireEvent.click(screen.getByText('Ver evolução diária'));
    expect(screen.getByText(/Contexto embarcado:/)).toBeInTheDocument();
    expect(screen.getAllByText('Não confirmado').length).toBeGreaterThanOrEqual(2);
  });

  it('não quebra sem fortnight_indicator', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
    render(<FortnightDetailPanel indicator={null} item={{ teve_jornada: false }} />);
    expect(screen.getByText('Ver evolução diária')).toBeInTheDocument();
    expect(
      screen.getByText('Sem jornada FRMS registrada nesta data.'),
    ).toBeInTheDocument();
  });

  it('card do tripulante mostra fallback sem dados', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
    render(<FortnightCrewSummaryCard indicator={null} />);
    expect(screen.getByText(FORTNIGHT_NO_DATA_MESSAGE)).toBeInTheDocument();
  });

  it('card simplificado não expõe score acumulado', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
    render(<FortnightCrewSummaryCard indicator={buildIndicator()} simplified />);
    expect(screen.getByText('Resumo da quinzena')).toBeInTheDocument();
    expect(screen.queryByText(/Score acumulado:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tendência:/)).not.toBeInTheDocument();
  });

  it('painel consolidado mostra mitigação, aviso de período incompleto e timeline honesta', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [
        buildTimelineItem(),
        buildTimelineItem({
          data_operacional: '2026-05-18',
          snapshot_status: 'CRITICO',
          effectiveness_pct: 63,
          fortnight_indicator: buildIndicator({
            periodo_inicio: '2026-05-16',
            periodo_fim: '2026-05-18',
            dia_periodo: 3,
            total_dias_periodo: 3,
            mitigacao_recomendada: 'REDUZIR_JORNADA',
          }),
        }),
      ],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });

    render(
      <FortnightConsolidatedPanel
        indicator={buildIndicator({
          periodo_inicio: '2026-05-16',
          periodo_fim: '2026-05-18',
          dia_periodo: null,
          total_dias_periodo: null,
          fonte_periodo: 'INCOMPLETO',
          status_quinzena: 'INCOMPLETO',
          mitigacao_recomendada: 'REDUZIR_JORNADA',
          alertas_quinzena: ['PERIODO_PARCIAL_NA_CONSULTA'],
        })}
        funcionarioId={10}
        focusDate="2026-05-18"
      />,
    );

    expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data_inicio: '2026-05-16',
        data_fim: '2026-05-18',
        funcionario_id: '10',
      }),
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByText(/Tendência:/)).toBeInTheDocument();
    expect(screen.getByText(/Mitigação sugerida:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Período incompleto/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/A leitura considera apenas os dias disponíveis/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Não usar isoladamente como decisão final/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Sem dado confirmado/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Lacuna no snapshot do período/)).toBeInTheDocument();
    expect(screen.getByText(/Ação: Reduzir jornada/)).toBeInTheDocument();
  });
});

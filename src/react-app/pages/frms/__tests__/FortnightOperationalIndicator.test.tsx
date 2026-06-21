import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  FortnightConsolidatedPanel,
  FortnightCrewSummaryCard,
  FortnightDetailPanel,
} from '../components/FortnightOperationalIndicator';
import { FORTNIGHT_NO_DATA_MESSAGE } from '../fortnightOperationalLabels';

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

describe('FortnightOperationalIndicator components', () => {
  it('renderiza detalhes quando fortnight_indicator existe', () => {
    render(<FortnightDetailPanel indicator={buildIndicator()} item={{ teve_jornada: true }} />);
    expect(screen.getByText('Detalhes da quinzena')).toBeInTheDocument();
    expect(screen.getByText(/Indicador operacional estimado/)).toBeInTheDocument();
    expect(screen.getByText('Projeção')).toBeInTheDocument();
    expect(screen.getByText(/Score acumulado:/)).toBeInTheDocument();
    expect(screen.getByText(/Sequência longa/)).toBeInTheDocument();
  });

  it('não quebra sem fortnight_indicator', () => {
    render(<FortnightDetailPanel indicator={null} item={{ teve_jornada: false }} />);
    expect(screen.getByText('Detalhes da quinzena')).toBeInTheDocument();
    expect(
      screen.getByText('Sem jornada FRMS registrada nesta data.'),
    ).toBeInTheDocument();
  });

  it('card do tripulante mostra fallback sem dados', () => {
    render(<FortnightCrewSummaryCard indicator={null} />);
    expect(screen.getByText(FORTNIGHT_NO_DATA_MESSAGE)).toBeInTheDocument();
  });

  it('card simplificado não expõe score acumulado', () => {
    render(<FortnightCrewSummaryCard indicator={buildIndicator()} simplified />);
    expect(screen.getByText('Resumo da quinzena')).toBeInTheDocument();
    expect(screen.queryByText(/Score acumulado:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tendência:/)).not.toBeInTheDocument();
  });

  it('painel consolidado mostra mitigação e tendência', () => {
    render(<FortnightConsolidatedPanel indicator={buildIndicator()} />);
    expect(screen.getByText(/Tendência:/)).toBeInTheDocument();
    expect(screen.getByText(/Mitigação sugerida:/)).toBeInTheDocument();
    expect(screen.getByText(/Projeção operacional com tendência de alta/)).toBeInTheDocument();
  });
});

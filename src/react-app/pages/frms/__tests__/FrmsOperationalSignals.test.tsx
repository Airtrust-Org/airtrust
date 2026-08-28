import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FrmsSignalChips, FrmsSignalGrid } from '../components/FrmsOperationalSignals';
import type { FrmsReadinessAdapter } from '../frmsOperationalSignals';

const { readinessState } = vi.hoisted(() => ({
  readinessState: { rows: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/react-app/hooks/useOperationalReadiness', () => ({
  useReadinessTeam: () => ({ data: readinessState.rows }),
}));

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Tripulante Teste',
    nome_guerra: 'Teste',
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

beforeEach(() => {
  readinessState.rows = [];
});

describe('FrmsSignalChips', () => {
  it('renderiza os quatro sinais compactos com aria-label textual (não só cor)', () => {
    render(<FrmsSignalChips item={item()} />);
    const list = screen.getByLabelText('Sinais operacionais do dia');
    const chips = within(list);
    expect(chips.getByLabelText('Fadiga diária: Realizada — normal')).toBeInTheDocument();
    expect(chips.getByLabelText('Compliance: Dados incompletos — sem dado')).toBeInTheDocument();
    expect(chips.getByLabelText('Efetividade: 92,0% — normal')).toBeInTheDocument();
    expect(chips.getByLabelText('Prontidão: Não avaliado — sem dado')).toBeInTheDocument();
  });

  it('usa automaticamente a prontidão persistida do mesmo tripulante e dia', () => {
    readinessState.rows = [
      {
        funcionario_id: 10,
        reference_date: '2026-08-27',
        classification: 'operational_review',
        baseline_sessions: 5,
        baseline_ready: 1,
        median_rt_delta_pct: 18,
        lapse_rate_delta: 0.1,
        warning_signals_json: '[]',
        critical_signals_json: '["sleep_critical"]',
        created_at: '2026-08-27 10:00:00',
      },
    ];

    render(<FrmsSignalChips item={item()} />);
    expect(
      screen.getByLabelText('Prontidão: Revisão operacional — crítico'),
    ).toBeInTheDocument();
  });
});

describe('FrmsSignalGrid', () => {
  it('renderiza o bloco "Status operacional do dia" com os quatro sinais', () => {
    render(<FrmsSignalGrid item={item()} />);
    const grid = screen.getByLabelText('Status operacional do dia');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4);
  });

  it('mostra o progresso quando o baseline de prontidão ainda está em formação', () => {
    readinessState.rows = [
      {
        funcionario_id: 10,
        reference_date: '2026-08-27',
        classification: 'baseline_building',
        baseline_sessions: 3,
        baseline_ready: 0,
        median_rt_delta_pct: null,
        lapse_rate_delta: null,
        warning_signals_json: '[]',
        critical_signals_json: '[]',
        created_at: '2026-08-27 10:00:00',
      },
    ];

    render(<FrmsSignalGrid item={item()} />);
    expect(
      screen.getByLabelText('Prontidão: Baseline em formação — sem dado'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 sessões válidas no baseline')).toBeInTheDocument();
  });

  it('permite override explícito do adapter sem alterar a classificação persistida', () => {
    readinessState.rows = [
      {
        funcionario_id: 10,
        reference_date: '2026-08-27',
        classification: 'preserved',
        baseline_sessions: 5,
        baseline_ready: 1,
      },
    ];
    const adapter: FrmsReadinessAdapter = () => 'attention';
    render(<FrmsSignalGrid item={item()} readinessAdapter={adapter} />);
    expect(screen.getByLabelText('Prontidão: Atenção — atenção')).toBeInTheDocument();
  });
});

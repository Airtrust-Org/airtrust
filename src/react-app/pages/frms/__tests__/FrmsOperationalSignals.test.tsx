import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FrmsSignalChips, FrmsSignalGrid } from '../components/FrmsOperationalSignals';
import type { FrmsReadinessAdapter } from '../frmsOperationalSignals';

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
});

describe('FrmsSignalGrid', () => {
  it('renderiza o bloco "Status operacional do dia" com os quatro sinais', () => {
    render(<FrmsSignalGrid item={item()} />);
    const grid = screen.getByLabelText('Status operacional do dia');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4);
  });

  it('usa a classificação autoritativa de prontidão quando o adapter fornece dado', () => {
    const adapter: FrmsReadinessAdapter = () => 'operational_review';
    render(<FrmsSignalGrid item={item()} readinessAdapter={adapter} />);
    expect(
      screen.getByLabelText('Prontidão: Revisão operacional — crítico'),
    ).toBeInTheDocument();
  });
});

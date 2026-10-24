import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FrmsOverview, FrmsScoreExplanation, FrmsEvidenceActions, FrmsScoreMeter, matchesFrmsOverviewFilter } from '../components/FrmsVisualTriage';
import { frmsAttentionFacts, frmsOperationalEvidenceLabel, hasFrmsOtherConfidenceGaps, isFrmsRoutineDutyClosurePending } from '../frmsEvidenceContext';

const baseline = (): FrmsOperationalSnapshotItem => ({
  empresa_id: 1, data_operacional: '2026-10-14', funcionario_id: 7, tripulante_id: 7,
  nome: 'Pessoa sintética', nome_guerra: 'QA', funcao: 'PIC', base: 'SBME', aeronave: 'AW139',
  escalado: true, na_quinzena_ativa: true, operacao_requer_decisao: true,
  escala_source: 'SIGVOOS', hora_apresentacao: '06:00', hora_termino: null,
  horas_voo_minutos: 0, duracao_jornada_minutos: 0, teve_jornada: false,
  checkin_status: 'RECEBIDO', checkin_horario: '05:35', kss_score: 2, horas_sono: 7,
  qualidade_sono: 4, hora_acordar: '05:00', fadiga_score: 18,
  status_operacional_checkin: 'NORMAL', effectiveness_pct: 91,
  nivel_fadiga_calculado: 'VERDE', fatorizacao_status: 'PROJETADA',
  sleep_data_source: 'REAL', wake_data_source: 'REAL', jornada_data_source: 'AUSENTE',
  jornada_origem: null, operational_data_source: 'SIGVOOS',
  snapshot_status: 'ATENCAO', estado_operacional: 'ATENCAO',
  alertas: [], motivos_principais: ['Sequência de jornadas'], acao_recomendada_texto: 'Revisar sequência.',
  fortnight_indicator: {
    periodo_inicio: '2026-10-01', periodo_fim: '2026-10-15',
    dia_periodo: 14, total_dias_periodo: 15,
    dias_consecutivos_com_jornada: 8, dias_com_checkin_pendente: 1, dias_com_dado_estimado: 0,
    duty_time_periodo_min: 4800, duty_time_168h_min: 2600,
    horas_voo_periodo_min: 2500, horas_voo_168h_min: 1800,
    jornadas_periodo: 8, apresentacoes_antes_0600: 1, apresentacoes_antes_0700: 3,
    menor_descanso_entre_jornadas_min: 670, setores_periodo: 8, sit_periods_estimados: 0,
    fonte_periodo: 'REAL', freshness_dado: 'COMPLETO', status_quinzena: 'ATENCAO',
    score_acumulado: 55.4, tendencia: 'CRESCENTE', natureza_dado: 'PROJECAO',
    atenuadores_aplicados: [{ codigo: 'R1', descricao: 'Repouso confirmado', impacto_score: -5 }],
    agravantes_aplicados: [{ codigo: 'C1', descricao: 'Dias consecutivos', impacto_score: 12 }],
    alertas_quinzena: [], limitation_notes: [],
  },
});

describe('FRMS triagem visual sem inventar métricas', () => {
  it('expõe distribuição de riscos e confiança em canais independentes, omitindo contagens zero', () => {
    const a = baseline();
    render(<FrmsOverview queue={[{ item: a, bucket: 'DECISAO' }]} checkinPendingCount={0} activeFilter={null} onFilterChange={vi.fn()} todayIso="2026-10-14" />);
    const summary = within(screen.getByLabelText('Visão visual da operação'));
    expect(summary.getByText('Avaliar')).toBeInTheDocument();
    expect(summary.getByText('Jornada a consolidar')).toBeInTheDocument();
    expect(summary.queryByText('Outras lacunas de dados')).not.toBeInTheDocument();
    expect(summary.queryByText('Crítico')).not.toBeInTheDocument();
    expect(summary.queryByText('Check-ins pendentes')).not.toBeInTheDocument();
    expect(summary.getByRole('group', { name: 'Filtrar pela distribuição de prioridades' })).toBeInTheDocument();
  });

  it('filtra pelos cartões e pela faixa de prioridade, sem deixar coluna vazia', () => {
    const onFilterChange = vi.fn();
    const view = render(<FrmsOverview
      queue={[{ item: baseline(), bucket: 'DECISAO' }]}
      checkinPendingCount={1}
      activeFilter={null}
      onFilterChange={onFilterChange}
      todayIso="2026-10-14"
    />);
    const overview = within(screen.getByLabelText('Visão visual da operação'));
    const grid = overview.getByRole('button', { name: 'Filtrar fila: Check-ins pendentes (1)' }).parentElement;
    expect(grid).toHaveClass('lg:grid-cols-3');
    fireEvent.click(overview.getByRole('button', { name: 'Filtrar fila: Avaliar (1)' }));
    expect(onFilterChange).toHaveBeenCalledWith('AVALIAR');
    fireEvent.click(overview.getByRole('button', { name: 'Filtrar fila: Check-ins pendentes (1)' }));
    expect(onFilterChange).toHaveBeenCalledWith('CHECKIN');
    fireEvent.click(overview.getByRole('button', { name: /Filtrar 1 para avaliar/i }));
    expect(onFilterChange).toHaveBeenCalledWith('AVALIAR');
    view.rerender(<FrmsOverview
      queue={[{ item: baseline(), bucket: 'DECISAO' }]}
      checkinPendingCount={1}
      activeFilter="AVALIAR"
      onFilterChange={onFilterChange}
      todayIso="2026-10-14"
    />);
    fireEvent.click(overview.getByRole('button', { name: 'Filtrar fila: Avaliar (1)' }));
    expect(onFilterChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(overview.getByRole('button', { name: 'Limpar filtro' }));
    expect(onFilterChange).toHaveBeenLastCalledWith(null);
  });

  it('mantém confiança baixa diferente de risco e check-in ao filtrar', () => {
    const a = baseline();
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'AVALIAR', '2026-10-14')).toBe(true);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'CONFIANCA', '2026-10-14')).toBe(false);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'JORNADA', '2026-10-14')).toBe(true);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'CHECKIN', '2026-10-14')).toBe(false);
    a.checkin_status = 'PENDENTE';
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'CHECKIN', '2026-10-14')).toBe(true);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'JORNADA', '2026-10-14')).toBe(false);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', 'CONFIANCA', '2026-10-14')).toBe(true);
    expect(matchesFrmsOverviewFilter(a, 'DECISAO', null, '2026-10-14')).toBe(true);
  });

  it('não confunde encerramento normal do dia com evidência realmente pendente ou vencida', () => {
    const a = baseline();
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-14')).toBe(true);
    expect(hasFrmsOtherConfidenceGaps(a, '2026-10-14')).toBe(false);
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-15')).toBe(false);
    expect(hasFrmsOtherConfidenceGaps(a, '2026-10-15')).toBe(true);
    a.fortnight_indicator!.freshness_dado = 'PARCIAL';
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-14')).toBe(false);
    a.fortnight_indicator!.freshness_dado = 'COMPLETO';
    a.sleep_data_source = 'ESTIMADO';
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-14')).toBe(false);
    a.sleep_data_source = 'REAL';
    a.alertas = ['DADO_INCONSISTENTE'];
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-14')).toBe(false);
    a.estado_operacional = 'CRITICO_VIOLACAO';
    expect(isFrmsRoutineDutyClosurePending(a, '2026-10-14')).toBe(false);
  });

  it('não apresenta confiança alta da fonte como ausência de inconsistência atual', () => {
    const item = baseline();
    item.alertas = ['DADO_INCONSISTENTE'];
    const warning = frmsOperationalEvidenceLabel(item, '2026-10-14');
    expect(warning).toMatchObject({ label: 'Dados inconsistentes — conferir', hasWarning: true });
    expect(warning.title).toContain('Confiança da fonte');
    expect(warning.label).not.toContain('alta');

    item.alertas = [];
    item.snapshot_status = 'INCOMPLETO';
    expect(frmsOperationalEvidenceLabel(item, '2026-10-14')).toMatchObject({ hasWarning: true });
    item.snapshot_status = 'ATENCAO';
    expect(frmsOperationalEvidenceLabel(item, '2026-10-14')).toMatchObject({
      label: 'Jornada aguardando fechamento', hasWarning: true,
    });
  });

  it('discrimina check-in histórico de check-in recebido hoje sem inventar limite', () => {
    const a = baseline();
    a.fortnight_indicator!.alertas_quinzena = ['SCORE_QUINZENAL_ATENCAO'];
    expect(frmsAttentionFacts(a)).toContain('Índice da quinzena na faixa de atenção');
    expect(frmsAttentionFacts(a)).toContain('1 dia(s) com check-in pendente na quinzena');
    expect(frmsAttentionFacts(a)).not.toContain('Check-in do dia ainda não recebido');
    a.checkin_status = 'PENDENTE';
    a.alertas = ['CHECKIN_PENDENTE'];
    expect(frmsAttentionFacts(a)).toContain('Check-in do dia ainda não recebido');
  });

  it('renderiza pontos e atenuadores exatos do motor, sem bonificações hipotéticas', () => {
    render(<FrmsScoreExplanation item={baseline()} />);
    const panel = within(screen.getByLabelText('Composição do índice'));
    expect(panel.getByText('55,4')).toBeInTheDocument();
    expect(panel.getByText('+12,0 pt')).toBeInTheDocument();
    expect(panel.getByText('-5,0 pt')).toBeInTheDocument();
    expect(panel.getByText('Dias consecutivos')).toBeInTheDocument();
    expect(panel.getByText('Repouso confirmado')).toBeInTheDocument();
    expect(panel.getByText('Tendência crescente')).toBeInTheDocument();
  });

  it('não transforma fonte parcial em índice zero ou porcentagem de confiança inventada', () => {
    const a = baseline();
    a.fortnight_indicator = {
      ...a.fortnight_indicator!, fonte_periodo: 'ESTIMADO', freshness_dado: 'PARCIAL',
      status_quinzena: 'OK', score_acumulado: 0,
    };
    render(<><FrmsScoreMeter item={a} /><FrmsScoreExplanation item={a} /><FrmsEvidenceActions item={a} todayIso="2026-10-14" /></>);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText(/não estimamos pontos/i)).toBeInTheDocument();
    expect(screen.queryByText('0,0')).not.toBeInTheDocument();
    expect(screen.getByText(/Conferir jornada após a operação/i)).toBeInTheDocument();
    expect(screen.queryByText(/Confiança da decisão: [0-9]+%/)).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildFrmsInlineSummary,
  buildFrmsLink,
  buildFrmsTooltipLabel,
  getFrmsVerboseLabel,
  getFrmsRosterBadge,
} from '../evdFrmsTooltip';

type Signal = Parameters<typeof getFrmsVerboseLabel>[0];

function makeSignal(overrides: Partial<NonNullable<Signal>>): NonNullable<Signal> {
  return {
    status: 'normal',
    statusLabel: 'OK',
    dataSource: 'not_applicable',
    requiresReview: false,
    hasAlert: false,
    ...overrides,
  };
}

describe('getFrmsVerboseLabel', () => {
  it('retorna "Sem dado FRMS" quando sinal é null', () => {
    expect(getFrmsVerboseLabel(null)).toBe('Sem dado FRMS');
  });

  it('retorna "Sem dado FRMS" quando sinal é undefined', () => {
    expect(getFrmsVerboseLabel(undefined)).toBe('Sem dado FRMS');
  });

  it('retorna "Check-in pendente" quando status é not_submitted', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'not_submitted' }))).toBe('Check-in pendente');
  });

  it('retorna "Dado estimado" quando dataSource é default_estimate e status normal', () => {
    expect(getFrmsVerboseLabel(makeSignal({ dataSource: 'default_estimate' }))).toBe('Dado estimado');
  });

  it('retorna "Check-in recebido" quando dataSource é crew_reported e status normal', () => {
    expect(getFrmsVerboseLabel(makeSignal({ dataSource: 'crew_reported' }))).toBe('Check-in recebido');
  });

  it('retorna "Revisar com gestor" quando status é critical', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'critical' }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando status é unfit_for_duty', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'unfit_for_duty' }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando requiresReview é true', () => {
    expect(getFrmsVerboseLabel(makeSignal({ requiresReview: true }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando hasAlert é true', () => {
    expect(getFrmsVerboseLabel(makeSignal({ hasAlert: true }))).toBe('Revisar com gestor');
  });

  it('retorna "Atenção" quando status é attention', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'attention' }))).toBe('Atenção');
  });

  it('retorna "Sem jornada FRMS" quando status é no_duty', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'no_duty' }))).toBe('Sem jornada FRMS');
  });

  it('não interpreta fonte não aplicável como FRMS OK', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'normal', dataSource: 'not_applicable' })))
      .toBe('Sem avaliação FRMS confirmada');
  });

  it('distingue check-in incompleto do recebido', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'incomplete_checkin', dataSource: 'crew_reported' })))
      .toBe('Check-in incompleto');
  });

  it('prioriza status critical sobre dataSource estimado', () => {
    expect(
      getFrmsVerboseLabel(makeSignal({ status: 'critical', dataSource: 'default_estimate' })),
    ).toBe('Revisar com gestor');
  });
});

describe('buildFrmsLink', () => {
  it('gera link canônico com o dia exato aceito pelo painel FRMS', () => {
    const link = buildFrmsLink('2026-05-27');
    expect(link).toBe('/frms?data=2026-05-27');
    expect(link).not.toContain('data_inicio');
    expect(link).not.toContain('data_fim');
  });

  it('inclui funcionario_id quando fornecido como number', () => {
    const link = buildFrmsLink('2026-05-27', 35);
    expect(link).toBe('/frms?data=2026-05-27&funcionario_id=35');
  });

  it('inclui funcionario_id quando fornecido como string numérica', () => {
    const link = buildFrmsLink('2026-05-27', '42');
    expect(link).toBe('/frms?data=2026-05-27&funcionario_id=42');
  });

  it('omite funcionario_id quando null', () => {
    const link = buildFrmsLink('2026-05-27', null);
    expect(link).not.toContain('funcionario_id');
  });

  it('omite funcionario_id quando undefined', () => {
    const link = buildFrmsLink('2026-05-27', undefined);
    expect(link).not.toContain('funcionario_id');
  });

  it('omite funcionario_id quando 0 (ID inválido)', () => {
    const link = buildFrmsLink('2026-05-27', 0);
    expect(link).not.toContain('funcionario_id');
  });

  it('não usa apto_para_voo nem decision automática', () => {
    const link = buildFrmsLink('2026-05-27', 10);
    expect(link).not.toContain('apto');
    expect(link).not.toContain('inapto');
    expect(link).not.toContain('bloqueio');
  });
});

describe('buildFrmsTooltipLabel', () => {
  it('mantém label diário quando não há quinzena', () => {
    expect(buildFrmsTooltipLabel(makeSignal({ status: 'attention' }), null)).toContain('Atenção');
    expect(buildFrmsTooltipLabel(makeSignal({ status: 'attention' }), null)).not.toContain('Quinzena:');
  });

  it('inclui resumo quinzenal quando fortnight_indicator existe', () => {
    const tooltip = buildFrmsTooltipLabel(makeSignal({ status: 'attention' }), {
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
      score_acumulado: 50,
      tendencia: 'CRESCENTE',
      atenuadores_aplicados: [],
      agravantes_aplicados: [{ codigo: 'G1', descricao: 'Sequência longa', impacto_score: 8 }],
      natureza_dado: 'PROJECAO',
      explicacao_operacional: 'Tendência de alta na quinzena.',
      mitigacao_recomendada: 'REVISAR_CHECKIN',
      decisao: 'ALERTA',
      limite_referencia: null,
      alertas_quinzena: [],
      limitation_notes: [],
    });

    expect(tooltip).toContain('Quinzena:');
    expect(tooltip).toContain('Quinzena com atenção');
    expect(tooltip).toContain('Tendência de alta na quinzena.');
  });
});

describe('buildFrmsInlineSummary', () => {
  it('retorna resumo curto com mitigação quando há indicador quinzenal', () => {
    const summary = buildFrmsInlineSummary(makeSignal({ status: 'attention' }), {
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
      score_acumulado: 50,
      tendencia: 'CRESCENTE',
      atenuadores_aplicados: [],
      agravantes_aplicados: [{ codigo: 'G1', descricao: 'Sequência longa', impacto_score: 8 }],
      natureza_dado: 'PROJECAO',
      explicacao_operacional: 'Tendência de alta na quinzena.',
      mitigacao_recomendada: 'REVISAR_CHECKIN',
      decisao: 'ALERTA',
      limite_referencia: null,
      alertas_quinzena: [],
      limitation_notes: [],
    });

    expect(summary).toBe('Quinzena com atenção · Revisar check-in');
  });

  it('não retorna resumo extra para estado ok sem quinzena', () => {
    expect(buildFrmsInlineSummary(makeSignal({ status: 'normal' }), null))
      .toBe('Sem avaliação FRMS confirmada');
  });
});

describe('getFrmsRosterBadge — ausência e recebimento não significam aptidão', () => {
  it('mostra dados estimados sem selo verde', () => {
    expect(getFrmsRosterBadge(makeSignal({ dataSource: 'default_estimate' }))).toEqual({
      short: 'EST', long: 'Dado estimado — não comprova baixa fadiga',
    });
  });
  it('mostra check-in recebido como informativo, não FRMS OK', () => {
    expect(getFrmsRosterBadge(makeSignal({ dataSource: 'crew_reported' }))).toEqual({
      short: 'REC', long: 'Check-in recebido — não é liberação operacional',
    });
  });
  it('recusa aprovar fonte desconhecida ou ausente', () => {
    expect(getFrmsRosterBadge(makeSignal({ dataSource: 'not_applicable' })).short).toBe('?');
    expect(getFrmsRosterBadge(null).long).toBe('Sem referência FRMS');
  });
  it('alertas críticos e check-in incompleto mantêm precedência', () => {
    expect(getFrmsRosterBadge(makeSignal({ status: 'critical', dataSource: 'crew_reported' })).short)
      .toBe('REV');
    expect(getFrmsRosterBadge(makeSignal({ status: 'incomplete_checkin', dataSource: 'crew_reported' })).short)
      .toBe('SC');
  });
});

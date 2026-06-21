import { describe, expect, it } from 'vitest';
import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  FORTNIGHT_NO_DATA_MESSAGE,
  buildFortnightCrewOrientation,
  buildFortnightTooltipSuffix,
  formatFortnightLabel,
  formatFortnightNatureza,
  formatFortnightTendencia,
  formatTopModifiers,
} from '../fortnightOperationalLabels';

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
    status_quinzena: 'OK',
    score_acumulado: 42,
    tendencia: 'ESTAVEL',
    atenuadores_aplicados: [{ codigo: 'A1', descricao: 'Repouso adequado', impacto_score: -5 }],
    agravantes_aplicados: [{ codigo: 'G1', descricao: 'Sequência longa', impacto_score: 8 }],
    natureza_dado: 'JORNADA_REALIZADA',
    explicacao_operacional: 'Acumulado operacional dentro do esperado.',
    mitigacao_recomendada: 'SEM_ACAO',
    decisao: 'INFORMA',
    limite_referencia: null,
    alertas_quinzena: [],
    limitation_notes: [],
    ...overrides,
  };
}

describe('fortnightOperationalLabels', () => {
  it('formata label com score e tendência', () => {
    expect(formatFortnightLabel(buildIndicator())).toContain('Quinzena completa');
    expect(formatFortnightLabel(buildIndicator())).toContain('score 42');
    expect(formatFortnightLabel(buildIndicator())).toContain('estável');
  });

  it('retorna fallback sem indicador', () => {
    expect(formatFortnightLabel(null)).toBe('Quinzena sem indicador');
  });

  it('formata tendências', () => {
    expect(formatFortnightTendencia('CRESCENTE')).toBe('Em alta');
    expect(formatFortnightTendencia('REDUZINDO')).toBe('Em redução');
    expect(formatFortnightTendencia('ESTAVEL')).toBe('Estável');
  });

  it('formata natureza do dado', () => {
    expect(formatFortnightNatureza('PROJECAO')).toBe('Projeção');
    expect(formatFortnightNatureza('CHECKIN_SUBJETIVO')).toBe('Check-in subjetivo');
    expect(formatFortnightNatureza('JORNADA_REALIZADA')).toBe('Jornada realizada');
    expect(formatFortnightNatureza('ACUMULADO_LEGAL')).toBe('Acumulado legal');
  });

  it('lista principais atenuadores e agravantes', () => {
    const indicator = buildIndicator({
      atenuadores_aplicados: [
        { codigo: 'A1', descricao: 'Repouso adequado', impacto_score: -5 },
        { codigo: 'A2', descricao: 'Jornada curta', impacto_score: -3 },
      ],
      agravantes_aplicados: [
        { codigo: 'G1', descricao: 'Check-in pendente', impacto_score: 6 },
      ],
    });

    expect(formatTopModifiers(indicator.atenuadores_aplicados)).toContain('Repouso adequado');
    expect(formatTopModifiers(indicator.agravantes_aplicados)).toContain('Check-in pendente');
  });

  it('monta tooltip quinzenal para EVD', () => {
    const suffix = buildFortnightTooltipSuffix(
      buildIndicator({
        status_quinzena: 'ATENCAO',
        tendencia: 'CRESCENTE',
        explicacao_operacional: 'Sequência de jornadas elevada.',
        mitigacao_recomendada: 'REVISAR_CHECKIN',
      }),
    );

    expect(suffix).toContain('Quinzena com atenção');
    expect(suffix).toContain('score 42');
    expect(suffix).toContain('Sequência de jornadas elevada.');
    expect(suffix).toContain('Revisar check-in');
  });

  it('orientação para tripulante sem indicador', () => {
    expect(buildFortnightCrewOrientation(null)).toContain('Sem indicador quinzenal neste período');
  });

  it('orientação quando check-in pendente', () => {
    expect(buildFortnightCrewOrientation(buildIndicator(), true)).toContain('check-in');
  });
});

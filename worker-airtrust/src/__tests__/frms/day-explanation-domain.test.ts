import { describe, expect, it } from 'vitest';
import {
  buildExplanationFactor,
  buildFrmsDayExplanationTrace,
  buildFrmsRecommendations,
  formatEffectivenessBand,
  formatHoursAndMinutes,
  normalizeFrmsExplanationOrigin,
  normalizeHora,
  parseEffectivenessComponents,
  roundOne,
  sanitizeCopilotoTexto,
  shiftDate,
  toComparisonDay,
  toNumberOrNull,
  type FrmsDayExplanationPayload,
} from '../../lib/frms/day-explanation-domain';

function basePayload(): FrmsDayExplanationPayload {
  return {
    tripulante: { id: '7', nome: 'Tripulante Teste', cargo: 'PIC' },
    jornada: {
      data: '2026-10-02',
      hora_apresentacao: '08:00',
      hora_acordou: '06:00',
      effectiveness_pct: 72,
      effectiveness_nivel: 'AMARELO',
      tempo_abaixo_limiar_min: 30,
      dias_criticos_consecutivos: 1,
      duracao_sono_efetiva_min: 420,
      hora_despertar_estimada: null,
      hora_inicio_sono_estimado: '23:00',
      dia_periodo_embarcado: 3,
      total_dias_periodo: 7,
    },
    diagnostico: {
      faixa: 'amarelo',
      resumo_executivo: 'Resumo.',
      explicacao_tecnica: 'Técnica.',
      explicacao_didatica: 'Didática.',
      fator_principal: 'Horas de voo',
      fatores: [buildExplanationFactor('hv', -0.08)],
      recomendacoes: [],
    },
    copiloto: { texto: 'Texto.', provider: 'deterministic', model: 'test' },
  };
}

describe('FRMS day explanation domain helpers', () => {
  it('normalizes origin, numbers, dates and HH:MM without widening contracts', () => {
    expect(normalizeFrmsExplanationOrigin(' FICHA ')).toBe('ficha');
    expect(normalizeFrmsExplanationOrigin('other')).toBe('desconhecida');
    expect(roundOne(12.345)).toBe(12.3);
    expect(roundOne(null)).toBe(0);
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
    expect(normalizeHora('07:30')).toBe('07:30');
    expect(normalizeHora('7:30')).toBeNull();
    expect(toNumberOrNull('42.5')).toBe(42.5);
    expect(toNumberOrNull('x')).toBeNull();
  });

  it('keeps only finite effectiveness components', () => {
    expect(parseEffectivenessComponents('{"hv":-0.12,"repouso":0.03,"bad":"x"}')).toEqual({
      hv: -0.12,
      repouso: 0.03,
    });
    expect(parseEffectivenessComponents('{invalid')).toEqual({});
  });

  it('sanitizes AI text and falls back on truncated output', () => {
    const fallback = 'Fallback seguro.';
    expect(
      sanitizeCopilotoTexto(
        'Resumo executivo: Primeiro ponto.\n- Recomendação operacional: Segundo ponto.',
        fallback,
      ),
    ).toBe('Primeiro ponto.\n\nSegundo ponto.');
    expect(sanitizeCopilotoTexto('texto truncado sem pontuação final', fallback)).toBe(fallback);
  });

  it('preserves configured effectiveness bands and time formatting', () => {
    const limites = {
      EFFECTIV_VERDE_MIN: 90,
      EFFECTIV_AMARELO_MAX: 77,
      EFFECTIV_VERMELHO_MAX: 65,
    };
    expect(formatEffectivenessBand(92, limites)).toBe('verde');
    expect(formatEffectivenessBand(60, limites)).toBe('vermelho');
    expect(formatEffectivenessBand(75, limites)).toBe('amarelo');
    expect(formatEffectivenessBand(82, limites)).toBe('transição');
    expect(formatHoursAndMinutes(125)).toBe('2h05');
  });

  it('preserves factor semantics, including basal context as non-pp impact', () => {
    const hv = buildExplanationFactor('hv', -0.08);
    expect(hv).toMatchObject({ impacto_pct: -8, impacto_abs_pct: 8, direcao: 'penaliza' });
    const basal = buildExplanationFactor('basica', 0.82);
    expect(basal).toMatchObject({ impacto_pct: 0, impacto_abs_pct: 0, direcao: 'neutro' });
    expect(basal.resumo).toContain('0.82');
  });

  it('keeps critical recommendations advisory rather than automatic decisions', () => {
    const result = buildFrmsRecommendations(
      {
        tempo_abaixo_limiar_min: 120,
        duracao_sono_efetiva_min: 300,
        dia_periodo_embarcado: 4,
        total_dias_periodo: 7,
        hv_component: -0.1,
        processo_c_component: -0.06,
      },
      'vermelho',
    );
    expect(result.map((item) => item.codigo)).toEqual([
      'replanejar-dia-critico',
      'proteger-sono',
      'mitigar-circadiano',
      'descomprimir-acumulo-hv',
    ]);
    expect(result[0]?.descricao).toContain('conferir');
  });

  it('preserves comparison serialization and explanation trace calculations', () => {
    const payload = basePayload();
    expect(toComparisonDay(payload)).toMatchObject({
      data: '2026-10-02',
      effectiveness_pct: 72,
      nivel: 'AMARELO',
    });

    const deterministic = { ...payload, copiloto: undefined } as unknown as Omit<
      FrmsDayExplanationPayload,
      'copiloto'
    >;
    const trace = buildFrmsDayExplanationTrace(
      { processado_com_bug: 0, fonte_sono: 'INFORMADO' },
      deterministic,
      { duracao: -0.05, hv: -0.08 },
      payload.diagnostico.fatores[0],
      {
        dataSource: 'crew_reported',
        confidence: 'reported',
        wakeTimeSource: 'checkin',
        recalculationPending: false,
        limitations: [],
        windows: {
          sevenDays: { available: true, worstDay: '2026-09-30', worstEffectivenessPct: 68 },
          twentyEightDays: { available: false, worstDay: null, worstEffectivenessPct: null },
        },
      },
    );
    expect(trace.dataQuality.sourceSummary).toBe('informed');
    expect(trace.duty.minutesAwakeBeforeReport).toBe(120);
    expect(trace.calculation.readinessPct).toBe(67);
    expect(trace.sourceFlags.c2Corrected).toBe(true);
    expect(trace.windows.sevenDays.worstDay).toBe('2026-09-30');
  });
});

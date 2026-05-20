/**
 * T-PERIODO — calcEffectiveness · Período Embarcado (migration 0268)
 *
 * Valida a degradação progressiva de efectividade ao longo do período embarcado:
 *   - dia 1 de N → fatorProgressivo = 0 (sem penalização)
 *   - dia N de N → fatorProgressivo = -FRMS_EMBARQUE_PROGRESSO_MAX/100 (máximo)
 *   - total_dias_periodo < 2 → sem progressão
 */
import { describe, it, expect } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const L = LIMITES_DEFAULT; // FRMS_EMBARQUE_PROGRESSO_MAX = 8

type FatorizacaoResult = ReturnType<typeof calcFatorizacao>;

function makeFat(total: number, overrides: Partial<FatorizacaoResult> = {}): FatorizacaoResult {
  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct: 0,
    fator_duracao_pct: 0,
    fator_repouso_pct: 0,
    fator_noturno_dep_pct: 0,
    fator_noturno_arr_pct: 0,
    fator_ciclo_embarcado_pct: 0,
    fator_base_away_pct: 0,
    fator_aclimatacao_pct: 0,
    total_fatorizado_jornada: total,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
    ...overrides,
  };
}

describe('calcEffectiveness — período embarcado (fatorProgressivo)', () => {
  it('dia 1 de 14 ≈ sem penalização adicional (fatorProgressivo = 0)', () => {
    const semPeriodo = calcEffectiveness(makeFat(0), L);
    const comPeriodoDia1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 14,
    });
    // No dia 1 a fração é 0, portanto sem diferença no effectiveness
    expect(comPeriodoDia1.effectiveness_pct).toBe(semPeriodo.effectiveness_pct);
    expect(comPeriodoDia1.dia_periodo_embarcado).toBe(1);
    expect(comPeriodoDia1.total_dias_periodo).toBe(14);
  });

  it('dia final (14 de 14) tem effectiveness MENOR que o dia 1 em ≥7 pp', () => {
    const dia1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 14,
    });
    const dia14 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 14,
      total_dias_periodo: 14,
    });
    // FRMS_EMBARQUE_PROGRESSO_MAX = 8 → fatorProgressivo = -0.08 no último dia
    // effectiveness_pct_dia14 = 100 + (-0.08) * 100 = 92 → diff = 8 pp
    const diff = dia1.effectiveness_pct - dia14.effectiveness_pct;
    expect(diff).toBeGreaterThanOrEqual(7);
    expect(dia14.dia_periodo_embarcado).toBe(14);
    expect(dia14.total_dias_periodo).toBe(14);
  });

  it('quando total_dias_periodo < 2, não aplica progressão (effectiveness igual ao baseline)', () => {
    const baseline = calcEffectiveness(makeFat(0), L);
    const comTotal1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 1,
    });
    expect(comTotal1.effectiveness_pct).toBe(baseline.effectiveness_pct);
  });
});

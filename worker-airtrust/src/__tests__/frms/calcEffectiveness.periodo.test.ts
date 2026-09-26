/**
 * T-PERIODO — calcEffectiveness · Período Embarcado
 *
 * O desgaste do período embarcado possui uma única fonte numérica:
 * fator_ciclo_embarcado_pct, já calculado pela política governada. Dia/total
 * continuam rastreáveis, mas não podem criar uma segunda penalização dentro
 * de calcEffectiveness.
 */
import { describe, it, expect } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const L = LIMITES_DEFAULT;

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

describe('calcEffectiveness — período embarcado sem dupla penalização', () => {
  it('dia/total sem fator de ciclo não altera effectiveness', () => {
    const baseline = calcEffectiveness(makeFat(0), L);
    const ultimoDia = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 14,
      total_dias_periodo: 14,
    });

    expect(ultimoDia.effectiveness_pct).toBe(baseline.effectiveness_pct);
    expect(ultimoDia.dia_periodo_embarcado).toBe(14);
    expect(ultimoDia.total_dias_periodo).toBe(14);
  });

  it('aplica exatamente o fator de ciclo já calculado, sem somar FRMS_EMBARQUE_PROGRESSO_MAX', () => {
    const ciclo = calcEffectiveness(
      makeFat(-0.12, { fator_ciclo_embarcado_pct: -0.12 }),
      L,
      {
        dia_periodo_embarcado: 14,
        total_dias_periodo: 14,
      },
    );

    expect(ciclo.componentes.processo_s).toBe(-0.12);
    expect(ciclo.effectiveness_pct).toBe(88);
  });

  it('metadados de período não alteram resultado quando total < 2', () => {
    const baseline = calcEffectiveness(makeFat(0), L);
    const comTotal1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 1,
    });
    expect(comTotal1.effectiveness_pct).toBe(baseline.effectiveness_pct);
  });
});

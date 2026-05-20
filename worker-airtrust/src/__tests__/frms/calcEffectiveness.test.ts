/**
 * T1 — calcEffectiveness unit tests
 *
 * Cobre todos os cenários de boundary:
 *   - Conversão total_fatorizado → effectiveness_pct
 *   - Classificação de nível (verde / atencao / amarelo / vermelho)
 *   - Cap em 0% e 100%
 *   - Cálculo de tempo_abaixo_limiar
 *   - Decomposição de componentes
 *   - Testes com limites customizados
 *   - Anti-regressão: nivel nunca undefined
 */
import { describe, it, expect } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { EffectivenessResult } from '../../lib/frms/types';

const L = LIMITES_DEFAULT;

// ─── Helper: constrói uma FatorizacaoResult via ReturnType ──────────

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

// ─── Conversão delta → effectiveness_pct ────────────────────────────

describe('calcEffectiveness — conversão total → effectiveness_pct', () => {
  it('total=0 → effectiveness=100%', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.effectiveness_pct).toBe(100);
  });

  it('total=+0.05 → capped 100%', () => {
    // raw = 100 + 0.05*100 = 105 → capped a 100
    const r = calcEffectiveness(makeFat(0.05), L);
    expect(r.effectiveness_pct).toBe(100);
  });

  it('total=-0.10 → effectiveness=90% (boundary verde_min)', () => {
    // raw = 100 + (-0.10)*100 = 90
    const r = calcEffectiveness(makeFat(-0.1), L);
    expect(r.effectiveness_pct).toBe(90);
  });

  it('total=-0.11 → effectiveness=89% (abaixo verde)', () => {
    const r = calcEffectiveness(makeFat(-0.11), L);
    expect(r.effectiveness_pct).toBe(89);
  });

  it('total=-0.23 → effectiveness=77% (boundary amarelo_max)', () => {
    const r = calcEffectiveness(makeFat(-0.23), L);
    expect(r.effectiveness_pct).toBe(77);
  });

  it('total=-0.35 → effectiveness=65% (boundary vermelho_max)', () => {
    const r = calcEffectiveness(makeFat(-0.35), L);
    expect(r.effectiveness_pct).toBe(65);
  });

  it('total=-1.00 → capped 0%', () => {
    // raw = 100 + (-1.00)*100 = 0
    const r = calcEffectiveness(makeFat(-1.0), L);
    expect(r.effectiveness_pct).toBe(0);
  });

  it('total=-2.00 → capped 0% (abaixo de zero)', () => {
    const r = calcEffectiveness(makeFat(-2.0), L);
    expect(r.effectiveness_pct).toBe(0);
  });
});

// ─── Classificação de nível ─────────────────────────────────────────

describe('calcEffectiveness — classificação de nível', () => {
  // LIMITES_DEFAULT: VERDE=90, AMARELO=77, VERMELHO=65

  it('100% → verde', () => {
    expect(calcEffectiveness(makeFat(0), L).nivel).toBe('verde');
  });

  it('90% → verde (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.1), L).nivel).toBe('verde');
  });

  it('89% → atencao (logo abaixo de verde)', () => {
    expect(calcEffectiveness(makeFat(-0.11), L).nivel).toBe('atencao');
  });

  it('78% → atencao (logo acima de amarelo)', () => {
    // raw = 100 + (-0.22)*100 = 78
    expect(calcEffectiveness(makeFat(-0.22), L).nivel).toBe('atencao');
  });

  it('77% → amarelo (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.23), L).nivel).toBe('amarelo');
  });

  it('66% → amarelo (logo acima de vermelho)', () => {
    // raw = 100 + (-0.34)*100 = 66
    expect(calcEffectiveness(makeFat(-0.34), L).nivel).toBe('amarelo');
  });

  it('65% → vermelho (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.35), L).nivel).toBe('vermelho');
  });

  it('0% → vermelho', () => {
    expect(calcEffectiveness(makeFat(-1.0), L).nivel).toBe('vermelho');
  });
});

// ─── Tempo abaixo do limiar ─────────────────────────────────────────

describe('calcEffectiveness — tempo_abaixo_limiar', () => {
  it('sem fatores de risco → 0 min', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(0);
  });

  it('apenas noturno_dep → +45', () => {
    const r = calcEffectiveness(makeFat(0, { fator_noturno_dep_pct: -5 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(45);
  });

  it('apenas noturno_arr → +30', () => {
    const r = calcEffectiveness(makeFat(0, { fator_noturno_arr_pct: -5 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(30);
  });

  it('repouso negativo → +30', () => {
    const r = calcEffectiveness(makeFat(0, { fator_repouso_pct: -3 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(30);
  });

  it('todos os fatores de risco → 105 min', () => {
    const r = calcEffectiveness(
      makeFat(-0.3, {
        fator_noturno_dep_pct: -5,
        fator_noturno_arr_pct: -5,
        fator_repouso_pct: -3,
      }),
      L,
    );
    expect(r.tempo_abaixo_limiar_pct).toBe(105);
  });
});

// ─── Componentes de fadiga ──────────────────────────────────────────

describe('calcEffectiveness — componentes', () => {
  it('processo_s = fator_ciclo_embarcado_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_ciclo_embarcado_pct: 1.5 }), L);
    expect(r.componentes.processo_s).toBe(1.5);
  });

  it('processo_c = apresentacao + noturno_dep + noturno_arr', () => {
    const r = calcEffectiveness(
      makeFat(0, {
        fator_apresentacao_pct: 2,
        fator_noturno_dep_pct: 3,
        fator_noturno_arr_pct: 1,
      }),
      L,
    );
    expect(r.componentes.processo_c).toBe(6);
  });

  it('repouso = fator_repouso_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_repouso_pct: -4 }), L);
    expect(r.componentes.repouso).toBe(-4);
  });

  it('hv = fator_hv_quantidade_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_hv_quantidade_pct: 2 }), L);
    expect(r.componentes.hv).toBe(2);
  });

  it('duracao = fator_duracao_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_basica_pct: 5, fator_duracao_pct: -0.1 }), L);
    expect(r.componentes.duracao).toBe(-0.1);
  });
});

// ─── Limites customizados ───────────────────────────────────────────

describe('calcEffectiveness — limites customizados', () => {
  const customL = {
    ...L,
    EFFECTIV_VERDE_MIN: 95,
    EFFECTIV_AMARELO_MAX: 80,
    EFFECTIV_VERMELHO_MAX: 60,
  };

  it('90% → atencao com VERDE=95 (seria verde no default)', () => {
    // total=-0.10 → 90%
    const r = calcEffectiveness(makeFat(-0.1), customL);
    expect(r.effectiveness_pct).toBe(90);
    expect(r.nivel).toBe('atencao'); // 80 < 90 < 95
  });

  it('80% → amarelo com AMARELO=80 (boundary)', () => {
    // total=-0.20 → 80%
    const r = calcEffectiveness(makeFat(-0.2), customL);
    expect(r.effectiveness_pct).toBe(80);
    expect(r.nivel).toBe('amarelo');
  });

  it('60% → vermelho com VERMELHO=60 (boundary)', () => {
    // total=-0.40 → 60%
    const r = calcEffectiveness(makeFat(-0.4), customL);
    expect(r.effectiveness_pct).toBe(60);
    expect(r.nivel).toBe('vermelho');
  });
});

// ─── Anti-regressão: nivel nunca undefined ──────────────────────────

describe('calcEffectiveness — anti-regressão nivel', () => {
  const totais = [-2, -1, -0.99, -0.5, -0.35, -0.23, -0.1, -0.01, 0, 0.01, 0.5, 1, 2];

  it.each(totais)('total=%s → nivel sempre definido (verde|atencao|amarelo|vermelho)', (total) => {
    const r = calcEffectiveness(makeFat(total), L);
    expect(['verde', 'atencao', 'amarelo', 'vermelho']).toContain(r.nivel);
  });

  it('effectiveness_pct sempre [0, 100]', () => {
    for (const total of totais) {
      const r = calcEffectiveness(makeFat(total), L);
      expect(r.effectiveness_pct).toBeGreaterThanOrEqual(0);
      expect(r.effectiveness_pct).toBeLessThanOrEqual(100);
    }
  });

  it('fatorizacao_delta = total_fatorizado_jornada', () => {
    const r = calcEffectiveness(makeFat(-0.25), L);
    expect(r.fatorizacao_delta).toBe(-0.25);
  });
});

// ─── Offshore Sleep Model (3rd param: jornada) ─────────────────────

describe('calcEffectiveness — offshore sleep model', () => {
  it('sem jornada → duracao_sono_efetiva_min = null', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.duracao_sono_efetiva_min).toBeNull();
    expect(r.hora_despertar).toBeNull();
    expect(r.hora_inicio_sono).toBeNull();
  });

  it('com jornada e horaDormiu informada → calcula sono efetivo', () => {
    // apresentação 08:00 (480) -> acordou 06:30 (390)
    // dormiu 23:00 (1380) no dia anterior -> sono efetivo 450 min
    const r = calcEffectiveness(makeFat(-0.1, { fator_repouso_pct: -0.05 }), L, {
      hora_apresentacao: '08:00',
      hora_dormiu: '23:00',
    });
    expect(r.duracao_sono_efetiva_min).toBe(450);
    expect(r.hora_despertar).toBe('06:30');
    expect(r.hora_inicio_sono).toBe('23:00');
    expect(r.fonte_sono).toBe('INFORMADO');
  });

  it('sem horaDormiu informada → usa padrão de 8h', () => {
    const r = calcEffectiveness(makeFat(-0.1), L, {
      hora_apresentacao: '08:00',
    });
    expect(r.duracao_sono_efetiva_min).toBe(480);
    expect(r.fonte_sono).toBe('PADRAO');
  });

  it('acordou na WOCL marca flag', () => {
    const r = calcEffectiveness(makeFat(-0.1, { fator_repouso_pct: -0.05 }), L, {
      hora_apresentacao: '03:30',
    });
    expect(r.acordou_na_wocl).toBe(true);
  });

  it('effectiveness stays in [0, 100] with sleep model', () => {
    const r = calcEffectiveness(makeFat(-0.5), L, {
      hora_apresentacao: '06:00',
      hora_dormiu: '05:30',
    });
    expect(r.effectiveness_pct).toBeGreaterThanOrEqual(0);
    expect(r.effectiveness_pct).toBeLessThanOrEqual(100);
  });
});

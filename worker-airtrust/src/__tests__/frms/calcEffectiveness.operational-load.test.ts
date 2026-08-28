/**
 * Operational Load V1 integration into calcEffectiveness.
 *
 * The load delta is expressed in points and enters the effectiveness sum as a
 * signed fraction (−3 pts = −0.03). Absent operational load must leave the
 * result byte-identical to the historical contract.
 */
import { describe, expect, it } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { computeOperationalLoadV1 } from '../../lib/frms/operational-load';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const L = LIMITES_DEFAULT;

type FatorizacaoResult = ReturnType<typeof calcFatorizacao>;

function makeFat(overrides: Partial<FatorizacaoResult> = {}): FatorizacaoResult {
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
    total_fatorizado_jornada: 0,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
    ...overrides,
  };
}

const jornada = {
  hora_apresentacao: '08:00',
  hora_primeira_decolagem: '09:00',
  hora_ultimo_pouso: '15:00',
  hora_corte_motor: '15:10',
  hora_termino: '16:00',
  hora_dormiu: '23:00',
  hora_acordou: '06:30',
  dia_periodo_embarcado: null,
  total_dias_periodo: null,
};

describe('calcEffectiveness — Operational Load V1', () => {
  it('is byte-identical when no operational load is supplied', () => {
    const withoutArg = calcEffectiveness(makeFat(), L, jornada);
    const withNull = calcEffectiveness(makeFat(), L, jornada, null);
    expect(withNull).toEqual(withoutArg);
    expect(withoutArg.componentes.carga_operacional).toBe(0);
    expect(withoutArg.operational_load).toBeNull();
  });

  it('subtracts the operational-load points from effectiveness (−3 pts → −3.0)', () => {
    const baseline = calcEffectiveness(makeFat(), L, jornada);
    const load = computeOperationalLoadV1({ landingsCount: 4, temperatureMaxC: 32 });
    const loaded = calcEffectiveness(makeFat(), L, jornada, load);

    expect(load.operational_load_total_delta).toBe(-3);
    expect(loaded.componentes.carga_operacional).toBe(-0.03);
    expect(loaded.effectiveness_pct).toBeCloseTo(baseline.effectiveness_pct - 3, 5);
    expect(loaded.operational_load).toMatchObject({
      policy_version: 'operational-policy-v1',
      landings_count: 4,
      temperature_max_c: 32,
      total_delta: -3,
      weather_evidence_quality: 'OBSERVED',
    });
  });

  it('carries an INCOMPLETE weather quality through without inventing temperature', () => {
    const load = computeOperationalLoadV1({ landingsCount: 6, temperatureMaxC: null });
    const loaded = calcEffectiveness(makeFat(), L, jornada, load);
    expect(loaded.operational_load?.data_quality).toBe('INCOMPLETE');
    expect(loaded.operational_load?.temperature_max_c).toBeNull();
    expect(loaded.componentes.carga_operacional).toBe(-0.04);
  });

  it('carries SIGVOOS_UNAVAILABLE through the effectiveness breakdown without inventing landings', () => {
    const load = computeOperationalLoadV1({
      landingsCount: 0,
      landingsEvidenceQuality: 'INCOMPLETE',
      temperatureMaxC: 32,
    });
    const loaded = calcEffectiveness(makeFat(), L, jornada, load);

    expect(load.data_quality).toBe('SIGVOOS_UNAVAILABLE');
    expect(load.operational_load_landings_delta).toBe(0);
    expect(loaded.operational_load?.data_quality).toBe('SIGVOOS_UNAVAILABLE');
    expect(loaded.operational_load?.landings_count).toBe(0);
    expect(loaded.operational_load?.temperature_delta).toBe(-1);
  });

  it('respects the −6 point floor end to end', () => {
    const baseline = calcEffectiveness(makeFat(), L, jornada);
    const load = computeOperationalLoadV1({ landingsCount: 12, temperatureMaxC: 40 });
    const loaded = calcEffectiveness(makeFat(), L, jornada, load);
    expect(loaded.componentes.carga_operacional).toBe(-0.06);
    expect(loaded.effectiveness_pct).toBeCloseTo(baseline.effectiveness_pct - 6, 5);
  });

  it('applies through the legacy (fatorização-only) path too', () => {
    const load = computeOperationalLoadV1({ landingsCount: 5, temperatureMaxC: 34 });
    expect(load.operational_load_total_delta).toBe(-4.5);
    const legacyBaseline = calcEffectiveness(makeFat({ total_fatorizado_jornada: 0 }), L);
    const legacyLoaded = calcEffectiveness(makeFat({ total_fatorizado_jornada: 0 }), L, undefined, load);
    expect(legacyLoaded.effectiveness_pct).toBeCloseTo(legacyBaseline.effectiveness_pct - 4.5, 5);
    expect(legacyLoaded.componentes.carga_operacional).toBe(-0.045);
  });
});

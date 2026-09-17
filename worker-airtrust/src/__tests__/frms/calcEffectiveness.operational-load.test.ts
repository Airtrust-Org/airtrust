import { describe, expect, it } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { computeOperationalLoadV2 } from '../../lib/frms/operational-load';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import { V2_POLICY, V2_POLICY_VERSION } from './policy-v2-fixture';

const L = LIMITES_DEFAULT;
type FatorizacaoResult = ReturnType<typeof calcFatorizacao>;
function makeFat(overrides: Partial<FatorizacaoResult> = {}): FatorizacaoResult {
  return {
    fator_basica_pct:0,fator_apresentacao_pct:0,fator_duracao_pct:0,fator_repouso_pct:0,
    fator_noturno_dep_pct:0,fator_noturno_arr_pct:0,fator_ciclo_embarcado_pct:0,
    fator_base_away_pct:0,fator_aclimatacao_pct:0,total_fatorizado_jornada:0,
    fator_hv_basica_pct:0,fator_hv_quantidade_pct:0,fator_hv_noturno_dep_pct:0,
    fator_hv_noturno_arr_pct:0,total_fatorizado_hv:0,...overrides,
  };
}
const jornada = {
  hora_apresentacao:'08:00',hora_primeira_decolagem:'09:00',hora_ultimo_pouso:'15:00',
  hora_corte_motor:'15:10',hora_termino:'16:00',hora_dormiu:'23:00',hora_acordou:'06:30',
  dia_periodo_embarcado:null,total_dias_periodo:null,
};
function load(landingsCount:number, temperatureMaxC:number|null, imcLegs: Array<{legId:string; departureRawMetar?:string; arrivalRawMetar?:string}> = []) {
  return computeOperationalLoadV2({landingsCount,temperatureMaxC,imcLegs,policy:V2_POLICY,policyVersion:V2_POLICY_VERSION});
}

describe('calcEffectiveness — FRMS Operational Policy V2', () => {
  it('remains byte-identical when no operational load is supplied', () => {
    expect(calcEffectiveness(makeFat(), L, jornada, null)).toEqual(calcEffectiveness(makeFat(), L, jornada));
  });

  it('integrates landings and temperature as independent contributions', () => {
    const baseline = calcEffectiveness(makeFat(), L, jornada);
    const loaded = calcEffectiveness(makeFat(), L, jornada, load(10, 32));
    expect(loaded.componentes.pousos).toBe(-0.01);
    expect(loaded.componentes.temperatura).toBe(-0.01);
    expect(loaded.componentes.imc).toBe(0);
    expect(loaded.effectiveness_pct).toBeCloseTo(baseline.effectiveness_pct - 2, 5);
  });

  it('integrates IMC separately without a shared offshore cap', () => {
    const baseline = calcEffectiveness(makeFat(), L, jornada);
    const imc = 'METAR SBME 171200Z 09010KT 3000 RA BKN008 24/22 Q1012=';
    const op = load(20, 40, Array.from({length:4},(_,i)=>({legId:String(i),departureRawMetar:imc,arrivalRawMetar:imc})));
    expect(op.operational_load_landings_delta).toBe(-4);
    expect(op.operational_load_temperature_delta).toBe(-2);
    expect(op.operational_load_imc_delta).toBe(-3);
    const loaded = calcEffectiveness(makeFat(), L, jornada, op);
    expect(loaded.effectiveness_pct).toBeCloseTo(baseline.effectiveness_pct - 9, 5);
    expect(loaded.componentes.carga_operacional).toBe(-0.09);
  });

  it('carries incomplete evidence without inventing a meteorological penalty', () => {
    const loaded = calcEffectiveness(makeFat(), L, jornada, load(10, null));
    expect(loaded.operational_load?.weather_evidence_quality).toBe('INCOMPLETE');
    expect(loaded.operational_load?.imc_evidence_quality).toBe('INCOMPLETE');
    expect(loaded.componentes.temperatura).toBe(0);
    expect(loaded.componentes.imc).toBe(0);
  });
});

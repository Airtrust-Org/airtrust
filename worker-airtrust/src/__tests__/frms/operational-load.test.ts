import { describe, expect, it } from 'vitest';
import { computeOperationalLoadV2, describeOperationalLoadV2 } from '../../lib/frms/operational-load';
import { V2_POLICY, V2_POLICY_VERSION } from './policy-v2-fixture';

function compute(input: { landingsCount: number; temperatureMaxC: number | null; landingsEvidenceQuality?: 'OBSERVED'|'CONFIRMED_ZERO'|'INCOMPLETE'; imcLegs?: Array<{legId:string; departureRawMetar?:string|null; arrivalRawMetar?:string|null}> }) {
  return computeOperationalLoadV2({ ...input, policy: V2_POLICY, policyVersion: V2_POLICY_VERSION });
}

describe('Operational Load V2 — independent governed dimensions', () => {
  it.each([[8,0],[9,-.5],[10,-1],[12,-2],[16,-4],[20,-4]])('%i landings => %f', (landings, expected) => {
    expect(compute({ landingsCount: landings, temperatureMaxC: 25 }).operational_load_landings_delta).toBe(expected);
  });

  it.each([[29.9,0],[30,-.5],[32,-1],[34,-1.5],[36,-2],[41,-2]])('%f C => %f', (temp, expected) => {
    expect(compute({ landingsCount: 8, temperatureMaxC: temp }).operational_load_temperature_delta).toBe(expected);
  });

  it('does not use a combined landings+temperature cap', () => {
    const result = compute({ landingsCount: 20, temperatureMaxC: 40 });
    expect(result.operational_load_landings_delta).toBe(-4);
    expect(result.operational_load_temperature_delta).toBe(-2);
    expect(result.operational_load_total_delta).toBe(-6);
  });

  it('adds IMC independently with per-leg/day caps', () => {
    const imc = 'METAR SBME 171200Z 09010KT 3000 RA BKN008 24/22 Q1012=';
    const result = compute({ landingsCount: 8, temperatureMaxC: 29, imcLegs: Array.from({length:4}, (_,i)=>({legId:`L${i}`, departureRawMetar:imc, arrivalRawMetar:imc})) });
    expect(result.operational_load_imc_delta).toBe(-3);
    expect(result.imc_evidence_quality).toBe('OBSERVED');
    expect(result.operational_load_total_delta).toBe(-3);
  });

  it('keeps weather missing explicitly incomplete and never invents VMC/temperature', () => {
    const result = compute({ landingsCount: 10, temperatureMaxC: null });
    expect(result.temperature_max_c).toBeNull();
    expect(result.operational_load_temperature_delta).toBe(0);
    expect(result.weather_evidence_quality).toBe('INCOMPLETE');
    expect(result.imc_evidence_quality).toBe('INCOMPLETE');
  });

  it('marks confirmed no-flight as not applicable', () => {
    const result = compute({ landingsCount: 0, landingsEvidenceQuality: 'CONFIRMED_ZERO', temperatureMaxC: 40 });
    expect(result.weather_evidence_quality).toBe('NOT_APPLICABLE');
    expect(result.imc_evidence_quality).toBe('NOT_APPLICABLE');
    expect(result.operational_load_total_delta).toBe(0);
  });

  it('explains each factor separately', () => {
    const result = compute({ landingsCount: 10, temperatureMaxC: 32 });
    const described = describeOperationalLoadV2(result);
    expect(described.title).toBe('Fatores offshore independentes');
    expect(described.lines.join(' ')).toMatch(/Pousos:/);
    expect(described.lines.join(' ')).toMatch(/Temperatura:/);
  });
});

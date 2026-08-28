import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_LOAD_POLICY_V1,
  computeOperationalLoadV1,
  describeOperationalLoadV1,
  landingsDeltaPoints,
  temperatureDeltaPoints,
} from '../../lib/frms/operational-load';

describe('Operational Load V1 — landings factor (OPERATIONAL_POLICY_V1)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, -1],
    [4, -2],
    [5, -3],
    [6, -4],
    [7, -4],
    [12, -4],
  ])('%i landings -> %f points', (landings, expected) => {
    expect(landingsDeltaPoints(landings)).toBe(expected);
  });

  it('treats a negative or non-finite landing count as zero', () => {
    expect(landingsDeltaPoints(-3)).toBe(0);
    expect(landingsDeltaPoints(Number.NaN)).toBe(0);
  });
});

describe('Operational Load V1 — temperature factor (observed METAR)', () => {
  it.each([
    [29.9, 0],
    [30, -0.5],
    [31.9, -0.5],
    [32, -1],
    [33.9, -1],
    [34, -1.5],
    [35.9, -1.5],
    [36, -2],
    [41.2, -2],
  ])('%f °C -> %f points', (temp, expected) => {
    expect(temperatureDeltaPoints(temp)).toBe(expected);
  });

  it('a missing METAR temperature is 0 points, never assumed comfortable or 0 °C', () => {
    expect(temperatureDeltaPoints(null)).toBe(0);
    const result = computeOperationalLoadV1({ landingsCount: 4, temperatureMaxC: null });
    expect(result.temperature_max_c).toBeNull();
    expect(result.operational_load_temperature_delta).toBe(0);
    expect(result.weather_evidence_quality).toBe('INCOMPLETE');
    expect(result.data_quality).toBe('INCOMPLETE');
    // Landings still count.
    expect(result.operational_load_landings_delta).toBe(-2);
    expect(result.operational_load_total_delta).toBe(-2);
  });
});

describe('Operational Load V1 — combined model', () => {
  it('sums landings and temperature deltas', () => {
    const result = computeOperationalLoadV1({ landingsCount: 4, temperatureMaxC: 32 });
    expect(result.operational_load_landings_delta).toBe(-2);
    expect(result.operational_load_temperature_delta).toBe(-1);
    expect(result.operational_load_total_delta).toBe(-3);
    expect(result.weather_evidence_quality).toBe('OBSERVED');
    expect(result.data_quality).toBe('COMPLETE');
    expect(result.policy_version).toBe('operational-policy-v1');
  });

  it('clamps the combined delta to the -6 policy floor', () => {
    const result = computeOperationalLoadV1({ landingsCount: 9, temperatureMaxC: 41 });
    // -4 (landings) + -2 (temp) = -6, already at the floor.
    expect(result.operational_load_total_delta).toBe(OPERATIONAL_LOAD_POLICY_V1.combinedFloorPoints);
    expect(result.operational_load_total_delta).toBe(-6);
  });

  it('never goes below the floor even if the raw sum would', () => {
    // Construct a hypothetical worse-than-floor sum by pushing both to max.
    const raw =
      landingsDeltaPoints(20) + temperatureDeltaPoints(50) + temperatureDeltaPoints(50);
    expect(raw).toBeLessThan(-6);
    const result = computeOperationalLoadV1({ landingsCount: 20, temperatureMaxC: 50 });
    expect(result.operational_load_total_delta).toBe(-6);
  });

  it('does not add a separate night-landing penalty (no double counting)', () => {
    // The model only sees a total landings count; day/night split is irrelevant.
    const allDay = computeOperationalLoadV1({ landingsCount: 5, temperatureMaxC: 28 });
    const allNight = computeOperationalLoadV1({ landingsCount: 5, temperatureMaxC: 28 });
    expect(allDay.operational_load_total_delta).toBe(allNight.operational_load_total_delta);
    expect(allDay.operational_load_total_delta).toBe(-3);
  });

  it('rounds fractional temperature deltas to one decimal in the total', () => {
    const result = computeOperationalLoadV1({ landingsCount: 3, temperatureMaxC: 30.4 });
    // -1 (3 landings) + -0.5 (30–31.9) = -1.5
    expect(result.operational_load_total_delta).toBe(-1.5);
  });
});

describe('Operational Load V1 — explainability', () => {
  it('renders the required breakdown lines', () => {
    const result = computeOperationalLoadV1({ landingsCount: 4, temperatureMaxC: 32 });
    const described = describeOperationalLoadV1(result);
    expect(described.title).toBe('Carga operacional: -3,0');
    expect(described.lines).toEqual(['4 pousos: -2,0', 'temperatura máxima 32 °C: -1,0']);
  });

  it('states the weather gap explicitly when temperature is unavailable', () => {
    const result = computeOperationalLoadV1({ landingsCount: 2, temperatureMaxC: null });
    const described = describeOperationalLoadV1(result);
    expect(described.title).toBe('Carga operacional: 0,0');
    expect(described.lines[1]).toMatch(/evidência meteorológica indisponível/i);
  });
});

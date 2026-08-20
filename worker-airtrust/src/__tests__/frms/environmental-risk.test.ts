import { describe, expect, it } from 'vitest';
import { assessEnvironmentalRisk, calculateHeatIndexC, calculateWindChillC } from '../../lib/frms/environmental-risk';
import type { WeatherObservationEvidence } from '../../lib/frms/redemet-weather';

function metar(temp: number, rh: number, windKt = 5): WeatherObservationEvidence {
  return {
    source: 'DECEA_REDEMET', sourceKind: 'MEASURED', stationIcao: 'SBME', observedAtUtc: '2026-04-02T10:00:00.000Z',
    receivedAtUtc: null, rawMetar: 'METAR SBME TEST=', eventAtUtc: '2026-04-02T10:06:00.000Z', ageMinutes: 6,
    quality: 'EXACT_STATION', selectionMode: 'LATEST_AT_OR_BEFORE', metarKind: 'METAR', temperatureC: temp,
    dewPointC: null, relativeHumidityPct: rh, windSpeedKt: windKt,
  };
}

describe('FRMS environmental risk IOGP 17C.1', () => {
  it('derives NWS heat index without calling it a measurement', () => {
    expect(calculateHeatIndexC(35, 60)).toBeGreaterThan(40);
    const result = assessEnvironmentalRisk({ evidence: [metar(35, 60)] });
    expect(result.maxHeatIndexC).toBeGreaterThan(40);
    expect(result.level).toBe('CRITICAL');
    expect(result.wbgtKind).toBe('UNAVAILABLE');
  });

  it('uses OSHA WBGT threshold only when WBGT is explicitly supplied', () => {
    const result = assessEnvironmentalRisk({
      evidence: [metar(29, 70)], measuredWbgtC: 28.2, workloadClass: 'LIGHT', acclimatization: 'UNACCLIMATIZED',
    });
    expect(result.wbgtKind).toBe('MEASURED');
    expect(result.wbgtThresholdC).toBe(28);
    expect(result.level).toBe('HIGH');
  });

  it('derives wind chill for real cold/wind conditions', () => {
    expect(calculateWindChillC(-20, 20)).toBeLessThan(-28);
    const result = assessEnvironmentalRisk({ evidence: [metar(-20, 50, 20)] });
    expect(result.level === 'HIGH' || result.level === 'CRITICAL').toBe(true);
  });
});

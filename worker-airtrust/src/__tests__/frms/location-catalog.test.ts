import { describe, expect, it } from 'vitest';
import { resolveOperationalLocation, validateLocationCatalogEntry } from '../../lib/frms/location-catalog';

describe('FRMS location catalog', () => {
  it('never infers a platform from an unknown code', () => {
    const result = resolveOperationalLocation('PMXX', [], { tenantTimezoneIana: 'America/Sao_Paulo' });
    expect(result.operationalClass).toBe('UNKNOWN');
    expect(result.quality).toBe('PARTIAL');
    expect(result.timezoneIana).toBe('America/Sao_Paulo');
  });

  it('resolves exact configured aerodrome and REDEMET station', () => {
    const result = resolveOperationalLocation('sbme', [{
      code: 'SBME', operationalClass: 'AERODROME', timezoneIana: 'America/Sao_Paulo',
      weatherSourceKind: 'REDEMET', redemetStationIcao: 'SBME', active: true,
    }]);
    expect(result.operationalClass).toBe('AERODROME');
    expect(result.redemetStationIcao).toBe('SBME');
    expect(result.quality).toBe('EXACT');
  });

  it('rejects invalid REDEMET station config', () => {
    expect(validateLocationCatalogEntry({
      code: 'PMXX', operationalClass: 'PLATFORM', timezoneIana: 'America/Sao_Paulo',
      weatherSourceKind: 'REDEMET', redemetStationIcao: 'PMXX-INVALID', active: true,
    })).toContain('REDEMET_STATION_ICAO_REQUIRED');
  });
});

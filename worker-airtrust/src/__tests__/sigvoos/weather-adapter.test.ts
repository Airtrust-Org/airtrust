import { describe, expect, it } from 'vitest';
import { RedemetClient } from '../../lib/frms/redemet-weather';
import { enrichSigvoosLegWeather } from '../../lib/sigvoos/weather-adapter';

describe('SIGVOOS REDEMET adapter', () => {
  it('fails closed without configured timezone and does not call REDEMET', async () => {
    let called = false;
    const client = new RedemetClient({
      apiKey: 'test-only',
      fetchImpl: async () => { called = true; throw new Error('should not call'); },
    });
    const result = await enrichSigvoosLegWeather(
      client,
      { data: '2026-04-02', departureIcao: 'SBME', arrivalIcao: null, takeoffTime: '07:06', landingTime: '07:54' },
      { tenantOperationalTimezoneIana: null },
    );
    expect(called).toBe(false);
    expect(result.departure.quality).toBe('UNAVAILABLE');
  });
});

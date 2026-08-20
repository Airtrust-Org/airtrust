import { describe, expect, it } from 'vitest';
import { assessSigvoosOperationalDemand } from '../../lib/sigvoos/operational-demand-adapter';

describe('SIGVOOS operational demand adapter', () => {
  it('uses an explicit location classifier and never guesses offshore', () => {
    const raw = {
      flight_report_leg: {
        departure_location: { icao_code: 'SBME', name: 'Macae' },
        arrival_location: { name: 'PLATAFORMA X' },
      },
    };
    const result = assessSigvoosOperationalDemand(
      [{
        data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBME', arrivalIcao: null,
        takeoffTime: '07:00', landingTime: '07:20', dayLandings: 1, nightLandings: 0,
        flightReportId: '100', legNumber: 1, raw,
      }],
      ({ side }) => (side === 'DEPARTURE' ? 'AERODROME' : 'PLATFORM'),
    );
    expect(result.offshoreSectorCount).toBe(1);
    expect(result.offshoreShuttleSectorCount).toBe(0);
  });
});

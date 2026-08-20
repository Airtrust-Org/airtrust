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

  it('multiple crew members on the same flight_report_leg do not duplicate sectors', () => {
    const raw = {
      flight_report_leg: {
        departure_location: { icao_code: 'SBME' },
        arrival_location: { icao_code: 'SBRJ' },
      },
    };
    const leg1 = {
      data: '2026-04-02', horasVooMin: 40, departureIcao: 'SBME', arrivalIcao: 'SBRJ',
      takeoffTime: '07:00', landingTime: '07:40', dayLandings: 1, nightLandings: 0,
      flightReportId: '101', legNumber: 1, raw,
    };
    // Duplicate leg for the copilot
    const leg2 = { ...leg1 };

    const result = assessSigvoosOperationalDemand([leg1, leg2], () => 'AERODROME');

    // Should count as 1 sector and 1 takeoff/landing because they share flightReportId + legNumber
    expect(result.sectorCount).toBe(1);
    expect(result.landingCount).toBe(1);
  });

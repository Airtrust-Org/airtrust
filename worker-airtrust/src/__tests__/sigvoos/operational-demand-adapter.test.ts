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
    // Duplicate leg for the copilot — same flightReportId + legNumber.
    const leg2 = { ...leg1 };

    const result = assessSigvoosOperationalDemand([leg1, leg2], () => 'AERODROME');

    expect(result.sectorCount).toBe(1);
    expect(result.landingCount).toBe(1);
    expect(result.takeoffCount).toBe(1);
  });

  it('same flightReportId with different legNumber counts as two distinct sectors', () => {
    const raw = { flight_report_leg: {} };
    const legA = {
      data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBME', arrivalIcao: 'SBRJ',
      takeoffTime: '07:00', landingTime: '07:20', dayLandings: 1, nightLandings: 0,
      flightReportId: '200', legNumber: 1, raw,
    };
    const legB = {
      data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBRJ', arrivalIcao: 'SBME',
      takeoffTime: '08:00', landingTime: '08:20', dayLandings: 1, nightLandings: 0,
      flightReportId: '200', legNumber: 2, raw,
    };

    const result = assessSigvoosOperationalDemand([legA, legB], () => 'AERODROME');

    expect(result.sectorCount).toBe(2);
    expect(result.takeoffCount).toBe(2);
    expect(result.landingCount).toBe(2);
  });

  it('different flightReportId with the same legNumber counts as distinct sectors', () => {
    const raw = { flight_report_leg: {} };
    const legA = {
      data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBME', arrivalIcao: 'SBRJ',
      takeoffTime: '07:00', landingTime: '07:20', dayLandings: 1, nightLandings: 0,
      flightReportId: '300', legNumber: 1, raw,
    };
    const legB = {
      data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBME', arrivalIcao: 'SBRJ',
      takeoffTime: '07:00', landingTime: '07:20', dayLandings: 1, nightLandings: 0,
      flightReportId: '301', legNumber: 1, raw,
    };

    const result = assessSigvoosOperationalDemand([legA, legB], () => 'AERODROME');

    expect(result.sectorCount).toBe(2);
  });

  it('missing flightReportId/legNumber never collapses two genuinely different legs', () => {
    const raw = { flight_report_leg: {} };
    // Two rows that happen to share date/ICAO/takeoff time but have no
    // identifiers — the fallback must not merge them, even though a naive
    // time+ICAO key would collide.
    const legA = {
      data: '2026-04-02', horasVooMin: 20, departureIcao: 'SBME', arrivalIcao: 'SBRJ',
      takeoffTime: '07:00', landingTime: '07:20', dayLandings: 1, nightLandings: 0,
      flightReportId: null, legNumber: null, raw,
    };
    const legB = { ...legA };

    const result = assessSigvoosOperationalDemand([legA, legB], () => 'AERODROME');

    expect(result.sectorCount).toBe(2);
    expect(result.takeoffCount).toBe(2);
  });
});

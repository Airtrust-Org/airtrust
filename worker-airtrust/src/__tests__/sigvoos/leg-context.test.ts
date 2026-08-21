import { describe, expect, it } from 'vitest';
import { extractSigvoosLegOperationalContext } from '../../lib/sigvoos/leg-context';

describe('SIGVOOS leg operational context', () => {
  it('extrai IDs, ICAOs, horários e pousos da estrutura documentada', () => {
    expect(
      extractSigvoosLegOperationalContext({
        staff: { id: 73, inscription: '12345' },
        flight_report: { id: 12043 },
        flight_report_leg: {
          number: 2,
          departure_location: { icao_code: 'sbme' },
          arrival_location: { icao_code: 'PMXL' },
          engine_start_time_str: '07:00',
          takeoff_time_str: '07:06',
          landing_time_str: '07:54',
          engine_shutoff_time_str: '08:01',
          day_landings: 1,
          night_landings: 0,
          starts: 1,
        },
      }),
    ).toEqual({
      staffIdSigvoos: '73',
      flightReportId: '12043',
      legNumber: 2,
      departureIcao: 'SBME',
      arrivalIcao: 'PMXL',
      engineStartTime: '07:00',
      takeoffTime: '07:06',
      landingTime: '07:54',
      engineShutoffTime: '08:01',
      dayLandings: 1,
      nightLandings: 0,
      starts: 1,
    });
  });

  it('preserva null em campos ausentes e não inventa destino', () => {
    expect(
      extractSigvoosLegOperationalContext({
        staff: { id: 35 },
        date: '02/04/2026',
        flight_report_leg: {
          departure_location: { icao_code: 'SBME' },
          engine_start_time_str: '07:00',
          takeoff_time_str: '07:06',
          landing_time_str: '07:54',
          engine_shutoff_time_str: null,
        },
      }),
    ).toMatchObject({
      staffIdSigvoos: '35',
      flightReportId: null,
      legNumber: null,
      departureIcao: 'SBME',
      arrivalIcao: null,
      engineShutoffTime: null,
      dayLandings: null,
      nightLandings: null,
    });
  });
});

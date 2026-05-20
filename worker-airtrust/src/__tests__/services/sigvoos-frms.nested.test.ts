import { describe, expect, it } from 'vitest';
import { normalizeSigvoosRecord } from '../../services/sigvoos-frms';

describe('sigvoos-frms nested payload', () => {
  it('extracts crew, date, times and flight minutes from nested etapas payload', () => {
    const normalized = normalizeSigvoosRecord({
      staff: { id: 35, name: 'DIETER JOHNY KUHR', inscription: 252 },
      date: '02/04/2026',
      flight_report_leg: {
        departure_location: { icao_code: 'SBME' },
        engine_start_time_str: '07:00',
        takeoff_time_str: '07:06',
        landing_time_str: '07:54',
        engine_shutoff_time_str: null,
        takeoff_land_time_str: '00:48',
        total_time_str: '00:54',
        navigation_time_str: '00:48',
      },
    });

    expect(normalized).toMatchObject({
      canac: null,
      tripulanteNome: 'DIETER JOHNY KUHR',
      data: '2026-04-02',
      horaApresentacao: '07:00',
      horaTermino: '07:54',
      horasVooMin: 48,
      localBase: 'SBME',
    });
  });
});

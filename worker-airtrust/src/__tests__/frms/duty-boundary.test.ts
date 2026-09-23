import { describe, expect, it } from 'vitest';
import {
  addMinutesToClock,
  durationBetweenClocks,
  resolveFrmsDutyBoundary,
} from '../../lib/frms/duty-boundary';

describe('FRMS duty boundary', () => {
  const config = {
    postFlightCutoffMinutes: 30,
    noFlightDutyEndTime: '17:00',
  };

  it('encerra jornada de voo 30 minutos após o último corte configurado', () => {
    const result = resolveFrmsDutyBoundary({
      presentationTime: '08:00',
      hasFlight: true,
      lastCutoffTime: '14:20',
      config,
    });

    expect(result).toMatchObject({
      complete: true,
      dutyEndTime: '14:50',
      durationMinutes: 410,
      reason: 'OK',
    });
  });

  it('usa encerramento configurado para jornada sem voo', () => {
    const result = resolveFrmsDutyBoundary({
      presentationTime: '08:00',
      hasFlight: false,
      lastCutoffTime: null,
      config,
    });

    expect(result).toMatchObject({
      complete: true,
      dutyEndTime: '17:00',
      durationMinutes: 540,
      reason: 'OK',
    });
  });

  it('trata virada de dia sem produzir duração negativa', () => {
    expect(addMinutesToClock('23:50', 30)).toBe('00:20');
    expect(durationBetweenClocks('22:00', '00:20')).toBe(140);
  });

  it('falha fechado sem apresentação ou sem corte em dia com voo', () => {
    expect(
      resolveFrmsDutyBoundary({
        presentationTime: null,
        hasFlight: true,
        lastCutoffTime: '14:20',
        config,
      }).reason,
    ).toBe('MISSING_PRESENTATION');

    expect(
      resolveFrmsDutyBoundary({
        presentationTime: '08:00',
        hasFlight: true,
        lastCutoffTime: null,
        config,
      }).reason,
    ).toBe('MISSING_LAST_CUTOFF');
  });

  it('rejeita configuração operacional inválida', () => {
    expect(
      resolveFrmsDutyBoundary({
        presentationTime: '08:00',
        hasFlight: false,
        lastCutoffTime: null,
        config: { postFlightCutoffMinutes: -1, noFlightDutyEndTime: '17:00' },
      }).reason,
    ).toBe('INVALID_CONFIG');
  });
});

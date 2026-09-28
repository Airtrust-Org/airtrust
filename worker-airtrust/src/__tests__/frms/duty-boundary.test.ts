import { describe, expect, it } from 'vitest';
import {
  addMinutesToClock,
  durationBetweenClocks,
  resolveFrmsDutyBoundary,
  resolveFrmsEstimatedDutyBoundary,
  canCalculateFrmsEffectivenessFromBoundary,
} from '../../lib/frms/duty-boundary';

describe('FRMS duty boundary', () => {
  const config = {
    postFlightCutoffMinutes: 30,
    noFlightDutyEndTime: '17:00',
  };

  it('usa acionamento -30 min e corte +30 min em dia com voo', () => {
    const result = resolveFrmsDutyBoundary({
      presentationTime: '08:00',
      firstEngineStartTime: '08:20',
      hasFlight: true,
      lastCutoffTime: '14:20',
      config,
    });

    expect(result).toMatchObject({
      complete: true,
      presentationTime: '07:50',
      dutyEndTime: '14:50',
      durationMinutes: 420,
      reason: 'OK',
    });
  });

  it('não fabrica jornada sem voo; aguarda atividade real informada no dia seguinte', () => {
    const result = resolveFrmsDutyBoundary({
      presentationTime: '08:00',
      firstEngineStartTime: null,
      hasFlight: false,
      lastCutoffTime: null,
      config,
    });

    expect(result).toMatchObject({
      complete: false,
      dutyEndTime: null,
      durationMinutes: null,
      reason: 'NO_FLIGHT_REQUIRES_REPORTED_ACTIVITY',
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
        firstEngineStartTime: null,
        hasFlight: true,
        lastCutoffTime: '14:20',
        config,
      }).reason,
    ).toBe('MISSING_FIRST_ENGINE_START');

    expect(
      resolveFrmsDutyBoundary({
        presentationTime: '08:00',
        firstEngineStartTime: '08:20',
        hasFlight: true,
        lastCutoffTime: null,
        config,
      }).reason,
    ).toBe('MISSING_LAST_CUTOFF');
  });

  it('não permite que configuração legada altere a margem canônica de 30 minutos', () => {
    expect(
      resolveFrmsDutyBoundary({
        presentationTime: '09:00',
        firstEngineStartTime: '08:20',
        hasFlight: true,
        lastCutoffTime: '14:20',
        config: { postFlightCutoffMinutes: 5, noFlightDutyEndTime: '16:00' },
      }),
    ).toMatchObject({ presentationTime: '07:50', dutyEndTime: '14:50', durationMinutes: 420 });
  });
  it('preserva a janela histórica como estimada quando não há check-in', () => {
    expect(resolveFrmsEstimatedDutyBoundary({
      presentationTime: '06:10',
      firstEngineStart: '06:15',
      firstTakeoff: '06:30',
      endTime: '12:20',
      lastLanding: '12:10',
    })).toEqual({
      presentationTime: '06:10',
      dutyEndTime: '12:20',
      durationMinutes: 370,
      complete: true,
    });
  });

  it('usa primeiro acionamento/decolagem como fallback e nunca inventa janela incompleta', () => {
    expect(resolveFrmsEstimatedDutyBoundary({
      presentationTime: null,
      firstEngineStart: '06:20',
      firstTakeoff: '06:35',
      endTime: '12:20',
      lastLanding: '12:10',
    })).toMatchObject({ presentationTime: '06:20', dutyEndTime: '12:20', durationMinutes: 360, complete: true });

    expect(resolveFrmsEstimatedDutyBoundary({
      presentationTime: null,
      firstEngineStart: null,
      firstTakeoff: null,
      endTime: '12:20',
      lastLanding: '12:10',
    }).complete).toBe(false);
  });

  it('não calcula efetividade fisiológica para jornada apenas estimada', () => {
    expect(canCalculateFrmsEffectivenessFromBoundary('REAL')).toBe(true);
    expect(canCalculateFrmsEffectivenessFromBoundary('ESTIMADO')).toBe(false);
    expect(canCalculateFrmsEffectivenessFromBoundary('AUSENTE')).toBe(false);
  });

});

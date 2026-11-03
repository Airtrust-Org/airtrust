import { describe, it, expect } from 'vitest';
import { evaluateDailyRisk } from '../../lib/frms/daily-checkin-risk';
import { CheckinCreateSchema } from '../../routes/frms-fadiga-checkin.schema';
import { validateCheckinPayloadCompleteness } from '../../routes/frms-fadiga-checkin-validation';

const riskInput = { apto: 1 as const, horasSono24h: 8, subjectiveFatigueLevel: null, sleepinessLevel: null };
const payload = {
  reference_date: '2026-11-03',
  hora_apresentacao: '05:30',
  wake_time: '04:00',
  horas_sono_24h: 8,
  fit_for_duty: true,
  kss_score: 5,
};

describe('FRMS critical check-in triage', () => {
  it('KSS 9 and KSS 8 independently demand operational review even with 8h sleep', () => {
    expect(evaluateDailyRisk({ ...riskInput, kssScore: 9 })).toBe('critical');
    expect(evaluateDailyRisk({ ...riskInput, kssScore: 8 })).toBe('critical');
    expect(evaluateDailyRisk({ ...riskInput, kssScore: 7 })).toBe('attention');
    expect(evaluateDailyRisk({ ...riskInput, kssScore: 5 })).toBe('normal');
  });

  it('zero actual sleep is critical rather than absent or restorative', () => {
    expect(evaluateDailyRisk({ ...riskInput, kssScore: 5, horasSono24h: 0 })).toBe('critical');
  });

  it('missing KSS is not replaced by KSS 5 or inferred from a different scale', () => {
    expect(CheckinCreateSchema.safeParse({ ...payload, kss_score: undefined }).success).toBe(false);
    expect(CheckinCreateSchema.safeParse({ ...payload, kss_score: undefined, sleepiness_level: 10 }).success).toBe(false);
    expect(CheckinCreateSchema.safeParse(payload).success).toBe(true);
  });

  it('invalid sleep windows fail before persistence', () => {
    const impossible = { ...payload, horas_sono_24h: 4, hora_dormiu: '04:30' };
    expect(validateCheckinPayloadCompleteness(impossible)).toMatchObject({
      ok: false, error: 'sleep_window_invalid',
    });
    expect(validateCheckinPayloadCompleteness({ ...payload, hora_dormiu: '04:00' })).toMatchObject({
      ok: false, error: 'sleep_window_invalid',
    });
    expect(validateCheckinPayloadCompleteness({ ...payload, hora_dormiu: '23:30' })).toEqual({ ok: true });
    expect(validateCheckinPayloadCompleteness({ ...payload, horas_sono_24h: 0 })).toEqual({ ok: true });
  });
});

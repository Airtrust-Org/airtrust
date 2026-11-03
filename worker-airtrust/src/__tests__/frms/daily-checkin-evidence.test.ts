import { describe, expect, it } from 'vitest';
import { resolveDailyCheckinEvidence } from '../../lib/frms/daily-checkin-evidence';

const base = {
  hasCheckin: true,
  presentationTime: '07:00',
  wakeTime: '05:00',
  sleepHours: 8,
  kssScore: 4,
  fitForDuty: 1,
  storedRiskLevel: 'normal',
};

describe('FRMS daily fatigue: fail-closed persisted evidence', () => {
  it('preserves a fully evidenced normal check-in', () => {
    expect(resolveDailyCheckinEvidence(base)).toEqual({
      complete: true, riskLevel: 'normal', riskReconciledFromEvidence: false,
    });
  });

  it.each([
    { kssScore: null },
    { kssScore: 0 },
    { kssScore: 10 },
    { fitForDuty: null },
    { sleepHours: null },
    { sleepHours: -1 },
    { sleepHours: 25 },
    { wakeTime: '99:00' },
    { presentationTime: '' },
    { storedRiskLevel: 'invalid' },
    { hasCheckin: false },
  ])('never calls incomplete or invalid evidence normal: %j', (delta) => {
    expect(resolveDailyCheckinEvidence({ ...base, ...delta })).toMatchObject({
      complete: false, riskLevel: null,
    });
  });

  it('does not turn explicit zero hours of sleep into missing evidence', () => {
    expect(resolveDailyCheckinEvidence({ ...base, sleepHours: 0, storedRiskLevel: 'critical' }))
      .toMatchObject({ complete: true, riskLevel: 'critical' });
  });

  it('escalates an old stored NORMAL for KSS 9 to critical review', () => {
    expect(resolveDailyCheckinEvidence({ ...base, kssScore: 9 })).toMatchObject({
      complete: true, riskLevel: 'critical', riskReconciledFromEvidence: true,
    });
  });

  it('escalates old NORMAL for KSS 7 and for sleep under five hours', () => {
    for (const delta of [{ kssScore: 7 }, { sleepHours: 4.5 }]) {
      expect(resolveDailyCheckinEvidence({ ...base, ...delta })).toMatchObject({
        riskLevel: 'attention', riskReconciledFromEvidence: true,
      });
    }
  });

  it('never weakens existing critical or self-declared unfit risk', () => {
    expect(resolveDailyCheckinEvidence({ ...base, storedRiskLevel: 'critical' }).riskLevel).toBe('critical');
    expect(resolveDailyCheckinEvidence({ ...base, fitForDuty: 0 })).toMatchObject({
      riskLevel: 'unfit_for_duty', riskReconciledFromEvidence: true,
    });
  });
});

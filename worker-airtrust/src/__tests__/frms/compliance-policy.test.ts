import { describe, expect, it } from 'vitest';
import {
  anacBasicRestAfterDutyMin,
  buildAnacBasicHelicopterCandidates,
  buildAnacRbac117BcHelicopterCumulativeCandidates,
  buildIogp6902CoreCandidates,
  evaluateResolvedLimit,
  iogpRestAfterDutyMin,
  rbac117AppendixCLimit,
  regulatoryProfileIsReady,
  resolveMostRestrictiveLimit,
  type LimitCandidate,
} from '../../lib/frms/compliance-policy';

function rulesForMetric<T extends LimitCandidate['metric']>(
  metric: T,
  ...sets: LimitCandidate[][]
): LimitCandidate[] {
  return sets.flat().filter((rule) => rule.metric === metric);
}

describe('FRMS compliance policy — most restrictive rule', () => {
  it('enforces ANAC per-duty and IOGP 1-day limits as separate windows', () => {
    const anac = buildAnacBasicHelicopterCandidates({
      service: 'RBAC117_117_1_B2_TO_B6',
      fdpMaxMin: 11 * 60,
    });
    const iogp = buildIogp6902CoreCandidates();

    const anacDuty = resolveMostRestrictiveLimit(
      'FLIGHT_TIME_DUTY_MIN',
      'MAX',
      rulesForMetric('FLIGHT_TIME_DUTY_MIN', anac),
    );
    const iogpDay = resolveMostRestrictiveLimit(
      'FLIGHT_TIME_1D_CONSECUTIVE_MIN',
      'MAX',
      rulesForMetric('FLIGHT_TIME_1D_CONSECUTIVE_MIN', iogp),
    );

    expect(anacDuty?.limitMin).toBe(8 * 60);
    expect(iogpDay?.limitMin).toBe(10 * 60);
    expect(evaluateResolvedLimit(6 * 60, anacDuty).status).toBe('COMPLIANT');
    expect(evaluateResolvedLimit(12 * 60, iogpDay).status).toBe('VIOLATION');
  });

  it('keeps calendar month distinct from rolling 28 days', () => {
    const anac = buildAnacBasicHelicopterCandidates({
      service: 'RBAC117_117_1_B2_TO_B6',
      fdpMaxMin: 11 * 60,
    });
    const iogp = buildIogp6902CoreCandidates();

    expect(() =>
      resolveMostRestrictiveLimit('FLIGHT_TIME_MONTH_CALENDAR_MIN', 'MAX', [
        anac.find((rule) => rule.metric === 'FLIGHT_TIME_MONTH_CALENDAR_MIN')!,
        iogp.find((rule) => rule.metric === 'FLIGHT_TIME_28D_ROLLING_MIN')!,
      ]),
    ).toThrow(/different metrics\/windows/);
  });

  it('uses IOGP 45h in rolling 7d when it is the only applicable flight-time rule in that window', () => {
    const iogp = buildIogp6902CoreCandidates();
    const rules = rulesForMetric('FLIGHT_TIME_7D_ROLLING_MIN', iogp);
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_7D_ROLLING_MIN', 'MAX', rules);
    expect(resolved?.limitMin).toBe(45 * 60);
  });

  it('uses 93h/28d ANAC B/C instead of IOGP 120h/28d when B/C is approved', () => {
    const anac = buildAnacRbac117BcHelicopterCumulativeCandidates();
    const iogp = buildIogp6902CoreCandidates();
    const rules = rulesForMetric('FLIGHT_TIME_28D_ROLLING_MIN', anac, iogp);
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_28D_ROLLING_MIN', 'MAX', rules);
    expect(resolved?.limitMin).toBe(93 * 60);
  });

  it('uses 930h/365d ANAC B/C instead of IOGP 1200h/365d when B/C is approved', () => {
    const anac = buildAnacRbac117BcHelicopterCumulativeCandidates();
    const iogp = buildIogp6902CoreCandidates();
    const rules = rulesForMetric('FLIGHT_TIME_365D_ROLLING_MIN', anac, iogp);
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_365D_ROLLING_MIN', 'MAX', rules);
    expect(resolved?.limitMin).toBe(930 * 60);
  });

  it('lets an operator/contract rule win when it is stricter', () => {
    const iogp = buildIogp6902CoreCandidates();
    const operator: LimitCandidate = {
      id: 'OPERATOR_7D_40H',
      metric: 'FLIGHT_TIME_7D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: 40 * 60,
      source: 'OPERATOR',
      reference: 'Operator approved policy',
      label: 'Internal 7d flight limit',
    };
    const rules = rulesForMetric('FLIGHT_TIME_7D_ROLLING_MIN', iogp, [operator]);
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_7D_ROLLING_MIN', 'MAX', rules);
    expect(resolved?.limitMin).toBe(40 * 60);
    expect(resolved?.winningRule.source).toBe('OPERATOR');
  });
});

describe('FRMS compliance policy — rest', () => {
  it('ANAC basic rest is 12h / 16h / 24h', () => {
    expect(anacBasicRestAfterDutyMin(12 * 60)).toBe(12 * 60);
    expect(anacBasicRestAfterDutyMin(12 * 60 + 1)).toBe(16 * 60);
    expect(anacBasicRestAfterDutyMin(15 * 60)).toBe(16 * 60);
    expect(anacBasicRestAfterDutyMin(15 * 60 + 1)).toBe(24 * 60);
  });

  it('IOGP rest is at least 10h or previous FDP, whichever is greater', () => {
    expect(iogpRestAfterDutyMin(8 * 60)).toBe(10 * 60);
    expect(iogpRestAfterDutyMin(14 * 60)).toBe(14 * 60);
  });

  it('for a 14h previous duty, ANAC 16h beats IOGP 14h', () => {
    const previousDutyMin = 14 * 60;
    const anac = buildAnacBasicHelicopterCandidates({
      service: 'RBAC117_117_1_B2_TO_B6',
      fdpMaxMin: 11 * 60,
      previousDutyMin,
    });
    const iogp = buildIogp6902CoreCandidates(previousDutyMin);
    const rules = rulesForMetric('REST_AFTER_DUTY_MIN', anac, iogp);
    const resolved = resolveMostRestrictiveLimit('REST_AFTER_DUTY_MIN', 'MIN', rules);
    expect(resolved?.limitMin).toBe(16 * 60);
    expect(resolved?.winningRule.source).toBe('ANAC');
  });

  it('a mandatory limit violation cannot be neutralized by any fatigue score', () => {
    const rules: LimitCandidate[] = [{
      id: 'ANAC_DAILY',
      metric: 'FLIGHT_TIME_DUTY_MIN',
      direction: 'MAX',
      limitMin: 8 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 Appendix A',
      label: 'Daily',
    }];
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_DUTY_MIN', 'MAX', rules);
    expect(evaluateResolvedLimit(8 * 60 + 1, resolved).status).toBe('VIOLATION');
  });
});

describe('RBAC 117 Appendix C table', () => {
  it('matches the 08:00–11:59 / 1-2 sector cell = 13h (10h flight)', () => {
    expect(rbac117AppendixCLimit('08:00', 2)).toEqual({ fdpMaxMin: 13 * 60, flightMaxMin: 10 * 60 });
  });

  it('matches the 18:00–06:00 / 5+ sector night cells = 9h (7h flight)', () => {
    expect(rbac117AppendixCLimit('23:30', 5)).toEqual({ fdpMaxMin: 9 * 60, flightMaxMin: 7 * 60 });
    expect(rbac117AppendixCLimit('06:00', 7)).toEqual({ fdpMaxMin: 9 * 60, flightMaxMin: 7 * 60 });
  });

  it('matches 06:01 boundary', () => {
    expect(rbac117AppendixCLimit('06:01', 1)).toEqual({ fdpMaxMin: 11 * 60, flightMaxMin: 9 * 60 });
  });
});

describe('regulatory profile state', () => {
  it('fails closed when active ANAC profile is not documented', () => {
    expect(regulatoryProfileIsReady({ profileCode: null })).toBe(false);
    expect(regulatoryProfileIsReady({ profileCode: 'ANAC_BASIC' })).toBe(false);
  });

  it('is ready only with profile and documentary reference', () => {
    expect(
      regulatoryProfileIsReady({
        profileCode: 'ANAC_BASIC',
        documentedReference: 'MGO/GRF accepted by ANAC — current controlled revision',
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { deriveRecoveryEvidence } from '../../lib/frms/recovery-model';

describe('deriveRecoveryEvidence', () => {
  it('does not assume recovery when the no-flight day is unclassified', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'UNKNOWN',
        activityKnown: false,
        sleepHours24h: 8,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 1,
      }),
    ).toMatchObject({
      state: 'UNKNOWN',
      confidence: 'LOW',
      qualifyingRecoveryNight: false,
      effectivenessDeltaPct: null,
    });
  });

  it('does not convert a reported SIGVOOS source gap into recovery', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'FLIGHT_NOT_IN_SOURCE',
        sleepHours24h: 8.5,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 2,
        readinessClassification: 'preserved',
      }),
    ).toMatchObject({
      state: 'UNKNOWN',
      confidence: 'LOW',
      qualifyingRecoveryNight: false,
      reasons: ['SIGVOOS_SOURCE_GAP_REPORTED'],
      effectivenessDeltaPct: null,
    });
  });

  it('recognises onsite standby as a recovery opportunity only with a sufficient no-work window', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'STANDBY_ONSITE',
        sleepHours24h: 8,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 0,
        noWorkHours: 12,
        minimumNoWorkHours: 12,
      }),
    ).toMatchObject({ state: 'PARTIAL', qualifyingRecoveryNight: true });
  });

  it('does not treat standby as off-duty when the no-work window is too short', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'STANDBY_HOME_HOTEL',
        sleepHours24h: 8,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 1,
        noWorkHours: 8,
        minimumNoWorkHours: 12,
      }),
    ).toMatchObject({
      state: 'LIMITED',
      qualifyingRecoveryNight: false,
      reasons: ['STANDBY_SEM_JANELA_MINIMA_SEM_ATIVIDADE'],
    });
  });

  it('fails standby recovery closed when the duty window is unknown', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'STANDBY_ONSITE',
        sleepHours24h: 8,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 1,
        noWorkHours: null,
        minimumNoWorkHours: 12,
      }),
    ).toMatchObject({
      state: 'LIMITED',
      confidence: 'MEDIUM',
      qualifyingRecoveryNight: false,
    });
  });

  it('treats one unrestricted adequate-sleep night as partial recovery', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'OFF_DUTY',
        sleepHours24h: 8.2,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 1,
      }),
    ).toMatchObject({ state: 'PARTIAL', qualifyingRecoveryNight: true });
  });

  it('treats two qualifying nights as strong recovery without objective confirmation', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'OFF_DUTY',
        sleepHours24h: 8.1,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 2,
        readinessClassification: 'baseline_building',
      }),
    ).toMatchObject({ state: 'STRONG', qualifyingRecoveryNight: true });
  });

  it('confirms recovery when two qualifying nights coincide with preserved readiness', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'OFF_DUTY',
        sleepHours24h: 8.4,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 2,
        readinessClassification: 'preserved',
      }),
    ).toMatchObject({ state: 'CONFIRMED', confidence: 'HIGH', qualifyingRecoveryNight: true });
  });

  it('does not call recovery strong when readiness still shows attention', () => {
    expect(
      deriveRecoveryEvidence({
        activityType: 'OFF_DUTY',
        sleepHours24h: 8.5,
        sleepTargetHours: 8,
        consecutiveQualifyingNights: 3,
        readinessClassification: 'attention',
      }),
    ).toMatchObject({ state: 'PARTIAL', confidence: 'HIGH' });
  });

  it('never emits an effectiveness bonus in V1', () => {
    const result = deriveRecoveryEvidence({
      activityType: 'OFF_DUTY',
      sleepHours24h: 9,
      sleepTargetHours: 8,
      consecutiveQualifyingNights: 4,
      readinessClassification: 'preserved',
    });
    expect(result.effectivenessDeltaPct).toBeNull();
  });
});
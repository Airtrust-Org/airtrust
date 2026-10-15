import { describe, expect, it } from 'vitest';
import {
  describeImaScheduleExposure,
  compareImaScheduleExposures,
  type ScheduleExposureEvent,
  type ScheduleExposureInput,
} from '../../lib/frms/ima-v3-schedule-exposure';

const at = (day: string, hour: string) => `2026-10-${day}T${hour}:00-03:00`;
const day = (events: ScheduleExposureEvent[]): ScheduleExposureInput => ({
  windowStartAt: at('10', '00:00'),
  windowEndAt: at('11', '00:00'),
  referenceUtcOffsetMinutes: -180,
  events,
});
const shift = (
  start: string, end: string,
  activity: ScheduleExposureEvent['activity'],
  source: ScheduleExposureEvent['source'] = 'PLANNED',
): ScheduleExposureEvent => ({ startAt: start, endAt: end, activity, source });
const fullDay = (start: string, end: string): ScheduleExposureInput => day([
  shift(at('10','00:00'), start, 'OFF_DUTY'),
  shift(start, end, 'DUTY'),
  shift(end, at('11','00:00'), 'OFF_DUTY'),
]);

describe('IMA V3 schedule exposure — descriptive, never a fatigue or fitness score', () => {
  it('treats an empty schedule as 24h unknown, never rested or green', () => {
    const v = describeImaScheduleExposure(day([]));
    expect(v).toMatchObject({
      state: 'NO_SCHEDULE_EVIDENCE', windowHours: 24, reportedHours: 0,
      gapHours: 24, fatigueIndex: null, verifiedSleepHours: null,
      fitForDuty: null, flightAuthorization: 'NOT_PROVIDED',
      regulatoryCompliance: 'NOT_ASSESSED',
    });
    expect(v.reasons).toContain('SEM_ESCALA_NA_JANELA');
  });

  it('distinguishes actual duty from non-sleep off-duty and counts night exposure', () => {
    const a = day([
      shift(at('10','09:00'), at('11','00:00'), 'OFF_DUTY', 'ACTUAL'),
      shift(at('10','01:00'), at('10','09:00'), 'DUTY', 'ACTUAL'),
      shift(at('10','00:00'), at('10','01:00'), 'OFF_DUTY', 'ACTUAL'),
    ]);
    const v = describeImaScheduleExposure(a);
    expect(v).toMatchObject({
      state: 'DESCRIPTIVE_EVIDENCE_ONLY', actualDutyHours: 8,
      offDutyOpportunityHours: 16, plannedDutyHours: 0,
      referenceNightDutyHours: 4, eventCount: 3, gapHours: 0,
      verifiedSleepHours: null, fatigueIndex: null,
      referenceClock: 'FIXED_OFFSET_RESEARCH_ONLY',
    });
  });

  it('preserves provenance for a mixed actual + planned schedule', () => {
    const v = describeImaScheduleExposure(day([
      shift(at('10','00:00'), at('10','06:00'), 'DUTY', 'ACTUAL'),
      shift(at('10','06:00'), at('10','18:00'), 'OFF_DUTY', 'PLANNED'),
      shift(at('10','18:00'), at('11','00:00'), 'STANDBY', 'PLANNED'),
    ]));
    expect(v).toMatchObject({
      state: 'MIXED_ACTUAL_AND_PLANNED', actualDutyHours: 6,
      plannedStandbyHours: 6, offDutyOpportunityHours: 12,
      gapHours: 0, verifiedSleepHours: null,
    });
    expect(v.reasons).toContain('REALIZADO_E_PLANEJADO_NAO_EQUIVALENTES');
  });

  it('never treats inferred or estimated duty as observed actual duty', () => {
    const v = describeImaScheduleExposure(day([
      shift(at('10','00:00'), at('10','12:00'), 'DUTY', 'ESTIMATED'),
      shift(at('10','12:00'), at('11','00:00'), 'OFF_DUTY', 'ESTIMATED'),
    ]));
    expect(v).toMatchObject({
      estimatedHours: 24, estimatedDutyHours: 12, actualDutyHours: 0,
      plannedDutyHours: 0, state: 'ESTIMATED_SEGMENTS',
    });
    expect(v.reasons).toContain('PERIODOS_ESTIMADOS');
  });

  it('counts gaps without imputing wakefulness, sleep or rest', () => {
    const v = describeImaScheduleExposure(day([
      shift(at('10','08:00'), at('10','17:00'), 'DUTY', 'ACTUAL'),
    ]));
    expect(v).toMatchObject({
      state: 'INCOMPLETE_SCHEDULE', gapHours: 15, reportedHours: 9,
      actualDutyHours: 9, offDutyOpportunityHours: 0,
    });
    expect(v.reasons).toContain('LACUNAS_DE_ESCALA');
  });

  it('rejects overlap even when one event is a planned copy of an actual one', () => {
    const input = day([
      shift(at('10','09:00'), at('10','17:00'), 'DUTY', 'ACTUAL'),
      shift(at('10','10:00'), at('10','18:00'), 'DUTY', 'PLANNED'),
    ]);
    expect(() => describeImaScheduleExposure(input))
      .toThrow('IMA_SCHEDULE_OVERLAPPING_EVIDENCE');
  });

  it('clips intervals to the research window without counted out-of-window time', () => {
    const v = describeImaScheduleExposure(day([
      shift(at('09','23:00'), at('10','03:00'), 'STANDBY'),
      shift(at('10','23:00'), at('11','03:00'), 'DUTY'),
    ]));
    expect(v).toMatchObject({
      plannedStandbyHours: 3, plannedDutyHours: 1,
      gapHours: 20, reportedHours: 4,
    });
  });

  it('compares two equal-duration planned shifts, never ranking or dispatching personnel', () => {
    const a = fullDay(at('10','03:00'), at('10','11:00'));
    const b = fullDay(at('10','09:00'), at('10','17:00'));
    const cmp = compareImaScheduleExposures(a, b);
    expect(cmp).toMatchObject({
      deltaActualDutyHours: 0, deltaPlannedDutyHours: 0,
      deltaReferenceNightDutyHours: -3, deltaUnresolvedHours: 0,
      riskRanking: 'NOT_AVAILABLE_WITHOUT_VALIDATION',
      flightAuthorization: 'NOT_PROVIDED',
    });
    expect(() => compareImaScheduleExposures(a, {
      ...b, referenceUtcOffsetMinutes: 0,
    })).toThrow('IMA_SCHEDULE_COMPARISON_SCOPE_MISMATCH');
  });

  it('requires explicit instants, valid local offset, window and event provenance', () => {
    expect(() => describeImaScheduleExposure(day([
      shift('2026-10-10T09:00:00', at('10','17:00'), 'DUTY'),
    ]))).toThrow('IMA_SCHEDULE_EXPLICIT_TIMESTAMP_REQUIRED');
    expect(() => describeImaScheduleExposure({
      ...day([]), windowEndAt: at('10','00:00'),
    })).toThrow('IMA_SCHEDULE_INVALID_WINDOW');
    expect(() => describeImaScheduleExposure({
      ...day([]), referenceUtcOffsetMinutes: 10000,
    })).toThrow('IMA_SCHEDULE_INVALID_UTC_OFFSET');
    expect(() => describeImaScheduleExposure(day([
      shift(at('10','06:00'), at('10','02:00'), 'DUTY'),
    ]))).toThrow('IMA_SCHEDULE_INVALID_INTERVAL');
    expect(() => describeImaScheduleExposure(day([
      { ...shift(at('10','02:00'), at('10','06:00'), 'DUTY'), source: 'UNPROVEN' as 'ACTUAL' },
    ]))).toThrow('IMA_SCHEDULE_INVALID_PROVENANCE');
  });
});

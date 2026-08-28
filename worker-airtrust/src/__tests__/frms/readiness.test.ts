import { describe, expect, it } from 'vitest';
import {
  READINESS_PROTOCOL,
  deriveReadinessAssessment,
  normalizeReadinessTrials,
  summarizeReadinessTrials,
  type ReadinessTrial,
} from '../../lib/frms/readiness';

function trial(sequence: number, reactionTimeMs: number | null, outcome: ReadinessTrial['outcome']): ReadinessTrial {
  return {
    sequence,
    scheduledAtMs: sequence * 1000,
    stimulusAtMs: sequence * 1000,
    responseAtMs: reactionTimeMs == null ? null : sequence * 1000 + reactionTimeMs,
    reactionTimeMs,
    outcome,
  };
}

describe('FRMS operational readiness', () => {
  it('pins the active PVT-B response ceiling at 30 seconds', () => {
    expect(READINESS_PROTOCOL.version).toBe('airtrust-pvtb-v2');
    expect(READINESS_PROTOCOL.responseWindowMs).toBe(30_000);
  });

  it('rebuilds V2 trial outcomes from timestamps and treats no-response as a 30 s lapse', () => {
    const normalized = normalizeReadinessTrials(
      [
        { ...trial(1, 620, 'response'), reactionTimeMs: 120, outcome: 'response' },
        { ...trial(2, 280, 'lapse'), reactionTimeMs: 900, outcome: 'lapse' },
        {
          sequence: 3,
          scheduledAtMs: 3000,
          stimulusAtMs: -1,
          responseAtMs: 3050,
          reactionTimeMs: 999,
          outcome: 'response',
        },
        { ...trial(4, null, 'missed'), reactionTimeMs: null, outcome: 'missed' },
      ],
      180_000,
      'airtrust-pvtb-v2',
    );

    expect(normalized.map((item) => item.outcome)).toEqual(['lapse', 'response', 'false_start', 'lapse']);
    expect(normalized.map((item) => item.reactionTimeMs)).toEqual([620, 280, 0, 30_000]);
  });

  it('preserves the historical v1 missed interpretation without mixing protocols', () => {
    const normalized = normalizeReadinessTrials(
      [{ ...trial(1, null, 'missed'), reactionTimeMs: null }],
      180_000,
      'airtrust-vigilance-v1',
    );

    expect(normalized[0]).toMatchObject({ outcome: 'missed', reactionTimeMs: null, responseAtMs: null });
  });

  it('accepts a V2 response after the nominal sampling boundary when the stimulus began in-window', () => {
    const normalized = normalizeReadinessTrials(
      [
        {
          sequence: 1,
          scheduledAtMs: 179_000,
          stimulusAtMs: 179_500,
          responseAtMs: 180_200,
          reactionTimeMs: 1,
          outcome: 'response',
        },
      ],
      180_000,
      'airtrust-pvtb-v2',
    );

    expect(normalized[0]).toMatchObject({ reactionTimeMs: 700, outcome: 'lapse' });
  });

  it('rejects duplicate sequences and impossible response timing', () => {
    expect(() =>
      normalizeReadinessTrials([trial(1, 250, 'response'), trial(1, 300, 'response')], 180_000),
    ).toThrow('invalid_trial_sequence');

    expect(() =>
      normalizeReadinessTrials(
        [
          {
            sequence: 1,
            scheduledAtMs: 1000,
            stimulusAtMs: 1500,
            responseAtMs: 1400,
            reactionTimeMs: 100,
            outcome: 'response',
          },
        ],
        180_000,
      ),
    ).toThrow('invalid_trial_timing');
  });

  it('summarizes V2 no-response as a lapse without hiding it as missed', () => {
    const normalized = normalizeReadinessTrials(
      [
        trial(1, 250, 'response'),
        trial(2, 300, 'response'),
        trial(3, 600, 'lapse'),
        trial(4, null, 'missed'),
        {
          sequence: 5,
          scheduledAtMs: 5000,
          stimulusAtMs: -1,
          responseAtMs: 5050,
          reactionTimeMs: 999,
          outcome: 'response',
        },
      ],
      180_000,
      'airtrust-pvtb-v2',
    );
    const summary = summarizeReadinessTrials(normalized, 180_000);

    expect(summary.durationMs).toBe(180_000);
    expect(summary.validTrials).toBe(4);
    expect(summary.responseTrials).toBe(4);
    expect(summary.lapseCount).toBe(2);
    expect(summary.lapseRate).toBeCloseTo(0.5);
    expect(summary.falseStartCount).toBe(1);
    expect(summary.missedCount).toBe(0);
    expect(summary.medianRtMs).toBe(450);
    expect(summary.meanRtMs).toBeCloseTo(7787.5, 1);
    expect(summary.p90RtMs).toBeCloseTo(21180);
  });

  it('keeps early sessions in baseline-building when no critical signal exists', () => {
    const assessment = deriveReadinessAssessment({
      kssScore: 4,
      sleepHours: 7.5,
      baselineSessions: READINESS_PROTOCOL.minimumBaselineSessions - 1,
      summary: summarizeReadinessTrials([trial(1, 280, 'response'), trial(2, 310, 'response')], 180_000),
    });

    expect(assessment.classification).toBe('baseline_building');
    expect(assessment.baselineReady).toBe(false);
    expect(assessment.warningSignals).toEqual([]);
    expect(assessment.criticalSignals).toEqual([]);
  });

  it('never lets baseline-building hide a critical subjective signal', () => {
    const assessment = deriveReadinessAssessment({
      kssScore: 8,
      sleepHours: 4.5,
      baselineSessions: 0,
      summary: summarizeReadinessTrials([trial(1, 280, 'response')], 180_000),
    });

    expect(assessment.classification).toBe('operational_review');
    expect(assessment.criticalSignals).toEqual(expect.arrayContaining(['kss_high', 'sleep_short']));
  });

  it('raises attention only after baseline exists and multiple warning signals are present', () => {
    const assessment = deriveReadinessAssessment({
      kssScore: 7,
      sleepHours: 5.5,
      baselineSessions: READINESS_PROTOCOL.minimumBaselineSessions,
      summary: summarizeReadinessTrials(
        [trial(1, 550, 'lapse'), trial(2, 560, 'lapse'), trial(3, 300, 'response')],
        180_000,
      ),
    });

    expect(assessment.classification).toBe('attention');
    expect(assessment.baselineReady).toBe(true);
    expect(assessment.warningSignals).toEqual(
      expect.arrayContaining(['kss_elevated', 'sleep_reduced', 'vigilance_lapses']),
    );
  });
});

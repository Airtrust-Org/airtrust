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
  it('rebuilds trial outcomes from timestamps instead of trusting client labels', () => {
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
        { ...trial(4, null, 'response'), reactionTimeMs: 250, outcome: 'response' },
      ],
      180_000,
    );

    expect(normalized.map((item) => item.outcome)).toEqual(['lapse', 'response', 'false_start', 'missed']);
    expect(normalized.map((item) => item.reactionTimeMs)).toEqual([620, 280, 0, null]);
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

  it('summarizes normalized vigilance trials without hiding lapses or missed stimuli', () => {
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
    );
    const summary = summarizeReadinessTrials(normalized, 180_000);

    expect(summary.durationMs).toBe(180_000);
    expect(summary.validTrials).toBe(4);
    expect(summary.responseTrials).toBe(3);
    expect(summary.lapseCount).toBe(1);
    expect(summary.lapseRate).toBeCloseTo(0.25);
    expect(summary.falseStartCount).toBe(1);
    expect(summary.missedCount).toBe(1);
    expect(summary.medianRtMs).toBe(300);
    expect(summary.meanRtMs).toBeCloseTo(383.333, 2);
    expect(summary.p90RtMs).toBeCloseTo(540);
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

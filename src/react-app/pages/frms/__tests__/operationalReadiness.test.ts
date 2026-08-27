import { describe, expect, it } from 'vitest';
import {
  deriveReadinessAssessment,
  summarizeVigilanceTrials,
  type VigilanceTrial,
} from '../operationalReadiness';
import { assessThermalExposure } from '../thermalExposure';

describe('operational readiness', () => {
  it('summarizes vigilance trials without turning them into an automatic fit/unfit decision', () => {
    const trials: VigilanceTrial[] = [
      { sequence: 1, scheduledAtMs: 1000, stimulusAtMs: 1100, responseAtMs: 1350, reactionTimeMs: 250, outcome: 'response' },
      { sequence: 2, scheduledAtMs: 3000, stimulusAtMs: 3100, responseAtMs: 3650, reactionTimeMs: 550, outcome: 'lapse' },
      { sequence: 3, scheduledAtMs: 5000, stimulusAtMs: 5100, responseAtMs: null, reactionTimeMs: null, outcome: 'missed' },
    ];

    const summary = summarizeVigilanceTrials(trials, 180_000);

    expect(summary.validResponses).toBe(2);
    expect(summary.medianReactionTimeMs).toBe(400);
    expect(summary.lapses).toBe(1);
    expect(summary.missed).toBe(1);

    expect(
      deriveReadinessAssessment({
        kssScore: 3,
        sleepHours24h: 8,
        vigilance: summary,
        baselineSessions: 2,
      }).classification,
    ).toBe('baseline_building');
  });

  it('requires operational review for strong self-reported fatigue signals after baseline is available', () => {
    const result = deriveReadinessAssessment({
      kssScore: 8,
      sleepHours24h: 4.5,
      vigilance: null,
      baselineSessions: 5,
    });

    expect(result.classification).toBe('operational_review');
    expect(result.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining(['KSS_HIGH', 'SLEEP_LOW']),
    );
  });

  it('keeps temperature scoring disabled until the governed benchmark is approved', () => {
    expect(
      assessThermalExposure({
        temperatureC: 36,
        observedAt: '2026-08-27T15:00:00Z',
        stationIcao: 'SBGL',
        source: 'REDEMET_METAR',
      }),
    ).toMatchObject({ applicable: false, points: 0, temperatureC: 36 });
  });

  it('supports a governed per-degree rule once configured', () => {
    expect(
      assessThermalExposure(
        {
          temperatureC: 34,
          observedAt: '2026-08-27T15:00:00Z',
          stationIcao: 'SBGL',
          source: 'REDEMET_METAR',
        },
        { enabled: true, thresholdC: 30, pointsPerDegree: 1.5, maxPoints: 8 },
      ),
    ).toMatchObject({ applicable: true, excessDegreesC: 4, points: 6 });
  });
});

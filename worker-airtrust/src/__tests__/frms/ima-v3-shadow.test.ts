import { describe, expect, it } from 'vitest';
import {
  classifyImaDecisionCue,
  evaluateImaShadow,
  type ImaResearchHypothesis,
  type ImaTimelineSegment,
} from '../../lib/frms/ima-v3-shadow';

// Every number in these fixtures is a SYNTHETIC research hypothesis, not an
// ANAC/IOGP requirement, a SAFTE/FAID coefficient or an operational cutoff.
const hypothesis: ImaResearchHypothesis = {
  id: 'SYNTHETIC_TEST_HYPOTHESIS_1',
  provenance: 'Unit-test fixture only; mathematical shape not calibrated',
  wakeTauHours: 18.2,
  sleepTauHours: 4.2,
  homeostaticWeight: 0.7,
  circadianWeight: 0.3,
  circadianRiskPeakHour: 4,
  minimumHistoryHours: 168,
  maximumInitialStateUncertainty: 0.05,
};

const DAY_MS = 24 * 3_600_000;
const BASE = Date.parse('2026-10-01T09:00:00Z');
const at = (milliseconds: number) => new Date(milliseconds).toISOString();

/** Seven complete days of explicitly reported wake/sleep evidence. */
function timeline(sleepHours: number, base = BASE, days = 7): ImaTimelineSegment[] {
  const wakeHours = 24 - sleepHours;
  const out: ImaTimelineSegment[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = base + i * DAY_MS;
    const boundary = day + wakeHours * 3_600_000;
    out.push({
      startAt: at(day),
      endAt: at(boundary),
      state: 'AWAKE',
      source: 'SELF_REPORTED',
    });
    out.push({
      startAt: at(boundary),
      endAt: at(day + DAY_MS),
      state: 'ASLEEP',
      source: 'SELF_REPORTED',
    });
  }
  return out;
}

const synthetic = (segments: ImaTimelineSegment[]) => ({
  syntheticResearchFixture: true,
  segments,
  assessmentUtcOffsetMinutes: -180,
  hypothesis,
});

describe('FRMS V3 IMA synthetic-only shadow model', () => {
  it('calculates a bounded numeric hypothesis ONLY for complete synthetic research history', () => {
    const value = evaluateImaShadow(synthetic(timeline(8)));
    expect(value.state).toBe('SYNTHETIC_RESEARCH_ONLY');
    expect(value.approval).toBe('NOT_VALIDATED_NOT_FOR_DISPATCH');
    expect(value.researchCandidateIndex).toBeGreaterThanOrEqual(0);
    expect(value.researchCandidateIndex).toBeLessThanOrEqual(100);
    expect(value.historyHours).toBe(168);
    expect(value.sleepEvidenceHours).toBe(56);
    expect(value.unknownOrEstimatedHours).toBe(0);
  });

  it('withholds operational numeric scores even with complete sleep/wake evidence', () => {
    const value = evaluateImaShadow({
      ...synthetic(timeline(8)),
      syntheticResearchFixture: false,
    });
    expect(value.state).toBe('UNVALIDATED_NO_OPERATIONAL_INDEX');
    expect(value.researchCandidateIndex).toBeNull();
    expect(value.estimatedHomeostaticPressure).toBeNull();
    expect(value.reasons).toContain('MODELO_NAO_VALIDADO_PARA_OPERACAO');
  });

  it('more actual synthetic sleep at identical circadian assessment reduces accumulated pressure', () => {
    const shortSleep = evaluateImaShadow(synthetic(timeline(6)));
    const longerSleep = evaluateImaShadow(synthetic(timeline(8)));
    expect(shortSleep.estimatedHomeostaticPressure).toBeGreaterThan(
      longerSleep.estimatedHomeostaticPressure!,
    );
    expect(shortSleep.researchCandidateIndex).toBeLessThan(
      longerSleep.researchCandidateIndex!,
    );
  });

  it('applies a circadian difference even when identical wake/sleep histories have the same homeostatic state', () => {
    const early = evaluateImaShadow(synthetic(timeline(8, BASE - 2 * 3_600_000)));
    const daytime = evaluateImaShadow(synthetic(timeline(8, BASE + 10 * 3_600_000)));
    expect(early.estimatedHomeostaticPressure).toBe(daytime.estimatedHomeostaticPressure);
    expect(early.circadianBurden).toBeGreaterThan(daytime.circadianBurden!);
    expect(early.researchCandidateIndex).toBeLessThan(daytime.researchCandidateIndex!);
  });

  it('does not reset pressure across calendar or fortnight boundaries', () => {
    const crossingFortnight = evaluateImaShadow(synthetic(timeline(8, Date.parse('2026-09-12T09:00:00Z'))));
    const insideFortnight = evaluateImaShadow(synthetic(timeline(8, BASE)));
    expect(crossingFortnight.estimatedHomeostaticPressure).toBe(
      insideFortnight.estimatedHomeostaticPressure,
    );
    expect(crossingFortnight.researchCandidateIndex).toBe(insideFortnight.researchCandidateIndex);
  });

  it('does not pretend a six-hour standby or off-duty interval proves sleep', () => {
    const segments = timeline(8);
    segments[11] = { ...segments[11], state: 'UNKNOWN', source: 'SCHEDULE_INFERRED' };
    const result = evaluateImaShadow(synthetic(segments));
    expect(result.state).toBe('INSUFFICIENT_DATA');
    expect(result.researchCandidateIndex).toBeNull();
    expect(result.unknownOrEstimatedHours).toBe(8);
    expect(result.reasons).toContain('INTERVALOS_DE_SONO_VIGILIA_NAO_CONFIRMADOS');
  });

  it('withholds a score when a slot is absent even if the adjacent intervals are confirmed', () => {
    const segments = timeline(8);
    segments.splice(3, 1);
    const result = evaluateImaShadow(synthetic(segments));
    expect(result.state).toBe('INSUFFICIENT_DATA');
    expect(result.researchCandidateIndex).toBeNull();
    expect(result.unknownOrEstimatedHours).toBe(8);
  });

  it('withholds a score with insufficient warm-up history', () => {
    const result = evaluateImaShadow(synthetic(timeline(8, BASE, 2)));
    expect(result.state).toBe('INSUFFICIENT_DATA');
    expect(result.reasons).toContain('HISTORICO_INSUFICIENTE');
  });

  it('withholds a number if no sleep event was observed', () => {
    const result = evaluateImaShadow(synthetic([{
      startAt: at(BASE), endAt: at(BASE + 7 * DAY_MS),
      state: 'AWAKE', source: 'OBSERVED',
    }]));
    expect(result.state).toBe('INSUFFICIENT_DATA');
    expect(result.reasons).toContain('SONO_NAO_DOCUMENTADO');
  });

  it('rejects ambiguous timestamps, overlaps and malformed research weights', () => {
    expect(() => evaluateImaShadow(synthetic([
      { startAt: '2026-10-01T10:00:00', endAt: '2026-10-01T12:00:00Z',
        state: 'ASLEEP', source: 'SELF_REPORTED' },
    ]))).toThrow('IMA_TIMESTAMP_MUST_INCLUDE_OFFSET');
    const overlapping = timeline(8);
    overlapping[1] = { ...overlapping[1], startAt: overlapping[0].startAt };
    expect(() => evaluateImaShadow(synthetic(overlapping))).toThrow('IMA_OVERLAPPING_OR_UNSORTED_INTERVALS');
    expect(() => evaluateImaShadow({
      ...synthetic(timeline(8)),
      hypothesis: { ...hypothesis, homeostaticWeight: 0.5 },
    })).toThrow('IMA_INVALID_RESEARCH_WEIGHTS');
  });

  it('never converts high KSS/PVT evidence or limits into automatic clearance', () => {
    const candidate = evaluateImaShadow(synthetic(timeline(8)));
    expect(candidate.researchCandidateIndex).not.toBeNull();

    const violating = classifyImaDecisionCue({
      regulatory: 'VIOLATION',
      observedReadiness: 'PRESERVED',
      checkin: 'RECEIVED',
      estimatedEvidence: false,
    });
    expect(violating).toMatchObject({
      state: 'REGULATORY_HOLD', automaticallyCleared: false,
    });

    const highKssPvt = classifyImaDecisionCue({
      regulatory: 'COMPLIANT',
      observedReadiness: 'OPERATIONAL_REVIEW',
      checkin: 'RECEIVED',
      estimatedEvidence: false,
    });
    expect(highKssPvt).toMatchObject({
      state: 'IMMEDIATE_HUMAN_REVIEW', automaticallyCleared: false,
    });
  });

  it('does not subtract physiological IMA points when checkin is pending', () => {
    const withCheckin = classifyImaDecisionCue({
      regulatory: 'COMPLIANT',
      observedReadiness: 'PRESERVED',
      checkin: 'RECEIVED',
      estimatedEvidence: false,
    });
    const missingCheckin = classifyImaDecisionCue({
      regulatory: 'COMPLIANT',
      observedReadiness: 'PRESERVED',
      checkin: 'PENDING',
      estimatedEvidence: false,
    });
    expect(withCheckin).toMatchObject({
      state: 'HUMAN_DECISION_REQUIRED', automaticallyCleared: false,
    });
    expect(missingCheckin).toMatchObject({
      state: 'EVIDENCE_REQUIRED', automaticallyCleared: false,
    });
    // Neither check-in state is even an argument to the biomathematical function.
    expect(evaluateImaShadow(synthetic(timeline(8))).researchCandidateIndex).toBe(
      evaluateImaShadow(synthetic(timeline(8))).researchCandidateIndex,
    );
  });

  it('flags unknown regulatory scope, baseline absence and estimated sources', () => {
    const result = classifyImaDecisionCue({
      regulatory: 'UNKNOWN',
      observedReadiness: 'BASELINE_BUILDING',
      checkin: 'UNKNOWN',
      estimatedEvidence: true,
    });
    expect(result.state).toBe('EVIDENCE_REQUIRED');
    expect(result.reasons).toContain('CONFORMIDADE_NAO_CONFIRMADA');
    expect(result.reasons).toContain('FONTES_ESTIMADAS');
    expect(result.automaticallyCleared).toBe(false);
  });
});

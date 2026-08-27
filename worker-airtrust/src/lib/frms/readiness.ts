export const READINESS_PROTOCOL = {
  version: 'airtrust-vigilance-v1',
  scoringVersion: 'readiness-score-v1',
  lapseThresholdMs: 500,
  falseStartThresholdMs: 100,
  minimumBaselineSessions: 5,
} as const;

export type ReadinessTrialOutcome = 'response' | 'lapse' | 'false_start' | 'missed';

export type ReadinessTrial = {
  sequence: number;
  scheduledAtMs: number;
  stimulusAtMs: number;
  responseAtMs: number | null;
  reactionTimeMs: number | null;
  outcome: ReadinessTrialOutcome;
};

export type ReadinessSummary = {
  durationMs: number;
  validTrials: number;
  responseTrials: number;
  lapseCount: number;
  lapseRate: number;
  falseStartCount: number;
  missedCount: number;
  medianRtMs: number | null;
  meanRtMs: number | null;
  p90RtMs: number | null;
  sdRtMs: number | null;
  responseSpeed: number | null;
};

export type ReadinessClassification =
  | 'baseline_building'
  | 'preserved'
  | 'attention'
  | 'operational_review';

export type ReadinessAssessment = {
  classification: ReadinessClassification;
  baselineSessions: number;
  baselineReady: boolean;
  warningSignals: string[];
  criticalSignals: string[];
};

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarizeReadinessTrials(trials: ReadinessTrial[], durationMs: number): ReadinessSummary {
  const reactionTimes = trials
    .filter((trial) => trial.outcome === 'response' || trial.outcome === 'lapse')
    .map((trial) => trial.reactionTimeMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const responseTrials = reactionTimes.length;
  const lapseCount = trials.filter((trial) => trial.outcome === 'lapse').length;
  const falseStartCount = trials.filter((trial) => trial.outcome === 'false_start').length;
  const missedCount = trials.filter((trial) => trial.outcome === 'missed').length;
  const validTrials = responseTrials + missedCount;
  const meanRtMs = responseTrials
    ? reactionTimes.reduce((sum, value) => sum + value, 0) / responseTrials
    : null;
  const variance =
    meanRtMs == null || responseTrials === 0
      ? null
      : reactionTimes.reduce((sum, value) => sum + (value - meanRtMs) ** 2, 0) / responseTrials;

  return {
    durationMs: Math.max(0, Math.round(durationMs)),
    validTrials,
    responseTrials,
    lapseCount,
    lapseRate: validTrials ? lapseCount / validTrials : 0,
    falseStartCount,
    missedCount,
    medianRtMs: quantile(reactionTimes, 0.5),
    meanRtMs,
    p90RtMs: quantile(reactionTimes, 0.9),
    sdRtMs: variance == null ? null : Math.sqrt(variance),
    responseSpeed: meanRtMs && meanRtMs > 0 ? 1000 / meanRtMs : null,
  };
}

export function deriveReadinessAssessment(input: {
  kssScore: number;
  sleepHours: number;
  summary: ReadinessSummary;
  baselineSessions: number;
}): ReadinessAssessment {
  const warningSignals: string[] = [];
  const criticalSignals: string[] = [];

  if (input.kssScore >= 8) criticalSignals.push('kss_high');
  else if (input.kssScore >= 7) warningSignals.push('kss_elevated');

  if (input.sleepHours < 5) criticalSignals.push('sleep_short');
  else if (input.sleepHours < 6) warningSignals.push('sleep_reduced');

  if (input.summary.falseStartCount > 2) warningSignals.push('vigilance_false_starts');
  if (input.summary.lapseRate >= 0.2) warningSignals.push('vigilance_lapses');

  const baselineReady = input.baselineSessions >= READINESS_PROTOCOL.minimumBaselineSessions;
  let classification: ReadinessClassification = 'preserved';

  if (!baselineReady) classification = 'baseline_building';
  if (criticalSignals.length > 0) classification = 'operational_review';
  else if (baselineReady && warningSignals.length >= 2) classification = 'attention';

  return {
    classification,
    baselineSessions: input.baselineSessions,
    baselineReady,
    warningSignals,
    criticalSignals,
  };
}

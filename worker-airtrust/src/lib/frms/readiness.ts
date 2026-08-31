/**
 * Active protocol: `airtrust-pvtb-v2` — AirTrust implementation of the published
 * PVT-B stimulus/response paradigm (Basner, Mollicone & Dinges 2011; PsyToolkit
 * PVT-B), adapted to a one-minute AirTrust operational sampling window. The
 * historical `airtrust-vigilance-v1` (blue-dot stimulus, 2–10 s ISI) is only kept
 * for interpreting already-stored sessions. Individual baseline is computed per
 * protocol version, so v1 sessions never contribute to a v2 baseline.
 */
export const READINESS_PROTOCOL = {
  version: 'airtrust-pvtb-v2',
  scoringVersion: 'readiness-score-v1',
  legacyVersions: ['airtrust-vigilance-v1'] as const,
  defaultDurationMs: 60_000,
  allowedDurationDriftMs: 15_000,
  minimumTrials: 10,
  lapseThresholdMs: 500,
  falseStartThresholdMs: 100,
  responseWindowMs: 30_000,
  minimumBaselineSessions: 5,
} as const;

export const READINESS_PROTOCOL_VERSIONS = [
  READINESS_PROTOCOL.version,
  ...READINESS_PROTOCOL.legacyVersions,
] as const;

export type ReadinessProtocolVersion = (typeof READINESS_PROTOCOL_VERSIONS)[number];

export function isReadinessProtocolVersion(value: unknown): value is ReadinessProtocolVersion {
  return (
    typeof value === 'string' && (READINESS_PROTOCOL_VERSIONS as readonly string[]).includes(value)
  );
}

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

/**
 * Rebuild every outcome from monotonic timestamps. Client-provided outcome and
 * reactionTimeMs are treated as transport/debug data only, never as authoritative.
 *
 * PVT-B V2 has a protocol-specific no-response rule: a presented stimulus that
 * remains unanswered for the 30 s response ceiling is a lapse with RT=30,000 ms.
 * The historical v1 protocol keeps its original `missed` interpretation.
 *
 * V2 also enforces the submitted sampling boundary server-side: scheduled and
 * stimulus timestamps must be inside the submitted sampling duration. Only the
 * response to an already-presented stimulus may extend beyond that boundary, up
 * to the 30-second response ceiling.
 */
export function normalizeReadinessTrials(
  trials: ReadinessTrial[],
  durationMs: number,
  protocolVersion: ReadinessProtocolVersion = READINESS_PROTOCOL.version,
): ReadinessTrial[] {
  const seenSequences = new Set<number>();
  const isV2 = protocolVersion === READINESS_PROTOCOL.version;
  const samplingMaxMs = Math.round(durationMs);
  const responseMaxMs = samplingMaxMs + (isV2 ? READINESS_PROTOCOL.responseWindowMs : 5_000);
  const legacyStimulusMaxMs = responseMaxMs;

  return trials.map((trial) => {
    if (!Number.isInteger(trial.sequence) || trial.sequence <= 0 || seenSequences.has(trial.sequence)) {
      throw new Error('invalid_trial_sequence');
    }
    seenSequences.add(trial.sequence);

    const scheduledMaxMs = isV2 ? samplingMaxMs : legacyStimulusMaxMs;
    if (
      !Number.isFinite(trial.scheduledAtMs) ||
      trial.scheduledAtMs < 0 ||
      trial.scheduledAtMs > scheduledMaxMs
    ) {
      throw new Error('invalid_trial_timing');
    }

    // A response while no stimulus is visible is encoded by the browser with stimulusAtMs = -1.
    if (trial.stimulusAtMs === -1) {
      if (
        trial.responseAtMs == null ||
        !Number.isFinite(trial.responseAtMs) ||
        trial.responseAtMs < 0 ||
        trial.responseAtMs > responseMaxMs
      ) {
        throw new Error('invalid_trial_timing');
      }
      return {
        ...trial,
        reactionTimeMs: 0,
        outcome: 'false_start',
      };
    }

    const stimulusMaxMs = isV2 ? samplingMaxMs : legacyStimulusMaxMs;
    if (
      !Number.isFinite(trial.stimulusAtMs) ||
      trial.stimulusAtMs < 0 ||
      trial.stimulusAtMs > stimulusMaxMs
    ) {
      throw new Error('invalid_trial_timing');
    }

    if (trial.responseAtMs == null) {
      if (isV2) {
        return {
          ...trial,
          reactionTimeMs: READINESS_PROTOCOL.responseWindowMs,
          outcome: 'lapse',
        };
      }
      return {
        ...trial,
        reactionTimeMs: null,
        outcome: 'missed',
      };
    }

    if (
      !Number.isFinite(trial.responseAtMs) ||
      trial.responseAtMs < trial.stimulusAtMs ||
      trial.responseAtMs > responseMaxMs
    ) {
      throw new Error('invalid_trial_timing');
    }

    const reactionTimeMs = Math.round(trial.responseAtMs - trial.stimulusAtMs);
    if (isV2 && reactionTimeMs > READINESS_PROTOCOL.responseWindowMs) {
      throw new Error('invalid_trial_timing');
    }
    const outcome: ReadinessTrialOutcome =
      reactionTimeMs < READINESS_PROTOCOL.falseStartThresholdMs
        ? 'false_start'
        : reactionTimeMs >= READINESS_PROTOCOL.lapseThresholdMs
          ? 'lapse'
          : 'response';

    return {
      ...trial,
      reactionTimeMs,
      outcome,
    };
  });
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

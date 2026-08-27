export type VigilanceTrial = {
  sequence: number;
  scheduledAtMs: number;
  stimulusAtMs: number;
  responseAtMs: number | null;
  reactionTimeMs: number | null;
  outcome: 'response' | 'lapse' | 'false_start' | 'missed';
};

export type VigilanceSummary = {
  protocolVersion: 'airtrust-vigilance-v1';
  durationMs: number;
  completedTrials: number;
  validResponses: number;
  medianReactionTimeMs: number | null;
  meanReactionTimeMs: number | null;
  p90ReactionTimeMs: number | null;
  reactionTimeStdDevMs: number | null;
  lapses: number;
  falseStarts: number;
  missed: number;
  responseSpeedPerSecond: number | null;
  trials: VigilanceTrial[];
};

export const VIGILANCE_PROTOCOL = {
  version: 'airtrust-vigilance-v1' as const,
  defaultDurationMs: 3 * 60 * 1000,
  minInterStimulusMs: 2_000,
  maxInterStimulusMs: 10_000,
  lapseThresholdMs: 500,
  falseStartThresholdMs: 100,
  responseWindowMs: 2_000,
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarizeVigilanceTrials(
  trials: VigilanceTrial[],
  durationMs: number,
): VigilanceSummary {
  const valid = trials
    .filter((trial) => trial.outcome === 'response' || trial.outcome === 'lapse')
    .map((trial) => trial.reactionTimeMs)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  const variance =
    mean == null || valid.length === 0
      ? null
      : valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length;
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const speedValues = valid.filter((value) => value > 0).map((value) => 1000 / value);
  const meanSpeed =
    speedValues.length > 0
      ? speedValues.reduce((sum, value) => sum + value, 0) / speedValues.length
      : null;

  return {
    protocolVersion: VIGILANCE_PROTOCOL.version,
    durationMs,
    completedTrials: trials.length,
    validResponses: valid.length,
    medianReactionTimeMs: median == null ? null : round(median),
    meanReactionTimeMs: mean == null ? null : round(mean),
    p90ReactionTimeMs: percentile(sorted, 0.9),
    reactionTimeStdDevMs: variance == null ? null : round(Math.sqrt(variance)),
    lapses: trials.filter((trial) => trial.outcome === 'lapse').length,
    falseStarts: trials.filter((trial) => trial.outcome === 'false_start').length,
    missed: trials.filter((trial) => trial.outcome === 'missed').length,
    responseSpeedPerSecond: meanSpeed == null ? null : round(meanSpeed, 3),
    trials,
  };
}

export type ReadinessSignal = {
  code: string;
  severity: 'info' | 'attention' | 'review';
  message: string;
};

export type ReadinessAssessment = {
  classification: 'baseline_building' | 'preserved' | 'attention' | 'operational_review';
  signals: ReadinessSignal[];
};

/**
 * V1 deliberately does NOT turn vigilance performance into an automatic fit/unfit decision.
 * Thresholds below are conservative workflow signals only and must be validated prospectively
 * before being used as an operational release criterion. Individual-baseline comparison will
 * supersede these population-style guards when enough observations exist.
 */
export function deriveReadinessAssessment(input: {
  kssScore: number | null;
  sleepHours24h: number | null;
  vigilance: VigilanceSummary | null;
  baselineSessions: number;
}): ReadinessAssessment {
  const signals: ReadinessSignal[] = [];

  if (input.kssScore != null && input.kssScore >= 8) {
    signals.push({ code: 'KSS_HIGH', severity: 'review', message: 'Sonolência subjetiva elevada (KSS ≥ 8).' });
  } else if (input.kssScore != null && input.kssScore >= 7) {
    signals.push({ code: 'KSS_ATTENTION', severity: 'attention', message: 'Sonolência subjetiva requer atenção (KSS 7).' });
  }

  if (input.sleepHours24h != null && input.sleepHours24h < 5) {
    signals.push({ code: 'SLEEP_LOW', severity: 'review', message: 'Sono nas últimas 24 h abaixo de 5 horas.' });
  } else if (input.sleepHours24h != null && input.sleepHours24h < 6) {
    signals.push({ code: 'SLEEP_ATTENTION', severity: 'attention', message: 'Sono nas últimas 24 h abaixo de 6 horas.' });
  }

  if (input.vigilance) {
    if (input.vigilance.falseStarts >= 3) {
      signals.push({ code: 'VIGILANCE_FALSE_STARTS', severity: 'attention', message: 'Múltiplas respostas antecipadas no teste de vigilância.' });
    }
    if (input.vigilance.lapses >= 3 || input.vigilance.missed >= 2) {
      signals.push({ code: 'VIGILANCE_LAPSES', severity: 'attention', message: 'Ocorreram lapsos relevantes no teste de vigilância.' });
    }
  }

  if (input.baselineSessions < 5) {
    signals.push({
      code: 'BASELINE_BUILDING',
      severity: 'info',
      message: `Baseline individual em formação (${input.baselineSessions}/5 sessões mínimas).`,
    });
    return { classification: 'baseline_building', signals };
  }

  if (signals.some((signal) => signal.severity === 'review')) {
    return { classification: 'operational_review', signals };
  }
  if (signals.some((signal) => signal.severity === 'attention')) {
    return { classification: 'attention', signals };
  }
  return { classification: 'preserved', signals };
}

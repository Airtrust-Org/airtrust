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

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
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
    .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);
  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  const variance =
    mean == null || valid.length === 0
      ? null
      : valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length;
  const median = quantile(sorted, 0.5);

  return {
    protocolVersion: VIGILANCE_PROTOCOL.version,
    durationMs: Math.max(0, Math.round(durationMs)),
    completedTrials: trials.length,
    validResponses: valid.length,
    medianReactionTimeMs: median == null ? null : round(median),
    meanReactionTimeMs: mean == null ? null : round(mean),
    p90ReactionTimeMs: quantile(sorted, 0.9),
    reactionTimeStdDevMs: variance == null ? null : round(Math.sqrt(variance)),
    lapses: trials.filter((trial) => trial.outcome === 'lapse').length,
    falseStarts: trials.filter((trial) => trial.outcome === 'false_start').length,
    missed: trials.filter((trial) => trial.outcome === 'missed').length,
    responseSpeedPerSecond: mean != null && mean > 0 ? round(1000 / mean, 3) : null,
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
 * UI-side preview only. The Worker recomputes the authoritative readiness result from
 * raw trials plus the tenant-scoped daily check-in. This helper mirrors those V1 rules
 * so the browser never suggests a weaker state than the server would persist.
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
    if (input.vigilance.falseStarts > 2) {
      signals.push({ code: 'VIGILANCE_FALSE_STARTS', severity: 'attention', message: 'Múltiplas respostas antecipadas no teste de vigilância.' });
    }
    const validTrials = input.vigilance.validResponses + input.vigilance.missed;
    const lapseRate = validTrials > 0 ? input.vigilance.lapses / validTrials : 0;
    if (lapseRate >= 0.2) {
      signals.push({ code: 'VIGILANCE_LAPSES', severity: 'attention', message: 'A proporção de lapsos no teste de vigilância requer atenção.' });
    }
  }

  const baselineReady = input.baselineSessions >= 5;
  if (!baselineReady) {
    signals.push({
      code: 'BASELINE_BUILDING',
      severity: 'info',
      message: `Baseline individual em formação (${input.baselineSessions}/5 sessões mínimas).`,
    });
  }

  if (signals.some((signal) => signal.severity === 'review')) {
    return { classification: 'operational_review', signals };
  }

  const attentionSignals = signals.filter((signal) => signal.severity === 'attention').length;
  if (!baselineReady) {
    return { classification: 'baseline_building', signals };
  }
  if (attentionSignals >= 2) {
    return { classification: 'attention', signals };
  }
  return { classification: 'preserved', signals };
}

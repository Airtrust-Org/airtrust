import { daysBetween, type SimulatorPlanningConfig } from './cae-planning-policy';

export type CaeScoreWeights = {
  outside_preferred_window: number;
  chronological_inversion: number;
  dispersion_per_day: number;
  gap_per_day_after_first: number;
  sessions_per_day_delta: number;
  minutes_per_day_delta_unit: number;
  days_before_expiry: number;
  unused_reserved_minute: number;
};

/**
 * Perfil centralizado. Não espalhar pesos pelo matcher/rotas.
 * Pode futuramente ser promovido a configuração versionada sem alterar o contrato do scorer.
 */
export const CAE_SCORE_WEIGHTS_V1: Readonly<CaeScoreWeights> = Object.freeze({
  outside_preferred_window: 10_000,
  chronological_inversion: 50_000,
  dispersion_per_day: 100,
  gap_per_day_after_first: 200,
  sessions_per_day_delta: 500,
  minutes_per_day_delta_unit: 1,
  days_before_expiry: 150,
  unused_reserved_minute: 1,
});

export type ScoredAssignment = {
  session_index: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  outside_preferred_window?: boolean;
  pairing_preference_penalty?: number;
};

export type AllocationScoreInput = {
  assignments: ScoredAssignment[];
  expiry_date: string;
  config: SimulatorPlanningConfig;
  unused_reserved_minutes?: number;
};

export type AllocationScoreBreakdown = {
  total: number;
  components: {
    outside_preferred_window: number;
    chronological_inversion: number;
    dispersion: number;
    gaps: number;
    daily_grouping: number;
    daily_minutes: number;
    completion_proximity: number;
    pairing: number;
    unused_reserved: number;
  };
};

function timestamp(item: Pick<ScoredAssignment, 'date' | 'start_time'>): number {
  return Date.parse(`${item.date}T${item.start_time}:00Z`);
}

export function calculateCaeAllocationScore(
  input: AllocationScoreInput,
  weights: CaeScoreWeights = CAE_SCORE_WEIGHTS_V1,
): AllocationScoreBreakdown {
  const ordered = [...input.assignments].sort((a, b) => a.session_index - b.session_index);
  const components: AllocationScoreBreakdown['components'] = {
    outside_preferred_window: 0,
    chronological_inversion: 0,
    dispersion: 0,
    gaps: 0,
    daily_grouping: 0,
    daily_minutes: 0,
    completion_proximity: 0,
    pairing: 0,
    unused_reserved: 0,
  };

  for (const assignment of ordered) {
    if (assignment.outside_preferred_window) {
      components.outside_preferred_window += weights.outside_preferred_window;
    }
    components.pairing += Math.max(0, Number(assignment.pairing_preference_penalty || 0));
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (timestamp(current) < timestamp(previous)) {
      components.chronological_inversion += weights.chronological_inversion;
    }
    const gap = daysBetween(previous.date, current.date);
    if (gap > 1) {
      components.gaps += (gap - 1) * weights.gap_per_day_after_first;
    }
  }

  if (ordered.length > 0) {
    const dates = ordered.map((item) => item.date).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    components.dispersion = Math.max(0, daysBetween(first, last)) * weights.dispersion_per_day;

    const daysBeforeExpiry = daysBetween(last, input.expiry_date);
    components.completion_proximity = daysBeforeExpiry < 0
      ? Number.POSITIVE_INFINITY
      : daysBeforeExpiry * weights.days_before_expiry;
  }

  const byDay = new Map<string, { sessions: number; minutes: number }>();
  for (const assignment of ordered) {
    const bucket = byDay.get(assignment.date) || { sessions: 0, minutes: 0 };
    bucket.sessions += 1;
    bucket.minutes += assignment.duration_minutes;
    byDay.set(assignment.date, bucket);
  }

  for (const day of byDay.values()) {
    components.daily_grouping +=
      Math.abs(day.sessions - input.config.preferred_sessions_per_day) * weights.sessions_per_day_delta;
    components.daily_minutes +=
      Math.abs(day.minutes - input.config.preferred_minutes_per_day) * weights.minutes_per_day_delta_unit;
  }

  components.unused_reserved =
    Math.max(0, Number(input.unused_reserved_minutes || 0)) * weights.unused_reserved_minute;

  const values = Object.values(components);
  const total = values.some((value) => !Number.isFinite(value))
    ? Number.POSITIVE_INFINITY
    : values.reduce((sum, value) => sum + value, 0);

  return { total, components };
}

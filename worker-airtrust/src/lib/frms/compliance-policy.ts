/**
 * AirTrust FRMS — compliance policy core.
 *
 * Purpose: keep hard legal/contractual limits separate from the existing
 * biomathematical/business fatigue indicators. A good fatigue score must never
 * compensate for a mandatory limit violation.
 *
 * IMPORTANT: rules with different windows are NOT merged. For example, a
 * calendar-month limit and a rolling-28-day limit are evaluated independently.
 * Only candidates for the exact same metric/window may be reduced to a single
 * "most restrictive" value.
 */

export type RuleSource = 'ANAC' | 'IOGP' | 'OPERATOR' | 'CONTRACT' | 'CBA';
export type LimitDirection = 'MAX' | 'MIN';

export type ComplianceMetric =
  | 'FLIGHT_TIME_DUTY_MIN'
  | 'FLIGHT_TIME_1D_CONSECUTIVE_MIN'
  | 'FLIGHT_TIME_7D_ROLLING_MIN'
  | 'FLIGHT_TIME_28D_ROLLING_MIN'
  | 'FLIGHT_TIME_MONTH_CALENDAR_MIN'
  | 'FLIGHT_TIME_365D_ROLLING_MIN'
  | 'FLIGHT_TIME_YEAR_CALENDAR_MIN'
  | 'FDP_DUTY_MIN'
  | 'WORK_TIME_WEEK_LEGAL_MIN'
  | 'WORK_TIME_7D_ROLLING_MIN'
  | 'WORK_TIME_MONTH_CALENDAR_MIN'
  | 'REST_AFTER_DUTY_MIN'
  | 'REST_PRE_NIGHT_STANDBY_MIN'
  | 'REST_POST_NIGHT_STANDBY_MIN'
  | 'REST_AFTER_ROTATION_TRAVEL_MIN';

export interface LimitCandidate {
  id: string;
  metric: ComplianceMetric;
  direction: LimitDirection;
  limitMin: number;
  source: RuleSource;
  reference: string;
  label: string;
  applicable?: boolean;
  notes?: string;
}

export interface ResolvedLimit {
  metric: ComplianceMetric;
  direction: LimitDirection;
  limitMin: number;
  winningRule: LimitCandidate;
  comparedRules: LimitCandidate[];
}

export type ComplianceStatus = 'COMPLIANT' | 'VIOLATION' | 'UNKNOWN';

export interface ComplianceEvaluation {
  status: ComplianceStatus;
  actualMin: number | null;
  resolved: ResolvedLimit | null;
  reason?: string;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}

/**
 * Resolve the most restrictive candidate for the SAME metric/window.
 * MAX -> smallest limit wins. MIN -> largest minimum wins.
 */
export function resolveMostRestrictiveLimit(
  metric: ComplianceMetric,
  direction: LimitDirection,
  candidates: readonly LimitCandidate[],
): ResolvedLimit | null {
  const applicable = candidates.filter((candidate) => candidate.applicable !== false);

  for (const candidate of applicable) {
    if (candidate.metric !== metric) {
      throw new Error(
        `Cannot compare different metrics/windows: expected ${metric}, got ${candidate.metric}`,
      );
    }
    if (candidate.direction !== direction) {
      throw new Error(
        `Cannot compare different limit directions for ${metric}: expected ${direction}, got ${candidate.direction}`,
      );
    }
    assertFiniteNonNegative(candidate.limitMin, `${candidate.id}.limitMin`);
  }

  if (applicable.length === 0) return null;

  const sorted = [...applicable].sort((a, b) => {
    if (direction === 'MAX') return a.limitMin - b.limitMin;
    return b.limitMin - a.limitMin;
  });

  return {
    metric,
    direction,
    limitMin: sorted[0].limitMin,
    winningRule: sorted[0],
    comparedRules: sorted,
  };
}

export function evaluateResolvedLimit(
  actualMin: number | null | undefined,
  resolved: ResolvedLimit | null,
): ComplianceEvaluation {
  if (actualMin == null || !Number.isFinite(actualMin) || actualMin < 0) {
    return {
      status: 'UNKNOWN',
      actualMin: actualMin ?? null,
      resolved,
      reason: 'ACTUAL_VALUE_MISSING_OR_INVALID',
    };
  }
  if (!resolved) {
    return {
      status: 'UNKNOWN',
      actualMin,
      resolved: null,
      reason: 'NO_APPLICABLE_RULE',
    };
  }

  const violation =
    resolved.direction === 'MAX'
      ? actualMin > resolved.limitMin
      : actualMin < resolved.limitMin;

  return {
    status: violation ? 'VIOLATION' : 'COMPLIANT',
    actualMin,
    resolved,
  };
}

export const IOGP_690_2 = {
  FLIGHT_DUTY_MAX_MIN: 10 * 60,
  FLIGHT_7D_MAX_MIN: 45 * 60,
  FLIGHT_28D_MAX_MIN: 120 * 60,
  FLIGHT_365D_MAX_MIN: 1200 * 60,
  FDP_MAX_MIN: 14 * 60,
  REST_FLOOR_MIN: 10 * 60,
  NIGHT_STANDBY_REST_MIN: 12 * 60,
  ROTATION_TRAVEL_REST_MIN: 10 * 60,
} as const;

/** IOGP 690-2 §18C.4: max(10 h, previous FDP). */
export function iogpRestAfterDutyMin(previousFdpMin: number): number {
  assertFiniteNonNegative(previousFdpMin, 'previousFdpMin');
  return Math.max(IOGP_690_2.REST_FLOOR_MIN, previousFdpMin);
}

export function buildIogp6902CoreCandidates(previousFdpMin?: number): LimitCandidate[] {
  const rules: LimitCandidate[] = [
    {
      id: 'IOGP_17C2_FLIGHT_DUTY',
      metric: 'FLIGHT_TIME_1D_CONSECUTIVE_MIN',
      direction: 'MAX',
      limitMin: IOGP_690_2.FLIGHT_DUTY_MAX_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §17C.2 Table 17-1',
      label: 'Maximum flight time in 1 day',
    },
    {
      id: 'IOGP_17C2_FLIGHT_7D',
      metric: 'FLIGHT_TIME_7D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: IOGP_690_2.FLIGHT_7D_MAX_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §17C.2 Table 17-1',
      label: 'Maximum flight time in 7 consecutive days',
    },
    {
      id: 'IOGP_17C2_FLIGHT_28D',
      metric: 'FLIGHT_TIME_28D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: IOGP_690_2.FLIGHT_28D_MAX_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §17C.2 Table 17-1',
      label: 'Maximum flight time in 28 consecutive days',
    },
    {
      id: 'IOGP_17C2_FLIGHT_365D',
      metric: 'FLIGHT_TIME_365D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: IOGP_690_2.FLIGHT_365D_MAX_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §17C.2 Table 17-1',
      label: 'Maximum flight time in 365 consecutive days',
    },
    {
      id: 'IOGP_18C1_FDP',
      metric: 'FDP_DUTY_MIN',
      direction: 'MAX',
      limitMin: IOGP_690_2.FDP_MAX_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §18C.1-18C.3',
      label: 'Maximum FDP',
    },
    {
      id: 'IOGP_20C1_PRE_NIGHT_STANDBY_REST',
      metric: 'REST_PRE_NIGHT_STANDBY_MIN',
      direction: 'MIN',
      limitMin: IOGP_690_2.NIGHT_STANDBY_REST_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §20C.1',
      label: 'Minimum rest before night standby after day duty',
    },
    {
      id: 'IOGP_20C2_POST_NIGHT_STANDBY_REST',
      metric: 'REST_POST_NIGHT_STANDBY_MIN',
      direction: 'MIN',
      limitMin: IOGP_690_2.NIGHT_STANDBY_REST_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §20C.2',
      label: 'Minimum rest after night call-out FDP',
    },
    {
      id: 'IOGP_19C1_ROTATION_TRAVEL_REST',
      metric: 'REST_AFTER_ROTATION_TRAVEL_MIN',
      direction: 'MIN',
      limitMin: IOGP_690_2.ROTATION_TRAVEL_REST_MIN,
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §19C.1',
      label: 'Minimum rest after prolonged/overnight/>4 time-zone travel',
    },
  ];

  if (previousFdpMin != null) {
    rules.push({
      id: 'IOGP_18C4_REST_AFTER_DUTY',
      metric: 'REST_AFTER_DUTY_MIN',
      direction: 'MIN',
      limitMin: iogpRestAfterDutyMin(previousFdpMin),
      source: 'IOGP',
      reference: 'IOGP Report 690-2 §18C.4',
      label: 'Minimum rest after duty',
    });
  }

  return rules;
}

export type AnacBasicHelicopterService = 'RBAC117_117_1_B1' | 'RBAC117_117_1_B2_TO_B6';

/**
 * RBAC 117 EMD 01 Appendix A / Lei 13.475 basic helicopter daily flight time.
 * b(1) -> 7 h; b(2)..b(6) -> 8 h.
 */
export function anacBasicHelicopterDailyFlightMaxMin(
  service: AnacBasicHelicopterService,
): number {
  return service === 'RBAC117_117_1_B1' ? 7 * 60 : 8 * 60;
}

/** RBAC 117 EMD 01 A117.23(b) / Lei 13.475: 12 h / 16 h / 24 h. */
export function anacBasicRestAfterDutyMin(previousDutyMin: number): number {
  assertFiniteNonNegative(previousDutyMin, 'previousDutyMin');
  if (previousDutyMin <= 12 * 60) return 12 * 60;
  if (previousDutyMin <= 15 * 60) return 16 * 60;
  return 24 * 60;
}

export interface BasicAnacContext {
  service: AnacBasicHelicopterService;
  /** Simple/minimum crew FDP for the operation category, in minutes. */
  fdpMaxMin: number;
  previousDutyMin?: number;
}

/**
 * Core basic ANAC candidates. Calendar windows deliberately remain distinct
 * from IOGP rolling windows.
 */
export function buildAnacBasicHelicopterCandidates(
  context: BasicAnacContext,
): LimitCandidate[] {
  assertFiniteNonNegative(context.fdpMaxMin, 'fdpMaxMin');
  const rules: LimitCandidate[] = [
    {
      id: 'ANAC_BASIC_HELI_FLIGHT_DUTY',
      metric: 'FLIGHT_TIME_DUTY_MIN',
      direction: 'MAX',
      limitMin: anacBasicHelicopterDailyFlightMaxMin(context.service),
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 A117.13 Table A.1/A.2; Lei 13.475 arts. 31/32',
      label: 'Basic helicopter maximum flight time in one duty',
    },
    {
      id: 'ANAC_BASIC_HELI_FLIGHT_MONTH',
      metric: 'FLIGHT_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 90 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 A117.13(c) Table A.3; Lei 13.475 art. 33(IV)',
      label: 'Basic helicopter monthly flight-time limit',
    },
    {
      id: 'ANAC_BASIC_HELI_FLIGHT_YEAR',
      metric: 'FLIGHT_TIME_YEAR_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 930 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 A117.13(c) Table A.3; Lei 13.475 art. 33(IV)',
      label: 'Basic helicopter annual flight-time limit',
    },
    {
      id: 'ANAC_BASIC_FDP',
      metric: 'FDP_DUTY_MIN',
      direction: 'MAX',
      limitMin: context.fdpMaxMin,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 A117.15 / applicable approved operator manual',
      label: 'Basic maximum duty period',
    },
    {
      id: 'ANAC_BASIC_WORK_7D',
      metric: 'WORK_TIME_WEEK_LEGAL_MIN',
      direction: 'MAX',
      limitMin: 44 * 60,
      source: 'ANAC',
      reference: 'Lei 13.475 art. 41 / RBAC 117 Appendix A as applicable',
      label: 'Weekly work-time limit',
      notes: 'May be altered by collective agreement within regulatory parameters.',
    },
    {
      id: 'ANAC_BASIC_WORK_MONTH',
      metric: 'WORK_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 176 * 60,
      source: 'ANAC',
      reference: 'Lei 13.475 art. 41 / RBAC 117 Appendix A as applicable',
      label: 'Monthly work-time limit',
    },
  ];

  if (context.previousDutyMin != null) {
    rules.push({
      id: 'ANAC_BASIC_REST_AFTER_DUTY',
      metric: 'REST_AFTER_DUTY_MIN',
      direction: 'MIN',
      limitMin: anacBasicRestAfterDutyMin(context.previousDutyMin),
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 A117.23(b); Lei 13.475 art. 48',
      label: 'Basic minimum rest after duty',
    });
  }

  return rules;
}

/** B/C cumulative helicopter limits. Use only when the approved profile is B/C. */
export function buildAnacRbac117BcHelicopterCumulativeCandidates(): LimitCandidate[] {
  return [
    {
      id: 'ANAC_BC_HELI_FLIGHT_28D',
      metric: 'FLIGHT_TIME_28D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: 93 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.25/C117.25',
      label: 'Helicopter flight time in any 28 consecutive days',
    },
    {
      id: 'ANAC_BC_HELI_FLIGHT_365D',
      metric: 'FLIGHT_TIME_365D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: 930 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.25/C117.25',
      label: 'Helicopter flight time in any 365 consecutive days',
    },
    {
      id: 'ANAC_BC_WORK_7D',
      metric: 'WORK_TIME_7D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: 60 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.27/C117.27',
      label: 'Work time in any 7 consecutive days',
    },
  ];
}

export interface AppendixCLimit {
  fdpMaxMin: number;
  flightMaxMin: number;
}

function hhmmToMinuteOfDay(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Invalid HH:MM: ${hhmm}`);
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) throw new Error(`Invalid HH:MM: ${hhmm}`);
  return hh * 60 + mm;
}

function sectorColumn(sectorCount: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isInteger(sectorCount) || sectorCount < 1) {
    throw new Error('sectorCount must be an integer >= 1');
  }
  if (sectorCount <= 2) return 0;
  if (sectorCount <= 4) return 1;
  if (sectorCount === 5) return 2;
  if (sectorCount === 6) return 3;
  return 4;
}

const APPENDIX_C_TABLE: ReadonlyArray<{
  startMin: number;
  endMin: number;
  wraps?: boolean;
  values: readonly AppendixCLimit[];
}> = [
  { startMin: 6 * 60 + 1, endMin: 6 * 60 + 59, values: [
    { fdpMaxMin: 660, flightMaxMin: 540 }, { fdpMaxMin: 660, flightMaxMin: 540 },
    { fdpMaxMin: 600, flightMaxMin: 480 }, { fdpMaxMin: 540, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 },
  ] },
  { startMin: 7 * 60, endMin: 7 * 60 + 59, values: [
    { fdpMaxMin: 780, flightMaxMin: 570 }, { fdpMaxMin: 720, flightMaxMin: 540 },
    { fdpMaxMin: 660, flightMaxMin: 540 }, { fdpMaxMin: 600, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 },
  ] },
  { startMin: 8 * 60, endMin: 11 * 60 + 59, values: [
    { fdpMaxMin: 780, flightMaxMin: 600 }, { fdpMaxMin: 780, flightMaxMin: 570 },
    { fdpMaxMin: 720, flightMaxMin: 540 }, { fdpMaxMin: 660, flightMaxMin: 540 },
    { fdpMaxMin: 600, flightMaxMin: 480 },
  ] },
  { startMin: 12 * 60, endMin: 13 * 60 + 59, values: [
    { fdpMaxMin: 720, flightMaxMin: 570 }, { fdpMaxMin: 720, flightMaxMin: 540 },
    { fdpMaxMin: 660, flightMaxMin: 540 }, { fdpMaxMin: 600, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 },
  ] },
  { startMin: 14 * 60, endMin: 15 * 60 + 59, values: [
    { fdpMaxMin: 660, flightMaxMin: 540 }, { fdpMaxMin: 660, flightMaxMin: 540 },
    { fdpMaxMin: 600, flightMaxMin: 480 }, { fdpMaxMin: 540, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 },
  ] },
  { startMin: 16 * 60, endMin: 17 * 60 + 59, values: [
    { fdpMaxMin: 600, flightMaxMin: 480 }, { fdpMaxMin: 600, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 }, { fdpMaxMin: 540, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 480 },
  ] },
  { startMin: 18 * 60, endMin: 6 * 60, wraps: true, values: [
    { fdpMaxMin: 540, flightMaxMin: 480 }, { fdpMaxMin: 540, flightMaxMin: 480 },
    { fdpMaxMin: 540, flightMaxMin: 420 }, { fdpMaxMin: 540, flightMaxMin: 420 },
    { fdpMaxMin: 540, flightMaxMin: 420 },
  ] },
];

/**
 * RBAC 117 EMD 01 Table C.1. This table is a substitute rule and must only be
 * used when Appendix C is actually approved/applicable for the operator.
 */
export function rbac117AppendixCLimit(localDutyStart: string, sectorCount: number): AppendixCLimit {
  const minute = hhmmToMinuteOfDay(localDutyStart);
  const column = sectorColumn(sectorCount);
  const row = APPENDIX_C_TABLE.find((candidate) => {
    if (candidate.wraps) return minute >= candidate.startMin || minute <= candidate.endMin;
    return minute >= candidate.startMin && minute <= candidate.endMin;
  });
  if (!row) throw new Error(`No RBAC 117 Appendix C row for ${localDutyStart}`);
  return row.values[column];
}

export interface RegulatoryProfileState {
  profileCode: 'ANAC_BASIC' | 'RBAC117_B' | 'RBAC117_C' | 'SGRF_CUSTOM' | null;
  documentedReference?: string | null;
}

/** Fail closed: without the active documented profile, final regulatory compliance is unknown. */
export function regulatoryProfileIsReady(state: RegulatoryProfileState): boolean {
  return Boolean(state.profileCode && state.documentedReference?.trim());
}

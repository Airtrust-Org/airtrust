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

/** Proveniência da regra; Lei, RBAC/ANAC e instrumentos coletivos ficam separados. */
export type RuleSource =
  | 'LAW'
  | 'ANAC'
  | 'ACT'
  | 'CCT'
  | 'IOGP'
  | 'OPERATOR'
  | 'CONTRACT'
  | 'CBA';
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
  | 'WORK_TIME_14D_ROLLING_MIN'
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
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 32 IV; RBAC 117 EMD 01 A117.13',
      label: 'Basic helicopter maximum flight time in one duty',
    },
    {
      id: 'ANAC_BASIC_HELI_FLIGHT_MONTH',
      metric: 'FLIGHT_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 90 * 60,
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 33 IV; RBAC 117 EMD 01 A117.13(c)',
      label: 'Basic helicopter monthly flight-time limit',
    },
    {
      id: 'ANAC_BASIC_HELI_FLIGHT_YEAR',
      metric: 'FLIGHT_TIME_YEAR_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 930 * 60,
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 33 IV; RBAC 117 EMD 01 A117.13(c)',
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
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 41',
      label: 'Weekly work-time limit',
      notes: 'May be altered by collective agreement within regulatory parameters.',
    },
    {
      id: 'ANAC_BASIC_WORK_MONTH',
      metric: 'WORK_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 176 * 60,
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 41',
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

export const COSTA_DO_SOL_ACT_2025_2027 = 'COSTA_DO_SOL_ACT_2025_2027' as const;

/**
 * Compatibilidade explícita de tenant enquanto o código do instrumento coletivo
 * ainda não foi materializado no perfil regulatório. A decisão fica centralizada
 * aqui para não espalhar `empresa_id === 6` pelo motor.
 */
export function resolveCollectiveAgreementCode(input: {
  empresaId: number;
  limitsJson?: string | null;
}): string | null {
  const raw = input.limitsJson?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const explicit = parsed.collective_agreement_code ?? parsed.collectiveAgreementCode;
      if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toUpperCase();
    } catch {
      // Perfil malformado não autoriza inferência de instrumento coletivo.
      return null;
    }
  }
  return input.empresaId === 6 ? COSTA_DO_SOL_ACT_2025_2027 : null;
}

export function costaDoSolAct2025_2027Applies(input: {
  empresaId: number;
  limitsJson?: string | null;
}): boolean {
  return resolveCollectiveAgreementCode(input) === COSTA_DO_SOL_ACT_2025_2027;
}

/**
 * ACT Costa do Sol Táxi Aéreo S.A. 2025/2027 (01/12/2025–30/11/2027).
 * Cláusula 8ª: 44 h semanais e 176 h mensais, com a composição de trabalho do ACT.
 * Cláusula 9ª §2º: em regime de missão, 44 h/semana não se aplica; 176 h/mês permanece.
 */
export function buildCostaDoSolAct2025_2027WorkCandidates(input: {
  regimeMissao: boolean;
}): LimitCandidate[] {
  return [
    {
      id: 'ACT_CDS_2025_2027_WORK_WEEK',
      metric: 'WORK_TIME_WEEK_LEGAL_MIN',
      direction: 'MAX',
      limitMin: 44 * 60,
      source: 'ACT',
      reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 8ª e cláusula 9ª §2º',
      label: 'Limite semanal de trabalho do ACT Costa do Sol',
      applicable: !input.regimeMissao,
      notes: 'No regime de missão, o ACT afasta 44 h/semana; 176 h/mês permanece obrigatório.',
    },
    {
      id: 'ACT_CDS_2025_2027_WORK_MONTH',
      metric: 'WORK_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 176 * 60,
      source: 'ACT',
      reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 8ª e cláusula 9ª §2º',
      label: 'Limite mensal de trabalho do ACT Costa do Sol',
    },
  ];
}

export interface CostaDoSolMissionComplianceInput {
  consecutiveMissionDays: number | null | undefined;
  consecutiveEffectiveDaysAtOperation: number | null | undefined;
}

export interface CostaDoSolMissionComplianceResult {
  status: ComplianceStatus;
  violations: Array<{
    code: 'ACT_CDS_MISSION_21D' | 'ACT_CDS_EFFECTIVE_17D';
    actualDays: number;
    limitDays: number;
    source: 'ACT';
    reference: string;
  }>;
  reason?: string;
}

/** ACT Costa do Sol 2025/2027, cláusula 9ª: 21 dias de missão / 17 efetivos no local. */
export function evaluateCostaDoSolMissionCompliance(
  input: CostaDoSolMissionComplianceInput,
): CostaDoSolMissionComplianceResult {
  const mission = input.consecutiveMissionDays;
  const effective = input.consecutiveEffectiveDaysAtOperation;
  if (mission == null || effective == null || !Number.isFinite(mission) ||
      !Number.isFinite(effective) || mission < 0 || effective < 0) {
    return { status: 'UNKNOWN', violations: [], reason: 'MISSION_WINDOW_MISSING_OR_INVALID' };
  }
  const violations: CostaDoSolMissionComplianceResult['violations'] = [];
  if (mission > 21) violations.push({
    code: 'ACT_CDS_MISSION_21D', actualDays: mission, limitDays: 21, source: 'ACT',
    reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 9ª caput',
  });
  if (effective > 17) violations.push({
    code: 'ACT_CDS_EFFECTIVE_17D', actualDays: effective, limitDays: 17, source: 'ACT',
    reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 9ª caput',
  });
  return { status: violations.length ? 'VIOLATION' : 'COMPLIANT', violations };
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
    {
      id: 'ANAC_BC_WORK_14D',
      metric: 'WORK_TIME_14D_ROLLING_MIN',
      direction: 'MAX',
      limitMin: 100 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.27/C117.27',
      label: 'Work time in any 14 consecutive days',
    },
    {
      id: 'ANAC_BC_WORK_MONTH',
      metric: 'WORK_TIME_MONTH_CALENDAR_MIN',
      direction: 'MAX',
      limitMin: 176 * 60,
      source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.27/C117.27',
      label: 'Monthly work-time limit under RBAC 117 B/C',
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

export type Rbac117Appendix = 'A' | 'B' | 'C' | 'D' | 'E';

export interface RegulatoryProfileState {
  profileCode: string | null;
  documentedReference?: string | null;
  sourceDocumentHash?: string | null;
  limitsJson?: string | null;
}

function normalizeAppendixToken(value: unknown): Rbac117Appendix | null {
  const text = String(value ?? '').trim().toUpperCase();
  const match = /^(?:APENDICE|APÊNDICE|APPENDIX|RBAC117[_-]?)?\s*([ABCDE])$/.exec(text);
  return match ? (match[1] as Rbac117Appendix) : null;
}

/**
 * Resolve somente apêndices explicitamente persistidos no perfil regulatório.
 * O nome comercial do perfil (ex.: HELICOPTER_OFFSHORE) nunca implica B/C.
 */
export function resolveDocumentedRbac117Appendices(
  state: Pick<RegulatoryProfileState, 'limitsJson'>,
): ReadonlySet<Rbac117Appendix> {
  const raw = state.limitsJson?.trim();
  if (!raw) return new Set<Rbac117Appendix>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set<Rbac117Appendix>();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set<Rbac117Appendix>();
  const record = parsed as Record<string, unknown>;
  const candidates = [
    record.rbac117_appendices,
    record.rbac117Appendices,
    record.applicable_appendices,
    record.applicableAppendices,
    record.appendices,
    record.appendix,
  ];
  const out = new Set<Rbac117Appendix>();
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : candidate == null ? [] : [candidate];
    for (const value of values) {
      const normalized = normalizeAppendixToken(value);
      if (normalized) out.add(normalized);
    }
  }
  return out;
}

export function regulatoryProfileHasDocumentedAppendix(
  state: Pick<RegulatoryProfileState, 'limitsJson'>,
  ...appendices: Rbac117Appendix[]
): boolean {
  const documented = resolveDocumentedRbac117Appendices(state);
  return appendices.some((appendix) => documented.has(appendix));
}

/** Fail closed: without the active documented profile, final regulatory compliance is unknown. */
export function regulatoryProfileIsReady(state: RegulatoryProfileState): boolean {
  return Boolean(state.profileCode && state.documentedReference?.trim());
}

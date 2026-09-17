/**
 * FRMS Operational Policy V2 — governed coefficients only.
 *
 * This module contains formulas, not operational numeric defaults. Every
 * coefficient is resolved from the immutable tenant/profile revision.
 */

export const FRMS_POLICY_V2_KEYS = [
  'FRMS_V2_ENABLED',
  'LANDINGS_NEUTRAL_MAX',
  'LANDINGS_PENALTY_PER_EXCESS',
  'LANDINGS_PENALTY_CAP_POINTS',
  'TEMP_BAND1_MIN_C',
  'TEMP_BAND2_MIN_C',
  'TEMP_BAND3_MIN_C',
  'TEMP_BAND4_MIN_C',
  'TEMP_BAND1_DELTA_POINTS',
  'TEMP_BAND2_DELTA_POINTS',
  'TEMP_BAND3_DELTA_POINTS',
  'TEMP_BAND4_DELTA_POINTS',
  'TEMP_PENALTY_CAP_POINTS',
  'IMC_VISIBILITY_THRESHOLD_M',
  'IMC_CEILING_THRESHOLD_FT',
  'IMC_DEPARTURE_DELTA_POINTS',
  'IMC_ARRIVAL_DELTA_POINTS',
  'IMC_LEG_CAP_POINTS',
  'IMC_DAY_CAP_POINTS',
  'RECOVERY_HOTEL_MAX_POINTS',
  'RECOVERY_ONSITE_MAX_POINTS',
  'RECOVERY_IMMEDIATE_CALLOUT_MULTIPLIER',
  'RECOVERY_NO_WORK_MIN_HOURS',
  'RECOVERY_ABSOLUTE_REST_MIN_HOURS',
  'RECOVERY_ABSOLUTE_REST_MID_HOURS',
  'RECOVERY_ABSOLUTE_REST_FULL_HOURS',
  'RECOVERY_ABSOLUTE_REST_LOW_FACTOR',
  'RECOVERY_ABSOLUTE_REST_MID_FACTOR',
  'HV_CREDIT_THRESHOLD_MINUTES',
  'HV_CREDIT_MAX_POINTS',
  'HV_NEUTRAL_MAX_MINUTES',
  'HV_PENALTY_PER_EXCESS_HOUR_POINTS',
  'HV_PENALTY_CAP_POINTS',
  'PRESENTATION_NIGHT_START_HOUR',
  'PRESENTATION_NIGHT_END_HOUR',
  'PRESENTATION_NIGHT_DELTA_POINTS',
  'ACCUMULATION_WINDOW_MODE',
  'ACCUMULATION_USE_MONTH_CALENDAR',
  'ACCUMULATION_USE_YEAR_CALENDAR',
  'ACCUMULATION_USE_28D_ROLLING',
  'ACCUMULATION_USE_365D_ROLLING',
] as const;

export type FrmsPolicyV2Key = (typeof FRMS_POLICY_V2_KEYS)[number];

export interface FrmsOperationalPolicyV2 {
  enabled: boolean;
  landingsNeutralMax: number;
  landingsPenaltyPerExcess: number;
  landingsPenaltyCapPoints: number;
  tempBandMinC: [number, number, number, number];
  tempBandDeltaPoints: [number, number, number, number];
  tempPenaltyCapPoints: number;
  imcVisibilityThresholdM: number;
  imcCeilingThresholdFt: number;
  imcDepartureDeltaPoints: number;
  imcArrivalDeltaPoints: number;
  imcLegCapPoints: number;
  imcDayCapPoints: number;
  recoveryHotelMaxPoints: number;
  recoveryOnsiteMaxPoints: number;
  recoveryImmediateCalloutMultiplier: number;
  recoveryNoWorkMinHours: number;
  recoveryAbsoluteRestMinHours: number;
  recoveryAbsoluteRestMidHours: number;
  recoveryAbsoluteRestFullHours: number;
  recoveryAbsoluteRestLowFactor: number;
  recoveryAbsoluteRestMidFactor: number;
  hvCreditThresholdMinutes: number;
  hvCreditMaxPoints: number;
  hvNeutralMaxMinutes: number;
  hvPenaltyPerExcessHourPoints: number;
  hvPenaltyCapPoints: number;
  presentationNightStartHour: number;
  presentationNightEndHour: number;
  presentationNightDeltaPoints: number;
  accumulationWindowMode: 0 | 1 | 2;
  accumulationUseMonthCalendar: boolean;
  accumulationUseYearCalendar: boolean;
  accumulationUse28dRolling: boolean;
  accumulationUse365dRolling: boolean;
}

function requireFinite(values: Readonly<Record<string, number>>, key: FrmsPolicyV2Key): number {
  const value = values[key];
  if (!Number.isFinite(value)) throw new Error(`FRMS_PARAMETER_REQUIRED_MISSING:${key}`);
  return Number(value);
}

export function resolveOperationalPolicyV2(values: Readonly<Record<string, number>>): FrmsOperationalPolicyV2 {
  for (const key of FRMS_POLICY_V2_KEYS) requireFinite(values, key);
  const mode = requireFinite(values, 'ACCUMULATION_WINDOW_MODE');
  if (![0, 1, 2].includes(mode)) throw new Error('FRMS_PARAMETER_INVALID_VALUE:ACCUMULATION_WINDOW_MODE');
  const tempMin: [number, number, number, number] = [
    requireFinite(values, 'TEMP_BAND1_MIN_C'), requireFinite(values, 'TEMP_BAND2_MIN_C'),
    requireFinite(values, 'TEMP_BAND3_MIN_C'), requireFinite(values, 'TEMP_BAND4_MIN_C'),
  ];
  if (!(tempMin[0] < tempMin[1] && tempMin[1] < tempMin[2] && tempMin[2] < tempMin[3])) {
    throw new Error('FRMS_PARAMETER_INVALID_VALUE:TEMPERATURE_BANDS');
  }
  const minRest = requireFinite(values, 'RECOVERY_ABSOLUTE_REST_MIN_HOURS');
  const midRest = requireFinite(values, 'RECOVERY_ABSOLUTE_REST_MID_HOURS');
  const fullRest = requireFinite(values, 'RECOVERY_ABSOLUTE_REST_FULL_HOURS');
  if (!(minRest < midRest && midRest < fullRest)) {
    throw new Error('FRMS_PARAMETER_INVALID_VALUE:RECOVERY_ABSOLUTE_REST_BANDS');
  }
  return Object.freeze({
    enabled: requireFinite(values, 'FRMS_V2_ENABLED') === 1,
    landingsNeutralMax: requireFinite(values, 'LANDINGS_NEUTRAL_MAX'),
    landingsPenaltyPerExcess: Math.abs(requireFinite(values, 'LANDINGS_PENALTY_PER_EXCESS')),
    landingsPenaltyCapPoints: Math.abs(requireFinite(values, 'LANDINGS_PENALTY_CAP_POINTS')),
    tempBandMinC: tempMin,
    tempBandDeltaPoints: [
      requireFinite(values, 'TEMP_BAND1_DELTA_POINTS'), requireFinite(values, 'TEMP_BAND2_DELTA_POINTS'),
      requireFinite(values, 'TEMP_BAND3_DELTA_POINTS'), requireFinite(values, 'TEMP_BAND4_DELTA_POINTS'),
    ] as [number, number, number, number],
    tempPenaltyCapPoints: Math.abs(requireFinite(values, 'TEMP_PENALTY_CAP_POINTS')),
    imcVisibilityThresholdM: requireFinite(values, 'IMC_VISIBILITY_THRESHOLD_M'),
    imcCeilingThresholdFt: requireFinite(values, 'IMC_CEILING_THRESHOLD_FT'),
    imcDepartureDeltaPoints: requireFinite(values, 'IMC_DEPARTURE_DELTA_POINTS'),
    imcArrivalDeltaPoints: requireFinite(values, 'IMC_ARRIVAL_DELTA_POINTS'),
    imcLegCapPoints: Math.abs(requireFinite(values, 'IMC_LEG_CAP_POINTS')),
    imcDayCapPoints: Math.abs(requireFinite(values, 'IMC_DAY_CAP_POINTS')),
    recoveryHotelMaxPoints: Math.abs(requireFinite(values, 'RECOVERY_HOTEL_MAX_POINTS')),
    recoveryOnsiteMaxPoints: Math.abs(requireFinite(values, 'RECOVERY_ONSITE_MAX_POINTS')),
    recoveryImmediateCalloutMultiplier: requireFinite(values, 'RECOVERY_IMMEDIATE_CALLOUT_MULTIPLIER'),
    recoveryNoWorkMinHours: requireFinite(values, 'RECOVERY_NO_WORK_MIN_HOURS'),
    recoveryAbsoluteRestMinHours: minRest,
    recoveryAbsoluteRestMidHours: midRest,
    recoveryAbsoluteRestFullHours: fullRest,
    recoveryAbsoluteRestLowFactor: requireFinite(values, 'RECOVERY_ABSOLUTE_REST_LOW_FACTOR'),
    recoveryAbsoluteRestMidFactor: requireFinite(values, 'RECOVERY_ABSOLUTE_REST_MID_FACTOR'),
    hvCreditThresholdMinutes: requireFinite(values, 'HV_CREDIT_THRESHOLD_MINUTES'),
    hvCreditMaxPoints: Math.abs(requireFinite(values, 'HV_CREDIT_MAX_POINTS')),
    hvNeutralMaxMinutes: requireFinite(values, 'HV_NEUTRAL_MAX_MINUTES'),
    hvPenaltyPerExcessHourPoints: Math.abs(requireFinite(values, 'HV_PENALTY_PER_EXCESS_HOUR_POINTS')),
    hvPenaltyCapPoints: Math.abs(requireFinite(values, 'HV_PENALTY_CAP_POINTS')),
    presentationNightStartHour: requireFinite(values, 'PRESENTATION_NIGHT_START_HOUR'),
    presentationNightEndHour: requireFinite(values, 'PRESENTATION_NIGHT_END_HOUR'),
    presentationNightDeltaPoints: requireFinite(values, 'PRESENTATION_NIGHT_DELTA_POINTS'),
    accumulationWindowMode: mode as 0 | 1 | 2,
    accumulationUseMonthCalendar: requireFinite(values, 'ACCUMULATION_USE_MONTH_CALENDAR') === 1,
    accumulationUseYearCalendar: requireFinite(values, 'ACCUMULATION_USE_YEAR_CALENDAR') === 1,
    accumulationUse28dRolling: requireFinite(values, 'ACCUMULATION_USE_28D_ROLLING') === 1,
    accumulationUse365dRolling: requireFinite(values, 'ACCUMULATION_USE_365D_ROLLING') === 1,
  });
}

export function computeLandingsDeltaPoints(countInput: number, p: FrmsOperationalPolicyV2): number {
  const count = Number.isFinite(countInput) ? Math.max(0, Math.floor(countInput)) : 0;
  const excess = Math.max(0, count - p.landingsNeutralMax);
  const penalty = Math.min(p.landingsPenaltyCapPoints, excess * p.landingsPenaltyPerExcess);
  return penalty === 0 ? 0 : -penalty;
}

export function computeTemperatureDeltaPoints(tempC: number | null, p: FrmsOperationalPolicyV2): number {
  if (tempC == null || !Number.isFinite(tempC)) return 0;
  const [a, b, c, d] = p.tempBandMinC;
  let delta = 0;
  if (tempC >= d) delta = p.tempBandDeltaPoints[3];
  else if (tempC >= c) delta = p.tempBandDeltaPoints[2];
  else if (tempC >= b) delta = p.tempBandDeltaPoints[1];
  else if (tempC >= a) delta = p.tempBandDeltaPoints[0];
  return Math.max(-p.tempPenaltyCapPoints, Math.min(0, delta));
}

export type MetarCondition = 'VMC' | 'IMC' | 'INDETERMINATE';
export interface MetarConditionResult {
  condition: MetarCondition;
  visibilityM: number | null;
  ceilingFt: number | null;
  cavok: boolean;
}

export function classifyMetarCondition(raw: string | null | undefined, p: FrmsOperationalPolicyV2): MetarConditionResult {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return { condition: 'INDETERMINATE', visibilityM: null, ceilingFt: null, cavok: false };
  if (/\bCAVOK\b/.test(text)) return { condition: 'VMC', visibilityM: 10000, ceilingFt: null, cavok: true };
  const visibilityTokens = [...text.matchAll(/(?:^|\s)(\d{4})(?=\s|$)/g)]
    .map((m) => Number(m[1])).filter((v) => Number.isFinite(v) && v >= 0 && v <= 9999);
  const visibilityM = visibilityTokens.length ? Math.max(...visibilityTokens) : null;
  const layers = [...text.matchAll(/\b(?:BKN|OVC|VV)(\d{3}|\/\/\/)/g)]
    .map((m) => (m[1] === '///' ? null : Number(m[1]) * 100))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const ceilingFt = layers.length ? Math.min(...layers) : null;
  if (visibilityM != null && visibilityM < p.imcVisibilityThresholdM) {
    return { condition: 'IMC', visibilityM, ceilingFt, cavok: false };
  }
  if (ceilingFt != null && ceilingFt < p.imcCeilingThresholdFt) {
    return { condition: 'IMC', visibilityM, ceilingFt, cavok: false };
  }
  // We need at least one usable meteorological discriminator to call VMC.
  if (visibilityM != null || ceilingFt != null || /\b(?:SKC|NSC|NCD|FEW\d{3}|SCT\d{3})\b/.test(text)) {
    return { condition: 'VMC', visibilityM, ceilingFt, cavok: false };
  }
  return { condition: 'INDETERMINATE', visibilityM, ceilingFt, cavok: false };
}

export interface ImcLegInput {
  legId: string;
  departureRawMetar?: string | null;
  arrivalRawMetar?: string | null;
  departureStationIcao?: string | null;
  arrivalStationIcao?: string | null;
  departureObservedAtUtc?: string | null;
  arrivalObservedAtUtc?: string | null;
  departureEventAtUtc?: string | null;
  arrivalEventAtUtc?: string | null;
}
export interface ImcLegResult {
  legId: string;
  departure: MetarConditionResult;
  arrival: MetarConditionResult;
  departureDelta: number;
  arrivalDelta: number;
  totalDelta: number;
  departureRawMetar: string | null;
  arrivalRawMetar: string | null;
  departureStationIcao: string | null;
  arrivalStationIcao: string | null;
  departureObservedAtUtc: string | null;
  arrivalObservedAtUtc: string | null;
  departureEventAtUtc: string | null;
  arrivalEventAtUtc: string | null;
}
export function computeImcDelta(legs: readonly ImcLegInput[], p: FrmsOperationalPolicyV2): { totalDelta: number; legs: ImcLegResult[] } {
  const out = legs.map((leg): ImcLegResult => {
    const departure = classifyMetarCondition(leg.departureRawMetar, p);
    const arrival = classifyMetarCondition(leg.arrivalRawMetar, p);
    const departureDelta = departure.condition === 'IMC' ? Math.min(0, p.imcDepartureDeltaPoints) : 0;
    const arrivalDelta = arrival.condition === 'IMC' ? Math.min(0, p.imcArrivalDeltaPoints) : 0;
    const totalDelta = Math.max(-p.imcLegCapPoints, departureDelta + arrivalDelta);
    return {
      legId: leg.legId, departure, arrival, departureDelta, arrivalDelta, totalDelta,
      departureRawMetar: leg.departureRawMetar ?? null,
      arrivalRawMetar: leg.arrivalRawMetar ?? null,
      departureStationIcao: leg.departureStationIcao ?? null,
      arrivalStationIcao: leg.arrivalStationIcao ?? null,
      departureObservedAtUtc: leg.departureObservedAtUtc ?? null,
      arrivalObservedAtUtc: leg.arrivalObservedAtUtc ?? null,
      departureEventAtUtc: leg.departureEventAtUtc ?? null,
      arrivalEventAtUtc: leg.arrivalEventAtUtc ?? null,
    };
  });
  const raw = out.reduce((sum, leg) => sum + leg.totalDelta, 0);
  return { totalDelta: Math.max(-p.imcDayCapPoints, raw), legs: out };
}

export type RecoveryCreditActivity = 'OFF_DUTY' | 'STANDBY_HOME_HOTEL' | 'STANDBY_ONSITE' | 'OTHER';
export interface RecoveryCreditResult { creditPoints: number; basePoints: number; restFactor: number; calloutMultiplier: number; eligible: boolean; }
export function computeRecoveryCredit(input: {
  activityType: RecoveryCreditActivity;
  absoluteRestHours: number | null;
  noWorkHours: number | null;
  immediateCalloutRequired?: boolean | null;
}, p: FrmsOperationalPolicyV2): RecoveryCreditResult {
  const basePoints = input.activityType === 'STANDBY_HOME_HOTEL' ? p.recoveryHotelMaxPoints
    : input.activityType === 'STANDBY_ONSITE' ? p.recoveryOnsiteMaxPoints : 0;
  const noWorkEligible = input.noWorkHours != null && Number.isFinite(input.noWorkHours) && input.noWorkHours >= p.recoveryNoWorkMinHours;
  const rest = input.absoluteRestHours;
  let restFactor = 0;
  if (rest != null && Number.isFinite(rest)) {
    if (rest >= p.recoveryAbsoluteRestFullHours) restFactor = 1;
    else if (rest >= p.recoveryAbsoluteRestMidHours) restFactor = p.recoveryAbsoluteRestMidFactor;
    else if (rest >= p.recoveryAbsoluteRestMinHours) restFactor = p.recoveryAbsoluteRestLowFactor;
  }
  const calloutMultiplier = input.immediateCalloutRequired ? p.recoveryImmediateCalloutMultiplier : 1;
  const eligible = basePoints > 0 && noWorkEligible && restFactor > 0;
  return {
    creditPoints: eligible ? Math.max(0, basePoints * restFactor * calloutMultiplier) : 0,
    basePoints, restFactor, calloutMultiplier, eligible,
  };
}

export interface FlightHoursDeltaResult { rawPenaltyPoints: number; priorDayCreditAppliedPoints: number; netDeltaPoints: number; generatedCreditForNextDayPoints: number; }
export function computeFlightHoursDelta(hvMinutesInput: number, priorDayCreditPointsInput: number, p: FrmsOperationalPolicyV2): FlightHoursDeltaResult {
  const hvMinutes = Number.isFinite(hvMinutesInput) ? Math.max(0, hvMinutesInput) : 0;
  const priorCredit = Number.isFinite(priorDayCreditPointsInput) ? Math.max(0, priorDayCreditPointsInput) : 0;
  let generatedCreditForNextDayPoints = 0;
  if (hvMinutes < p.hvCreditThresholdMinutes && p.hvCreditThresholdMinutes > 0) {
    generatedCreditForNextDayPoints = p.hvCreditMaxPoints * ((p.hvCreditThresholdMinutes - hvMinutes) / p.hvCreditThresholdMinutes);
  }
  let rawPenaltyPoints = 0;
  if (hvMinutes > p.hvNeutralMaxMinutes) {
    rawPenaltyPoints = Math.min(
      p.hvPenaltyCapPoints,
      ((hvMinutes - p.hvNeutralMaxMinutes) / 60) * p.hvPenaltyPerExcessHourPoints,
    );
  }
  const applied = Math.min(rawPenaltyPoints, priorCredit);
  return {
    rawPenaltyPoints,
    priorDayCreditAppliedPoints: applied,
    netDeltaPoints: rawPenaltyPoints === applied ? 0 : -(rawPenaltyPoints - applied),
    generatedCreditForNextDayPoints,
  };
}

/**
 * AirTrust FRMS V3 — research-only schedule exposure inventory.
 *
 * Schedule data can show timing and workload; it CANNOT prove actual sleep,
 * physiologic fatigue, regulatory compliance, alertness or fitness to fly.
 * This module is pure: no D1/R2, no identity, no network, no runtime hook.
 * It deliberately has NO fatigue score, probability, thresholds or clearance.
 */
export type ScheduleActivity = 'DUTY' | 'STANDBY' | 'OFF_DUTY';
export type ScheduleEvidenceSource = 'ACTUAL' | 'PLANNED' | 'ESTIMATED';

export interface ScheduleExposureEvent {
  startAt: string;
  endAt: string;
  activity: ScheduleActivity;
  source: ScheduleEvidenceSource;
}

export interface ScheduleExposureInput {
  windowStartAt: string;
  windowEndAt: string;
  events: readonly ScheduleExposureEvent[];
  /** Fixed local UTC offset for a research-only 02:00–06:00 window.
   * Not valid across transitions in civil UTC offset. Not a legal WOCL check.
   */
  referenceUtcOffsetMinutes: number;
}

export type ScheduleExposureState =
  | 'NO_SCHEDULE_EVIDENCE'
  | 'INCOMPLETE_SCHEDULE'
  | 'ESTIMATED_SEGMENTS'
  | 'MIXED_ACTUAL_AND_PLANNED'
  | 'DESCRIPTIVE_EVIDENCE_ONLY';

export interface ScheduleExposureResult {
  state: ScheduleExposureState;
  windowHours: number;
  reportedHours: number;
  gapHours: number;
  estimatedHours: number;
  actualDutyHours: number;
  plannedDutyHours: number;
  estimatedDutyHours: number;
  actualStandbyHours: number;
  plannedStandbyHours: number;
  estimatedStandbyHours: number;
  /** Off duty is an opportunity only, never evidence of sleep. */
  offDutyOpportunityHours: number;
  actualOffDutyOpportunityHours: number;
  plannedOffDutyOpportunityHours: number;
  estimatedOffDutyOpportunityHours: number;
  /** Time in 02:00–06:00, for all DUTY sources; descriptive, not a legal limit. */
  referenceNightDutyHours: number;
  actualReferenceNightDutyHours: number;
  plannedReferenceNightDutyHours: number;
  estimatedReferenceNightDutyHours: number;
  /** Count of events clipped to window (never identifiable employee data). */
  eventCount: number;
  reasons: string[];
  fatigueIndex: null;
  verifiedSleepHours: null;
  fitForDuty: null;
  regulatoryCompliance: 'NOT_ASSESSED';
  flightAuthorization: 'NOT_PROVIDED';
  referenceClock: 'FIXED_OFFSET_RESEARCH_ONLY';
}

export interface ScheduleExposureComparison {
  /** Scenario B minus scenario A; never interpreted as a risk percentage. */
  deltaActualDutyHours: number;
  deltaPlannedDutyHours: number;
  deltaStandbyHours: number;
  deltaReferenceNightDutyHours: number;
  deltaUnresolvedHours: number;
  riskRanking: 'NOT_AVAILABLE_WITHOUT_VALIDATION';
  flightAuthorization: 'NOT_PROVIDED';
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const round = (hours: number): number => Math.round((hours + Number.EPSILON) * 100) / 100;

function instant(value: string): number {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(value)
    : null;
  if (!match) throw new Error('IMA_SCHEDULE_EXPLICIT_TIMESTAMP_REQUIRED');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const millis = match[7] ? Number(match[7].padEnd(3, '0')) : 0;
  const civil = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0, millis));
  // Date.parse silently normalizes Feb 30 and 24:00. Do not accept falsified
  // operation dates or reinterpret a midnight shift as the following day.
  if (civil.getUTCFullYear() !== year || civil.getUTCMonth() !== month - 1 ||
      civil.getUTCDate() !== day || civil.getUTCHours() !== hour ||
      civil.getUTCMinutes() !== minute || civil.getUTCSeconds() !== (second || 0)) {
    throw new Error('IMA_SCHEDULE_INVALID_INSTANT');
  }
  const zone = match[8];
  let offsetMinutes = 0;
  if (zone.toUpperCase() !== 'Z') {
    const offsetHours = Number(zone.slice(1, 3));
    const offsetRemainder = Number(zone.slice(4, 6));
    if (offsetHours > 14 || offsetRemainder > 59 ||
        (offsetHours === 14 && offsetRemainder !== 0)) {
      throw new Error('IMA_SCHEDULE_INVALID_INSTANT');
    }
    offsetMinutes = (zone[0] === '+' ? 1 : -1) * (offsetHours * 60 + offsetRemainder);
  }
  const result = civil.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(result)) throw new Error('IMA_SCHEDULE_INVALID_INSTANT');
  return result;
}

function validEvent(event: ScheduleExposureEvent): void {
  if (!['DUTY', 'STANDBY', 'OFF_DUTY'].includes(event.activity)) {
    throw new Error('IMA_SCHEDULE_INVALID_ACTIVITY');
  }
  if (!['ACTUAL', 'PLANNED', 'ESTIMATED'].includes(event.source)) {
    throw new Error('IMA_SCHEDULE_INVALID_PROVENANCE');
  }
}

/** Local 02:00–06:00 per fixed offset, inclusive at 02:00 and exclusive at 06:00.
 * Calendar-day slicing is in the supplied fixed-offset coordinate system.
 */
function referenceNightOverlap(start: number, end: number, offsetMinutes: number): number {
  if (start >= end) return 0;
  const offsetMs = offsetMinutes * 60_000;
  const localStart = start + offsetMs;
  const localEnd = end + offsetMs;
  const firstLocalDay = Math.floor(localStart / DAY);
  const lastLocalDay = Math.floor((localEnd - 1) / DAY);
  let overlapMs = 0;
  for (let day = firstLocalDay; day <= lastLocalDay; day++) {
    const nightStart = day * DAY + 2 * HOUR;
    const nightEnd = day * DAY + 6 * HOUR;
    overlapMs += Math.max(0, Math.min(localEnd, nightEnd) - Math.max(localStart, nightStart));
  }
  return overlapMs;
}

/**
 * A schedule is not a sleep/wake diary: an off-duty interval, even if long,
 * is NEVER credited as sleep/recovery. No pilot authorization is possible.
 */
export function describeImaScheduleExposure(input: ScheduleExposureInput): ScheduleExposureResult {
  const from = instant(input.windowStartAt);
  const to = instant(input.windowEndAt);
  if (to <= from || to - from > 31 * DAY) throw new Error('IMA_SCHEDULE_INVALID_WINDOW');
  if (!Number.isInteger(input.referenceUtcOffsetMinutes) ||
      input.referenceUtcOffsetMinutes < -720 || input.referenceUtcOffsetMinutes > 840) {
    throw new Error('IMA_SCHEDULE_INVALID_UTC_OFFSET');
  }

  const ordered = input.events.map((event) => {
    validEvent(event);
    const start = instant(event.startAt);
    const end = instant(event.endAt);
    if (end <= start) throw new Error('IMA_SCHEDULE_INVALID_INTERVAL');
    return { ...event, start, end };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const event of ordered) {
    // Even if two rows are identical or one is PLANNED and one ACTUAL,
    // callers must reconcile the source, not count overlapping rows twice.
    if (event.start < lastEnd) throw new Error('IMA_SCHEDULE_OVERLAPPING_EVIDENCE');
    lastEnd = event.end;
  }

  let gapMs = 0;
  let coveredMs = 0;
  let estimatedMs = 0;
  let actualDutyMs = 0;
  let plannedDutyMs = 0;
  let estimatedDutyMs = 0;
  let actualStandbyMs = 0;
  let plannedStandbyMs = 0;
  let estimatedStandbyMs = 0;
  let offDutyMs = 0;
  let actualOffDutyMs = 0;
  let plannedOffDutyMs = 0;
  let estimatedOffDutyMs = 0;
  let nightDutyMs = 0;
  let actualNightDutyMs = 0;
  let plannedNightDutyMs = 0;
  let estimatedNightDutyMs = 0;
  let actualSeen = false;
  let plannedSeen = false;
  let cursor = from;
  let eventCount = 0;

  for (const event of ordered) {
    const start = Math.max(from, event.start);
    const end = Math.min(to, event.end);
    if (end <= start) continue;
    if (start > cursor) gapMs += start - cursor;
    const duration = end - start;
    coveredMs += duration;
    eventCount++;
    if (event.source === 'ESTIMATED') estimatedMs += duration;
    if (event.source === 'ACTUAL') actualSeen = true;
    if (event.source === 'PLANNED') plannedSeen = true;
    if (event.activity === 'DUTY') {
      if (event.source === 'ACTUAL') actualDutyMs += duration;
      else if (event.source === 'PLANNED') plannedDutyMs += duration;
      else estimatedDutyMs += duration;
      const night = referenceNightOverlap(start, end, input.referenceUtcOffsetMinutes);
      nightDutyMs += night;
      if (event.source === 'ACTUAL') actualNightDutyMs += night;
      else if (event.source === 'PLANNED') plannedNightDutyMs += night;
      else estimatedNightDutyMs += night;
    } else if (event.activity === 'STANDBY') {
      if (event.source === 'ACTUAL') actualStandbyMs += duration;
      else if (event.source === 'PLANNED') plannedStandbyMs += duration;
      else estimatedStandbyMs += duration;
    } else {
      offDutyMs += duration;
      if (event.source === 'ACTUAL') actualOffDutyMs += duration;
      else if (event.source === 'PLANNED') plannedOffDutyMs += duration;
      else estimatedOffDutyMs += duration;
    }
    cursor = end;
  }
  if (cursor < to) gapMs += to - cursor;

  const reasons: string[] = ['ESCALA_NAO_COMPROVA_SONO_NEM_APTIDAO'];
  if (eventCount === 0) reasons.push('SEM_ESCALA_NA_JANELA');
  if (gapMs > 0) reasons.push('LACUNAS_DE_ESCALA');
  if (estimatedMs > 0) reasons.push('PERIODOS_ESTIMADOS');
  if (actualSeen && plannedSeen) reasons.push('REALIZADO_E_PLANEJADO_NAO_EQUIVALENTES');

  const state: ScheduleExposureState = eventCount === 0 ? 'NO_SCHEDULE_EVIDENCE'
    : gapMs > 0 ? 'INCOMPLETE_SCHEDULE'
    : estimatedMs > 0 ? 'ESTIMATED_SEGMENTS'
    : actualSeen && plannedSeen ? 'MIXED_ACTUAL_AND_PLANNED'
    : 'DESCRIPTIVE_EVIDENCE_ONLY';

  return {
    state,
    windowHours: round((to - from) / HOUR),
    reportedHours: round(coveredMs / HOUR),
    gapHours: round(gapMs / HOUR),
    estimatedHours: round(estimatedMs / HOUR),
    actualDutyHours: round(actualDutyMs / HOUR),
    plannedDutyHours: round(plannedDutyMs / HOUR),
    estimatedDutyHours: round(estimatedDutyMs / HOUR),
    actualStandbyHours: round(actualStandbyMs / HOUR),
    plannedStandbyHours: round(plannedStandbyMs / HOUR),
    estimatedStandbyHours: round(estimatedStandbyMs / HOUR),
    offDutyOpportunityHours: round(offDutyMs / HOUR),
    actualOffDutyOpportunityHours: round(actualOffDutyMs / HOUR),
    plannedOffDutyOpportunityHours: round(plannedOffDutyMs / HOUR),
    estimatedOffDutyOpportunityHours: round(estimatedOffDutyMs / HOUR),
    referenceNightDutyHours: round(nightDutyMs / HOUR),
    actualReferenceNightDutyHours: round(actualNightDutyMs / HOUR),
    plannedReferenceNightDutyHours: round(plannedNightDutyMs / HOUR),
    estimatedReferenceNightDutyHours: round(estimatedNightDutyMs / HOUR),
    eventCount,
    reasons,
    fatigueIndex: null,
    verifiedSleepHours: null,
    fitForDuty: null,
    regulatoryCompliance: 'NOT_ASSESSED',
    flightAuthorization: 'NOT_PROVIDED',
    referenceClock: 'FIXED_OFFSET_RESEARCH_ONLY',
  };
}

/** Compare two scheduling scenarios only if they use the same time window/clock. */
export function compareImaScheduleExposures(
  a: ScheduleExposureInput,
  b: ScheduleExposureInput,
): ScheduleExposureComparison {
  if (instant(a.windowStartAt) !== instant(b.windowStartAt) ||
      instant(a.windowEndAt) !== instant(b.windowEndAt) ||
      a.referenceUtcOffsetMinutes !== b.referenceUtcOffsetMinutes) {
    throw new Error('IMA_SCHEDULE_COMPARISON_SCOPE_MISMATCH');
  }
  const left = describeImaScheduleExposure(a);
  const right = describeImaScheduleExposure(b);
  return {
    deltaActualDutyHours: round(right.actualDutyHours - left.actualDutyHours),
    deltaPlannedDutyHours: round(right.plannedDutyHours - left.plannedDutyHours),
    deltaStandbyHours: round(
      right.actualStandbyHours + right.plannedStandbyHours + right.estimatedStandbyHours -
      left.actualStandbyHours - left.plannedStandbyHours - left.estimatedStandbyHours,
    ),
    deltaReferenceNightDutyHours: round(right.referenceNightDutyHours - left.referenceNightDutyHours),
    deltaUnresolvedHours: round(
      right.gapHours + right.estimatedHours - left.gapHours - left.estimatedHours,
    ),
    riskRanking: 'NOT_AVAILABLE_WITHOUT_VALIDATION',
    flightAuthorization: 'NOT_PROVIDED',
  };
}

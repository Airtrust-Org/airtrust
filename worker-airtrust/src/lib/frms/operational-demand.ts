/**
 * AirTrust FRMS — Operational Demand / IOGP 690-2 §17C.1.
 *
 * Pure calculation module. It does not write D1 and does not infer that an
 * unknown location is offshore. Offshore/helideck classification must come
 * from an explicit catalogue or other auditable operational source.
 *
 * CAP 371 §14.1 is used only as an industry benchmark/policy candidate:
 * repetitive short sectors at an average rate of 10+ landings/hour require a
 * break of at least 30 minutes away from the helicopter within any continuous
 * period of 3 hours. It is NOT labelled as an ANAC rule.
 */

export type OperationalDemandLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type LocationOperationalClass = 'AERODROME' | 'HELIDECK' | 'PLATFORM' | 'OTHER' | 'UNKNOWN';
export type OperationalDataQuality = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';

export interface OperationalLegInput {
  id: string;
  dataOperational: string; // YYYY-MM-DD
  takeoffLocal: string | null; // HH:MM
  landingLocal: string | null; // HH:MM
  airborneMinutes: number | null;
  landingCount: number | null;
  departureClass: LocationOperationalClass;
  arrivalClass: LocationOperationalClass;
}

export interface VerifiedBreakInput {
  startLocalDateTime: string; // YYYY-MM-DDTHH:MM
  endLocalDateTime: string; // YYYY-MM-DDTHH:MM
  awayFromAircraftVerified: boolean;
  evidenceRef?: string | null;
}

export interface OperationalDemandPolicy {
  shortSectorAirborneThresholdMin: number;
  highSectorCount: number;
  cap371LandingRatePerHour: number;
  cap371BreakMin: number;
  cap371ContinuousPeriodMin: number;
}

export const DEFAULT_OPERATIONAL_DEMAND_POLICY: OperationalDemandPolicy = {
  shortSectorAirborneThresholdMin: 30,
  highSectorCount: 7,
  cap371LandingRatePerHour: 10,
  cap371BreakMin: 30,
  cap371ContinuousPeriodMin: 180,
};

export interface OperationalDemandAssessment {
  sectorCount: number;
  landingCount: number;
  takeoffCount: number;
  offshoreSectorCount: number;
  offshoreShuttleSectorCount: number;
  shortSectorCount: number;
  shortOffshoreSectorCount: number;
  shortOffshoreShuttleSectorCount: number;
  averageSectorAirborneMin: number | null;
  medianSectorAirborneMin: number | null;
  maxLandingsRolling60Min: number | null;
  maxLandingRatePerHour: number | null;
  continuousShuttleBlockMaxMin: number | null;
  verifiedBreakAwayMaxMin: number | null;
  cap371PolicyTriggered: boolean;
  cap371BreakRequired: boolean;
  cap371BreakSatisfied: boolean | null;
  operationalDemandIndex: number | null;
  level: OperationalDemandLevel;
  dataQuality: OperationalDataQuality;
  alerts: string[];
  notes: string[];
}

function parseYmd(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function parseHm(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function parseLocalDateTime(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2})$/.exec(value);
  if (!match) return null;
  const day = parseYmd(match[1]);
  const hm = parseHm(match[2]);
  if (day == null || hm == null) return null;
  return day * 1440 + hm;
}

function eventMinute(data: string, hm: string | null, afterHm?: string | null): number | null {
  const day = parseYmd(data);
  const value = parseHm(hm);
  if (day == null || value == null) return null;
  const after = parseHm(afterHm ?? null);
  const dayOffset = after != null && value < after ? 1 : 0;
  return (day + dayOffset) * 1440 + value;
}

function isOffshore(value: LocationOperationalClass): boolean {
  return value === 'HELIDECK' || value === 'PLATFORM';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function breakDurationMinutes(value: VerifiedBreakInput): number | null {
  const start = parseLocalDateTime(value.startLocalDateTime);
  const end = parseLocalDateTime(value.endLocalDateTime);
  if (start == null || end == null || end < start) return null;
  return end - start;
}

function takeoffEvents(legs: OperationalLegInput[]): { minute: number }[] {
  const events: { minute: number }[] = [];
  for (const leg of legs) {
    // Exactly one physical takeoff per realized leg, regardless of how many
    // day/night landings were recorded for that leg.
    const minute = eventMinute(leg.dataOperational, leg.takeoffLocal);
    if (minute == null) continue;
    events.push({ minute });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

function landingEvents(legs: OperationalLegInput[]): { minute: number; offshoreShuttle: boolean }[] {
  const events: { minute: number; offshoreShuttle: boolean }[] = [];
  for (const leg of legs) {
    const minute = eventMinute(leg.dataOperational, leg.landingLocal, leg.takeoffLocal);
    if (minute == null) continue;
    // A valid realized leg with a landing timestamp proves at least one landing.
    // Explicit SIGVOOS landing_count, when present, wins and may be >1.
    const count = leg.landingCount != null && leg.landingCount >= 0 ? leg.landingCount : 1;
    for (let i = 0; i < count; i += 1) {
      events.push({
        minute,
        offshoreShuttle: isOffshore(leg.departureClass) && isOffshore(leg.arrivalClass),
      });
    }
  }
  return events.sort((a, b) => a.minute - b.minute);
}

function maxRollingLandings(events: { minute: number }[], windowMin: number): number | null {
  if (events.length === 0) return null;
  let max = 0;
  let left = 0;
  for (let right = 0; right < events.length; right += 1) {
    while (events[right].minute - events[left].minute >= windowMin) left += 1;
    max = Math.max(max, right - left + 1);
  }
  return max;
}

function maxLandingRate(events: { minute: number }[]): number | null {
  if (events.length === 0) return null;
  if (events.length === 1) return 1;
  let maxRate = 0;
  // Evaluate every contiguous event window of at least 30 minutes and the
  // standard rolling 60-minute window. This avoids an unstable rate from two
  // events separated by only a few minutes while preserving short-sector load.
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i; j < events.length; j += 1) {
      const elapsed = Math.max(60, events[j].minute - events[i].minute + 1);
      const rate = ((j - i + 1) * 60) / elapsed;
      maxRate = Math.max(maxRate, rate);
    }
  }
  return round1(maxRate);
}

function maxContinuousShuttleBlock(
  legs: OperationalLegInput[],
  verifiedBreaks: VerifiedBreakInput[],
  breakThresholdMin: number,
): number | null {
  const shuttleIntervals = legs
    .filter((leg) => isOffshore(leg.departureClass) && isOffshore(leg.arrivalClass))
    .map((leg) => {
      const start = eventMinute(leg.dataOperational, leg.takeoffLocal);
      const end = eventMinute(leg.dataOperational, leg.landingLocal, leg.takeoffLocal);
      return start != null && end != null && end >= start ? { start, end } : null;
    })
    .filter((value): value is { start: number; end: number } => value !== null)
    .sort((a, b) => a.start - b.start);

  if (shuttleIntervals.length === 0) return null;

  const breaks = verifiedBreaks
    .filter((item) => item.awayFromAircraftVerified)
    .map((item) => {
      const start = parseLocalDateTime(item.startLocalDateTime);
      const end = parseLocalDateTime(item.endLocalDateTime);
      return start != null && end != null && end >= start && end - start >= breakThresholdMin
        ? { start, end }
        : null;
    })
    .filter((value): value is { start: number; end: number } => value !== null)
    .sort((a, b) => a.start - b.start);

  let blockStart = shuttleIntervals[0].start;
  let blockEnd = shuttleIntervals[0].end;
  let max = blockEnd - blockStart;

  for (let i = 1; i < shuttleIntervals.length; i += 1) {
    const current = shuttleIntervals[i];
    const separatingBreak = breaks.some((brk) => brk.start >= blockEnd && brk.end <= current.start);
    if (separatingBreak) {
      max = Math.max(max, blockEnd - blockStart);
      blockStart = current.start;
      blockEnd = current.end;
    } else {
      blockEnd = Math.max(blockEnd, current.end);
    }
  }
  max = Math.max(max, blockEnd - blockStart);
  return max;
}

export function assessOperationalDemand(
  legs: OperationalLegInput[],
  verifiedBreaks: VerifiedBreakInput[] = [],
  policy: OperationalDemandPolicy = DEFAULT_OPERATIONAL_DEMAND_POLICY,
): OperationalDemandAssessment {
  if (policy.shortSectorAirborneThresholdMin <= 0 || policy.highSectorCount <= 0) {
    throw new Error('Operational demand thresholds must be positive.');
  }

  const realized = legs.filter(
    (leg) => leg.takeoffLocal || leg.landingLocal || (leg.airborneMinutes != null && leg.airborneMinutes > 0),
  );
  const airborne = realized
    .map((leg) => leg.airborneMinutes)
    .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);

  const offshoreSectorCount = realized.filter(
    (leg) => isOffshore(leg.departureClass) || isOffshore(leg.arrivalClass),
  ).length;
  const offshoreShuttleSectorCount = realized.filter(
    (leg) => isOffshore(leg.departureClass) && isOffshore(leg.arrivalClass),
  ).length;
  const shortSectorCount = realized.filter(
    (leg) => leg.airborneMinutes != null && leg.airborneMinutes <= policy.shortSectorAirborneThresholdMin,
  ).length;
  const shortOffshoreSectorCount = realized.filter(
    (leg) =>
      (isOffshore(leg.departureClass) || isOffshore(leg.arrivalClass)) &&
      leg.airborneMinutes != null &&
      leg.airborneMinutes <= policy.shortSectorAirborneThresholdMin,
  ).length;
  const shortOffshoreShuttleSectorCount = realized.filter(
    (leg) =>
      isOffshore(leg.departureClass) &&
      isOffshore(leg.arrivalClass) &&
      leg.airborneMinutes != null &&
      leg.airborneMinutes <= policy.shortSectorAirborneThresholdMin,
  ).length;

  const events = landingEvents(realized);
  const takeoffs = takeoffEvents(realized);
  const maxLandingsRolling60Min = maxRollingLandings(events, 60);
  const maxLandingRatePerHour = maxLandingRate(events);

  const verifiedDurations = verifiedBreaks
    .filter((item) => item.awayFromAircraftVerified)
    .map(breakDurationMinutes)
    .filter((value): value is number => value != null);
  const verifiedBreakAwayMaxMin = verifiedDurations.length ? Math.max(...verifiedDurations) : null;
  const continuousShuttleBlockMaxMin = maxContinuousShuttleBlock(
    realized,
    verifiedBreaks,
    policy.cap371BreakMin,
  );

  const repetitiveShortOperation = shortOffshoreShuttleSectorCount > 0;
  const densityTrigger =
    (maxLandingsRolling60Min ?? 0) >= policy.cap371LandingRatePerHour ||
    (maxLandingRatePerHour ?? 0) >= policy.cap371LandingRatePerHour;
  const cap371PolicyTriggered = repetitiveShortOperation && densityTrigger;
  const cap371BreakRequired =
    cap371PolicyTriggered &&
    (continuousShuttleBlockMaxMin == null ||
      continuousShuttleBlockMaxMin >= policy.cap371ContinuousPeriodMin);
  const cap371BreakSatisfied = !cap371BreakRequired
    ? null
    : verifiedBreakAwayMaxMin != null && verifiedBreakAwayMaxMin >= policy.cap371BreakMin;

  const sectorLoad = realized.length ? Math.min(1, realized.length / policy.highSectorCount) : 0;
  const landingLoad =
    maxLandingsRolling60Min == null
      ? 0
      : Math.min(1, maxLandingsRolling60Min / policy.cap371LandingRatePerHour);
  const operationalDemandIndex = realized.length ? Math.round(100 * Math.max(sectorLoad, landingLoad)) : null;

  const unknownLocationCount = realized.filter(
    (leg) => leg.departureClass === 'UNKNOWN' || leg.arrivalClass === 'UNKNOWN',
  ).length;
  const missingAirborneCount = realized.filter((leg) => leg.airborneMinutes == null).length;
  const timedLandingCount = events.length;
  const dataQuality: OperationalDataQuality =
    realized.length === 0
      ? 'INSUFFICIENT'
      : unknownLocationCount === 0 && missingAirborneCount === 0 && timedLandingCount > 0
        ? 'COMPLETE'
        : 'PARTIAL';

  const alerts: string[] = [];
  const notes: string[] = [];
  if (cap371PolicyTriggered) alerts.push('SHUTTLE_REPETITIVO');
  if (densityTrigger) alerts.push('LANDING_DENSITY_HIGH');
  if (cap371BreakRequired && cap371BreakSatisfied !== true) alerts.push('BREAK_SHUTTLE_REQUIRED');
  if (unknownLocationCount > 0) notes.push('Classificação offshore incompleta; local desconhecido não foi inferido.');
  if (missingAirborneCount > 0) notes.push('Há etapas sem duração airborne; short-sector não foi inventado.');

  let level: OperationalDemandLevel = 'UNKNOWN';
  if (operationalDemandIndex != null) {
    if (cap371BreakRequired && cap371BreakSatisfied !== true) level = 'CRITICAL';
    else if (operationalDemandIndex >= 100) level = 'CRITICAL';
    else if (operationalDemandIndex >= 75) level = 'HIGH';
    else if (operationalDemandIndex >= 50) level = 'MODERATE';
    else level = 'LOW';
  }

  return {
    sectorCount: realized.length,
    landingCount: events.length,
    takeoffCount: takeoffs.length,
    offshoreSectorCount,
    offshoreShuttleSectorCount,
    shortSectorCount,
    shortOffshoreSectorCount,
    shortOffshoreShuttleSectorCount,
    averageSectorAirborneMin: airborne.length
      ? round1(airborne.reduce((sum, value) => sum + value, 0) / airborne.length)
      : null,
    medianSectorAirborneMin: median(airborne),
    maxLandingsRolling60Min,
    maxLandingRatePerHour,
    continuousShuttleBlockMaxMin,
    verifiedBreakAwayMaxMin,
    cap371PolicyTriggered,
    cap371BreakRequired,
    cap371BreakSatisfied,
    operationalDemandIndex,
    level,
    dataQuality,
    alerts,
    notes,
  };
}

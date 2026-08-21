import {
  assessOperationalDemand,
  type LocationOperationalClass,
  type OperationalDemandAssessment,
  type OperationalDemandPolicy,
  type OperationalLegInput,
  type VerifiedBreakInput,
} from '../frms/operational-demand';

/** Structural subset intentionally avoids importing services/sigvoos-frms from FRMS. */
export interface SigvoosLegForOperationalDemand {
  data: string;
  horasVooMin: number;
  departureIcao: string | null;
  arrivalIcao: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
  dayLandings: number | null;
  nightLandings: number | null;
  flightReportId: string | null;
  legNumber: number | null;
  raw: Record<string, unknown>;
}

export interface SigvoosLocationClassificationInput {
  side: 'DEPARTURE' | 'ARRIVAL';
  icao: string | null;
  rawLocation: Record<string, unknown> | null;
  rawLeg: Record<string, unknown>;
}

export type SigvoosLocationClassifier = (
  input: SigvoosLocationClassificationInput,
) => LocationOperationalClass;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function resolveLandingCount(leg: SigvoosLegForOperationalDemand): number | null {
  const values = [leg.dayLandings, leg.nightLandings].filter(
    (value): value is number => value != null && Number.isFinite(value) && value >= 0,
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Only flightReportId + legNumber are a reliable identity for a physical leg
 * (multiple crew rows share both). When either is absent we cannot safely
 * assert two rows are the same leg — collapsing them on time/ICAO alone would
 * risk merging genuinely distinct legs that happen to share a schedule. In
 * that case each row is kept distinct (no dedup) by folding its position into
 * the id.
 */
function stableLegId(leg: SigvoosLegForOperationalDemand, index: number): string {
  if (leg.flightReportId != null && leg.legNumber != null) {
    return `${leg.flightReportId}:${leg.legNumber}`;
  }
  return `unmapped:${index}:${leg.data}:${leg.takeoffTime ?? 'no-tkof'}`;
}

export function mapSigvoosLegToOperationalDemandInput(
  leg: SigvoosLegForOperationalDemand,
  classifyLocation: SigvoosLocationClassifier,
  index = 0,
): OperationalLegInput {
  const rawLeg = asRecord(leg.raw.flight_report_leg) ?? leg.raw;
  const departure = asRecord(rawLeg.departure_location);
  const arrival = asRecord(rawLeg.arrival_location);
  const stableId = stableLegId(leg, index);

  return {
    id: stableId,
    dataOperational: leg.data,
    takeoffLocal: leg.takeoffTime,
    landingLocal: leg.landingTime,
    airborneMinutes:
      Number.isFinite(leg.horasVooMin) && leg.horasVooMin >= 0 ? leg.horasVooMin : null,
    landingCount: resolveLandingCount(leg),
    departureClass: classifyLocation({
      side: 'DEPARTURE',
      icao: leg.departureIcao,
      rawLocation: departure,
      rawLeg,
    }),
    arrivalClass: classifyLocation({
      side: 'ARRIVAL',
      icao: leg.arrivalIcao,
      rawLocation: arrival,
      rawLeg,
    }),
  };
}

export function assessSigvoosOperationalDemand(
  legs: SigvoosLegForOperationalDemand[],
  classifyLocation: SigvoosLocationClassifier,
  verifiedBreaks: VerifiedBreakInput[] = [],
  policy?: OperationalDemandPolicy,
): OperationalDemandAssessment {
  const mapped = legs.map((leg, index) =>
    mapSigvoosLegToOperationalDemandInput(leg, classifyLocation, index),
  );
  const unique = new Map<string, typeof mapped[0]>();
  for (const item of mapped) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item);
    }
  }
  return assessOperationalDemand(
    Array.from(unique.values()),
    verifiedBreaks,
    policy,
  );
}

/** Safe default when no audited offshore catalogue is available. */
export const UNKNOWN_SIGVOOS_LOCATION_CLASSIFIER: SigvoosLocationClassifier = () => 'UNKNOWN';

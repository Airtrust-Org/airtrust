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

export function mapSigvoosLegToOperationalDemandInput(
  leg: SigvoosLegForOperationalDemand,
  classifyLocation: SigvoosLocationClassifier,
): OperationalLegInput {
  const rawLeg = asRecord(leg.raw.flight_report_leg) ?? leg.raw;
  const departure = asRecord(rawLeg.departure_location);
  const arrival = asRecord(rawLeg.arrival_location);
  const stableId = `${leg.flightReportId ?? 'fr-unknown'}:${leg.legNumber ?? 'leg-unknown'}:${leg.data}:${leg.takeoffTime ?? 'no-tkof'}`;

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
  return assessOperationalDemand(
    legs.map((leg) => mapSigvoosLegToOperationalDemandInput(leg, classifyLocation)),
    verifiedBreaks,
    policy,
  );
}

/** Safe default when no audited offshore catalogue is available. */
export const UNKNOWN_SIGVOOS_LOCATION_CLASSIFIER: SigvoosLocationClassifier = () => 'UNKNOWN';

import type { AnacRabAircraftProjection } from './rab-normalization';
import { normalizeBrazilianAircraftRegistration } from './rab-normalization';

export const ANAC_RAB_COMPARISON_VERSION = 'anac.rab-comparison.v1' as const;

export type AnacRabAircraftComparisonField =
  | 'registration'
  | 'model'
  | 'manufacturer'
  | 'manufactureYear';

export type AnacRabAircraftComparisonState =
  | 'MATCH'
  | 'MISMATCH'
  | 'AIRTRUST_VALUE_MISSING'
  | 'ANAC_VALUE_MISSING';

export interface AirTrustAircraftSnapshot {
  id: number;
  tenantId: number;
  registration: string | null;
  model: string | null;
  manufacturer: string | null;
  manufactureYear: number | null;
}

export interface AnacRabAircraftComparisonFinding {
  field: AnacRabAircraftComparisonField;
  state: AnacRabAircraftComparisonState;
}

export interface AnacRabAircraftComparison {
  schemaVersion: typeof ANAC_RAB_COMPARISON_VERSION;
  classification: 'READ_ONLY_REFERENCE_COMPARISON';
  source: 'ANAC_RAB_PUBLIC_DATA';
  aircraftId: number;
  tenantId: number;
  registration: string | null;
  canAutoApply: false;
  requiresHumanReview: boolean;
  findings: AnacRabAircraftComparisonFinding[];
}

function normalizedText(value: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ').toUpperCase();
  return normalized || null;
}

function compareNullable(
  field: AnacRabAircraftComparisonField,
  airTrustValue: string | number | null,
  anacValue: string | number | null,
): AnacRabAircraftComparisonFinding {
  if (airTrustValue === null || airTrustValue === '') {
    return { field, state: 'AIRTRUST_VALUE_MISSING' };
  }
  if (anacValue === null || anacValue === '') {
    return { field, state: 'ANAC_VALUE_MISSING' };
  }

  const left = typeof airTrustValue === 'string' ? normalizedText(airTrustValue) : airTrustValue;
  const right = typeof anacValue === 'string' ? normalizedText(anacValue) : anacValue;
  return { field, state: left === right ? 'MATCH' : 'MISMATCH' };
}

/**
 * Compares AirTrust master data with the minimized official RAB projection.
 *
 * This result is intentionally not an update plan. Public ANAC data can flag a discrepancy or a
 * missing field, but a human-controlled workflow must decide whether/how the tenant master data is
 * changed. This prevents a scheduled source refresh from silently rewriting operational records.
 */
export function compareAirTrustAircraftWithAnacRab(
  aircraft: AirTrustAircraftSnapshot,
  rab: AnacRabAircraftProjection,
): AnacRabAircraftComparison {
  const airTrustRegistration = normalizeBrazilianAircraftRegistration(aircraft.registration);

  const findings: AnacRabAircraftComparisonFinding[] = [
    compareNullable('registration', airTrustRegistration, rab.registration),
    compareNullable('model', aircraft.model, rab.model),
    compareNullable('manufacturer', aircraft.manufacturer, rab.manufacturer),
    compareNullable('manufactureYear', aircraft.manufactureYear, rab.manufactureYear),
  ];

  return {
    schemaVersion: ANAC_RAB_COMPARISON_VERSION,
    classification: 'READ_ONLY_REFERENCE_COMPARISON',
    source: 'ANAC_RAB_PUBLIC_DATA',
    aircraftId: aircraft.id,
    tenantId: aircraft.tenantId,
    registration: airTrustRegistration,
    canAutoApply: false,
    requiresHumanReview: findings.some((finding) => finding.state !== 'MATCH'),
    findings,
  };
}

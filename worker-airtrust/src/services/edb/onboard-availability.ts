export interface EdbVolumeRecordReference {
  volumeId: string;
  revisionId: string;
  revision: number;
  flightDate: string;
}

export interface EdbOnboardAvailabilityAssessment {
  asOfOperationDate: string;
  windowStart: string;
  requiredVolumeIds: string[];
  availableVolumeIds: string[];
  missingVolumeIds: string[];
  compliant: boolean;
}

function normalizeDate(value: string, field: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${field} must use YYYY-MM-DD`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be a valid calendar date`);
  }

  return value;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

/**
 * Returns the inclusive start date for a 30-calendar-day operation window.
 * The as-of date is day 30, so the start is 29 days earlier.
 */
export function onboardOperationWindowStart(asOfOperationDate: string): string {
  const normalized = normalizeDate(asOfOperationDate, 'asOfOperationDate');
  const [year, month, day] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  start.setUTCDate(start.getUTCDate() - 29);
  return start.toISOString().slice(0, 10);
}

/**
 * Selects every whole eDB volume containing at least one immutable revision in
 * the inclusive last-30-operation-day window. This is a local availability
 * assessment only: it does not transmit to ANAC or infer any external API,
 * payload, authentication or acceptance semantics.
 */
export function requiredEdbOnboardVolumeIds(
  references: readonly EdbVolumeRecordReference[],
  asOfOperationDate: string,
): string[] {
  const asOf = normalizeDate(asOfOperationDate, 'asOfOperationDate');
  const windowStart = onboardOperationWindowStart(asOf);
  const required = new Set<string>();

  for (const reference of references) {
    const volumeId = requireText(reference.volumeId, 'volumeId');
    requireText(reference.revisionId, 'revisionId');
    if (!Number.isInteger(reference.revision) || reference.revision < 1) {
      throw new Error('revision must be a positive integer');
    }

    const flightDate = normalizeDate(reference.flightDate, 'flightDate');
    if (flightDate >= windowStart && flightDate <= asOf) required.add(volumeId);
  }

  return [...required].sort();
}

export function assessEdbOnboardAvailability(params: {
  references: readonly EdbVolumeRecordReference[];
  availableVolumeIds: readonly string[];
  asOfOperationDate: string;
}): EdbOnboardAvailabilityAssessment {
  const asOfOperationDate = normalizeDate(params.asOfOperationDate, 'asOfOperationDate');
  const requiredVolumeIds = requiredEdbOnboardVolumeIds(params.references, asOfOperationDate);
  const availableVolumeIds = [
    ...new Set(params.availableVolumeIds.map((id) => requireText(id, 'availableVolumeId'))),
  ].sort();
  const available = new Set(availableVolumeIds);
  const missingVolumeIds = requiredVolumeIds.filter((volumeId) => !available.has(volumeId));

  return {
    asOfOperationDate,
    windowStart: onboardOperationWindowStart(asOfOperationDate),
    requiredVolumeIds,
    availableVolumeIds,
    missingVolumeIds,
    compliant: missingVolumeIds.length === 0,
  };
}

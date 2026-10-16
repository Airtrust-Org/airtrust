/** Server-derived KSS field provenance, forward-only, never inferred from legacy data. */
import type { ImaKssProvenance } from './ima-v3-evidence-audit';

type SubmittedKssFields = { kss_score?: number | null; sleepiness_level?: number | null };

/**
 * CREW_REPORTED means an explicit field in an authenticated check-in request.
 * It is not independent proof of human interaction or clinical validity.
 */
export function resolveCheckinKssProvenance(input: SubmittedKssFields): ImaKssProvenance {
  if (Number.isInteger(input.kss_score) && input.kss_score! >= 1 && input.kss_score! <= 9) {
    return 'CREW_REPORTED';
  }
  if (Number.isInteger(input.sleepiness_level) &&
      input.sleepiness_level! >= 0 && input.sleepiness_level! <= 10) {
    return 'DERIVED';
  }
  return 'DEFAULTED';
}

/** Auditable metadata, no extra sensitive field values or schema changes. */
export function kssProvenanceEventFields(provenance: ImaKssProvenance): {
  kss_field_provenance: ImaKssProvenance;
  kss_field_provenance_version: 'CHECKIN_SERVER_V1';
} {
  return { kss_field_provenance: provenance, kss_field_provenance_version: 'CHECKIN_SERVER_V1' };
}

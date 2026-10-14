/**
 * Player3: compositional read-only plan derived from persisted legacy D1 CMI.
 * No completion, qualification, administrative credit or migration write.
 * Caller must resolve the source package from authenticated tenant-bound,
 * immutable R2 evidence — NEVER trust a source manifest supplied by a browser.
 */
import {
  extractPersistedScormResume, type LegacyResumeSource,
  type LegacyResumeEvidence,
} from './legacy-resume-evidence';
import {
  planContinuity, type LegacyEnrollment, type DestinationEdition,
  type ContinuityPlan,
} from './continuity';

export type ResumeMigrationReview = Readonly<{
  source_evidence: LegacyResumeEvidence;
  plan: ContinuityPlan;
  requires_administrative_equivalence: boolean;
}>;

export function planLegacyResumeMigration(
  enrollment: LegacyEnrollment,
  source: LegacyResumeSource,
  destination: DestinationEdition | null,
): ResumeMigrationReview {
  // Source evidence is read from private server-persisted CMI; never award
  // certifying status from any lesson_status or suspend_data fields.
  const evidence = extractPersistedScormResume(source);
  const withEvidence = evidence.classification === 'VISITED_UNITS'
    ? { ...enrollment, verified_completed_source_units: evidence.visited_unit_ids }
    : { ...enrollment, verified_completed_source_units: undefined };
  const plan = planContinuity(withEvidence, destination);
  // Never apply a crosswalk when the package parser could not verify its own
  // state. Resume-only bookmarks require a reviewed administrative equivalence.
  const requiresReview = evidence.classification !== 'VISITED_UNITS' ||
    !['EXACT_RESTORE', 'UNIT_CROSSWALK', 'NO_PROGRESS'].includes(plan.disposition);
  return {
    source_evidence: evidence,
    plan,
    requires_administrative_equivalence: requiresReview,
  };
}

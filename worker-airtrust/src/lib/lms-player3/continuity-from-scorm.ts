/**
 * Player 3: persisted legacy SCORM bookmark -> proposed place to resume.
 *
 * This deliberately does NOT turn suspend_data into server-authorized visits,
 * completed module credits, formal exam passes or LMS completion. Authenticated
 * SCORM runtime commits are still client-origin claims. Apply only through an
 * operator-reviewed and audited continuity credit with the original edition
 * SHA, tenant, course, enrollment and cycle pinned.
 */
import {
  extractPersistedScormResume,
  type LegacyResumeEvidence,
} from './legacy-resume-evidence';
import {
  planContinuity,
  type LegacyEnrollment,
  type DestinationEdition,
  type ContinuityPlan,
} from './continuity';

export type LegacySourceEdition = Readonly<{
  empresa_id: number;
  curso_id: number;
  source_edition_sha256: string;
  course_version_tag: string | null;
  source_package_version: string;
  ordered_source_unit_ids: readonly string[];
}>;

export type LegacyRecoveryProposal = Readonly<{
  continuity: ContinuityPlan;
  evidence: LegacyResumeEvidence;
  proposed_resume_unit_id: string | null;
  review_required: true;
  source_edition_sha256: string;
  source_cmi_sha256: string | null;
  grants_completed: false;
  grants_exam_pass: false;
  grants_certificate: false;
}>;

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function proposeLegacyScormResume(input: {
  readonly enrollment: LegacyEnrollment;
  readonly sourceEdition: LegacySourceEdition;
  readonly destination: DestinationEdition | null;
  readonly persistedSuspendData: string | null;
}): LegacyRecoveryProposal {
  const { enrollment, sourceEdition, destination, persistedSuspendData } = input;
  if (!SHA.test(sourceEdition.source_edition_sha256) ||
      sourceEdition.course_id !== enrollment.curso_id ||
      sourceEdition.empresa_id !== enrollment.empresa_id ||
      sourceEdition.course_version_tag !== enrollment.curso_version_tag ||
      !sourceEdition.source_package_version ||
      !Array.isArray(sourceEdition.ordered_source_unit_ids) ||
      sourceEdition.ordered_source_unit_ids.length < 1 ||
      sourceEdition.ordered_source_unit_ids.length > 500 ||
      sourceEdition.ordered_source_unit_ids.some(id => !ID.test(id)) ||
      new Set(sourceEdition.ordered_source_unit_ids).size !==
      sourceEdition.ordered_source_unit_ids.length) {
    throw new Error('PLAYER3_SOURCE_EDITION_NOT_PINNED');
  }
  // Never feed visited source units into planContinuity's *verified* credits:
  // the SCORM suspend_data is not independently verified server evidence.
  const continuity = planContinuity({
    ...enrollment, verified_completed_source_units: undefined,
  }, destination);
  const evidence = extractPersistedScormResume({
    persisted_suspend_data: persistedSuspendData,
    expected_package_version: sourceEdition.source_package_version,
    ordered_source_unit_ids: sourceEdition.ordered_source_unit_ids,
  });
  let proposedResumeUnitId: string | null = null;
  if (continuity.disposition !== 'SOURCE_CONFLICT' && destination &&
      destination.source_version_tag === sourceEdition.course_version_tag &&
      evidence.active_unit_id && evidence.classification !== 'REVIEW_REQUIRED') {
    const mapped = destination.units_by_source_id[evidence.active_unit_id];
    if (mapped && destination.target_unit_ids.includes(mapped) &&
        // All source units must have reviewed destinations.
        sourceEdition.ordered_source_unit_ids.every(
          id => destination.units_by_source_id[id] &&
            destination.target_unit_ids.includes(destination.units_by_source_id[id]),
        ) &&
        new Set(sourceEdition.ordered_source_unit_ids.map(
          id => destination.units_by_source_id[id],
        )).size === sourceEdition.ordered_source_unit_ids.length) {
      proposedResumeUnitId = mapped;
    }
  }
  return {
    continuity, evidence, proposed_resume_unit_id: proposedResumeUnitId,
    review_required: true,
    source_edition_sha256: sourceEdition.source_edition_sha256,
    source_cmi_sha256: enrollment.scorm_cmi_json_sha256,
    grants_completed: false, grants_exam_pass: false, grants_certificate: false,
  };
}

/**
 * Versioned course-finalization decision for Score F5 (SCORM 1.2).
 * NO_FINAL_EXAM is a configuration for newly reviewed editions; it is NOT
 * an instruction to grant regulatory credit without mandatory assessment.
 * The Worker must pin this policy to the actual enrollment/cycle/edition.
 */
export type ScoreF5FinalAssessmentPolicy = 'NO_FINAL_EXAM' | 'EXTERNAL_REQUIRED';
export type ScoreF5PackageAssessment = 'NONE' | 'EXTERNAL';
export type ScoreF5FinalizationInput = Readonly<{
  engineId: string;
  packageAssessment: ScoreF5PackageAssessment;
  pinnedPolicy: ScoreF5FinalAssessmentPolicy | null;
  activeEditionMatchesCycle: boolean;
  studyReceiptVerified: boolean;
  explicitStudyEndVerified: boolean;
  requiredUnitsVerified: boolean;
  // Null = not classified / unreviewed: never infer no legal assessment required.
  statutoryAssessmentRequired: boolean | null;
  satisfactoryAssessmentVerified: boolean;
  externalExamPassed: boolean;
}>;
export type ScoreF5FinalizationDecision = Readonly<{
  code:
    | 'UNSUPPORTED_ENGINE' | 'POLICY_NOT_PINNED' | 'PACKAGE_POLICY_MISMATCH'
    | 'EDITION_MISMATCH' | 'STUDY_EVIDENCE_PENDING'
    | 'REGULATORY_REVIEW_REQUIRED' | 'SATISFACTORY_ASSESSMENT_REQUIRED'
    | 'EXTERNAL_EXAM_PENDING' | 'READY_FOR_CANONICAL_COMPLETION';
  canCallCanonicalCompletion: boolean;
  examRequired: boolean;
  createsQualification: false;
}>;

export function decideScoreF5Finalization(
  input: ScoreF5FinalizationInput,
): ScoreF5FinalizationDecision {
  const examRequired = input.pinnedPolicy === 'EXTERNAL_REQUIRED';
  const outcome = (code: ScoreF5FinalizationDecision['code']): ScoreF5FinalizationDecision => ({
    code, canCallCanonicalCompletion: code === 'READY_FOR_CANONICAL_COMPLETION',
    examRequired, createsQualification: false,
  });
  if (input.engineId !== 'AIRTRUST_UNIFIED_SCORE_SCORM12_V1') return outcome('UNSUPPORTED_ENGINE');
  if (!input.pinnedPolicy) return outcome('POLICY_NOT_PINNED');
  if ((input.pinnedPolicy === 'NO_FINAL_EXAM' && input.packageAssessment !== 'NONE') ||
      (examRequired && input.packageAssessment !== 'EXTERNAL')) {
    // The received NR-20 candidate currently declares EXTERNAL. It cannot
    // silently become a no-exam candidate merely by toggling a catalog field.
    return outcome('PACKAGE_POLICY_MISMATCH');
  }
  if (!input.activeEditionMatchesCycle) return outcome('EDITION_MISMATCH');
  if (!input.studyReceiptVerified || !input.explicitStudyEndVerified ||
      !input.requiredUnitsVerified) return outcome('STUDY_EVIDENCE_PENDING');
  if (input.statutoryAssessmentRequired === null) {
    return outcome('REGULATORY_REVIEW_REQUIRED');
  }
  if (input.statutoryAssessmentRequired && !input.satisfactoryAssessmentVerified) {
    return outcome('SATISFACTORY_ASSESSMENT_REQUIRED');
  }
  if (examRequired && !input.externalExamPassed) return outcome('EXTERNAL_EXAM_PENDING');
  return outcome('READY_FOR_CANONICAL_COMPLETION');
}

/**
 * AirTrust LMS Session Engine V2 — pure, fail-closed completion state machine.
 *
 * This module intentionally makes no D1/R2 writes and grants no credentials.
 * The backend must derive all trust flags from authenticated, tenant-scoped,
 * edition-bound persisted records, never from browser claims.
 *
 * SCORM is a transport adapter, NOT a certification authority. A valid 42/42
 * location is position, not approval. A 99% progress badge is not evidence.
 */
export type LmsRuntimeV2 = 'SCORM_12' | 'SCORM_2004' | 'NATIVE';
export type LmsEvidenceProfileV2 = 'STRICT_TRACKED' | 'SCORM_CONFORMANT';
export type LmsAssessmentPolicyV2 = 'SCORED' | 'FORMATIVE';

export type LmsSessionDecisionV2 =
  | 'BLOCKED'
  | 'CONTINUE'
  | 'READY_TO_FINALIZE'
  | 'AWAITING_SERVER_COMMIT'
  | 'QUALIFICATION_PENDING'
  | 'CERTIFICATE_PENDING'
  | 'COMPLETED';

export type LmsSessionReasonV2 =
  | 'SESSION_UNTRUSTED'
  | 'ENROLLMENT_INACTIVE'
  | 'NEW_EDITION_REQUIRED'
  | 'EVIDENCE_NOT_PERSISTED'
  | 'UNAPPROVED_CONFORMANCE_PROFILE'
  | 'SLIDE_EVIDENCE_MISSING'
  | 'ASSESSMENT_PENDING'
  | 'MASTERY_UNCONFIGURED'
  | 'SCORE_INVALID'
  | 'SCORE_MISSING'
  | 'SCORE_BELOW_MASTERY'
  | 'ASSESSMENT_FAILED'
  | 'SCORM_TERMINAL_MISSING'
  | 'USER_FINALIZATION_REQUIRED'
  | 'SERVER_CONFIRMATION_REQUIRED'
  | 'QUALIFICATION_MISSING'
  | 'CERTIFICATE_NOT_VERIFIED'
  | 'MATRICULA_CONCLUIDA';

export interface TrainingSessionV2 {
  runtime: LmsRuntimeV2;
  /** Default must be STRICT_TRACKED for all existing training records. */
  evidenceProfile: LmsEvidenceProfileV2;
  /** This authorization must originate from a governed, versioned Quality Gate. */
  approvedScormConformance: boolean;
  /** Derived from signed asset capability and enrollment ownership on the Worker. */
  scopedSessionValid: boolean;
  enrollmentActive: boolean;
  courseEditionMatches: boolean;
  /** A successful Worker/D1 write, not an optimistic iframe callback. */
  evidencePersisted: boolean;
  /** Authoritative requirement authored for the active immutable course version. */
  requiredSlides: number | null;
  /** Server-persisted distinct viewed indices, not an untrusted maximum position. */
  persistedVisitedSlides: readonly number[] | null;
  /** Server-verified SCORM runtime status after the required assessment. */
  scormTerminalStatus: 'passed' | 'completed' | 'failed' | 'incomplete' | 'unknown' | null;
  assessmentPolicy: LmsAssessmentPolicyV2;
  requiredQuestions: number | null;
  answeredQuestions: number | null;
  scorePercent: number | null;
  masteryPercent: number | null;
  assessmentPassed: boolean | null;
  /** Explicit learner action, not unload, score=100 or LMSFinish alone. */
  userFinalizationRequested: boolean;
  /** Actual, committed enrollment status read from D1 after finalization. */
  enrollmentCompleted: boolean;
  qualificationRequired: boolean;
  qualificationCommitted: boolean;
  certificateRequired: boolean;
  certificateVerified: boolean;
}

export interface TrainingDecisionV2 {
  state: LmsSessionDecisionV2;
  code: LmsSessionReasonV2;
  /** Only true when the Worker may attempt a governed, idempotent completion. */
  readyForAtomicCommit: boolean;
  /** True only after an authoritative D1 completion was committed. */
  completionRecorded: boolean;
}

function result(
  state: LmsSessionDecisionV2,
  code: LmsSessionReasonV2,
  completionRecorded = false,
): TrainingDecisionV2 {
  return {
    state,
    code,
    readyForAtomicCommit: state === 'READY_TO_FINALIZE',
    completionRecorded,
  };
}

function finitePercent(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= 0 && value <= 100;
}

function exactSlideCoverage(total: number | null, visited: readonly number[] | null): boolean {
  if (!Number.isSafeInteger(total) || total == null || total <= 0 || total > 1000 ||
      !Array.isArray(visited) || visited.length !== total) return false;
  const unique = new Set(visited);
  if (unique.size !== total) return false;
  for (let n = 1; n <= total; n++) if (!unique.has(n)) return false;
  return true;
}

function questionsComplete(required: number | null, answered: number | null): boolean {
  // An unreported question count is not enough for a course whose immutable
  // manifest declares a required count. Zero required means no questions.
  if (required == null) return true;
  if (required === 0) return true;
  return Number.isSafeInteger(required) && required > 0 &&
    Number.isSafeInteger(answered) && answered != null &&
    answered >= required;
}

/**
 * Server-only eligibility and confirmed-outcome projection.
 *
 * No browser-provided flag should be fed directly into this function.
 * SCORM_CONFORMANT is opt-in per immutable, approved package/edition and
 * relies on standards-compliant authored terminal status + assessment.
 * STRICT_TRACKED remains the safe default for existing AirTrust SCORM.
 */
export function evaluateTrainingSessionV2(e: TrainingSessionV2): TrainingDecisionV2 {
  if (!e.scopedSessionValid) return result('BLOCKED', 'SESSION_UNTRUSTED');
  if (!e.courseEditionMatches) return result('BLOCKED', 'NEW_EDITION_REQUIRED');

  // Terminal outcomes are authoritative *only* when read from D1. Do not
  // retroactively delete a legitimate completion when the course goes inactive.
  if (e.enrollmentCompleted) {
    if (e.qualificationRequired && !e.qualificationCommitted) {
      return result('QUALIFICATION_PENDING', 'QUALIFICATION_MISSING', true);
    }
    if (e.certificateRequired && !e.certificateVerified) {
      return result('CERTIFICATE_PENDING', 'CERTIFICATE_NOT_VERIFIED', true);
    }
    return result('COMPLETED', 'MATRICULA_CONCLUIDA', true);
  }

  if (!e.enrollmentActive) return result('BLOCKED', 'ENROLLMENT_INACTIVE');
  if (!e.evidencePersisted) return result('CONTINUE', 'EVIDENCE_NOT_PERSISTED');

  if (e.evidenceProfile === 'SCORM_CONFORMANT') {
    if (e.runtime === 'NATIVE' || !e.approvedScormConformance) {
      return result('BLOCKED', 'UNAPPROVED_CONFORMANCE_PROFILE');
    }
    // The SCORM specification does not require airtrust.viewed_slides.
    // The approved SCORM conformance contract is the only safe alternative.
  } else if (!exactSlideCoverage(e.requiredSlides, e.persistedVisitedSlides)) {
    return result('CONTINUE', 'SLIDE_EVIDENCE_MISSING');
  }

  if (e.assessmentPassed === false ||
      e.scormTerminalStatus === 'failed') {
    return result('BLOCKED', 'ASSESSMENT_FAILED');
  }
  // Strict tracked, scored AirTrust lessons require the authored quiz count.
  // A generic 100% score may have been set BEFORE the final module quiz.
  // Approved external SCORM_CONFORMANT packages use the quality-gated authored
  // terminal status instead of proprietary question counters.
  if (e.assessmentPolicy === 'SCORED' && e.evidenceProfile === 'STRICT_TRACKED' &&
      (!Number.isSafeInteger(e.requiredQuestions) || e.requiredQuestions == null ||
        e.requiredQuestions < 1)) {
    return result('CONTINUE', 'ASSESSMENT_PENDING');
  }
  if (!questionsComplete(e.requiredQuestions, e.answeredQuestions)) {
    return result('CONTINUE', 'ASSESSMENT_PENDING');
  }
  if (e.assessmentPolicy === 'SCORED') {
    if (!finitePercent(e.masteryPercent) || e.masteryPercent <= 0) {
      return result('BLOCKED', 'MASTERY_UNCONFIGURED');
    }
    if (e.scorePercent == null) return result('CONTINUE', 'SCORE_MISSING');
    if (!finitePercent(e.scorePercent)) return result('BLOCKED', 'SCORE_INVALID');
    if (e.scorePercent < e.masteryPercent) return result('BLOCKED', 'SCORE_BELOW_MASTERY');
  }

  if (e.runtime !== 'NATIVE' &&
      e.scormTerminalStatus !== 'passed' && e.scormTerminalStatus !== 'completed') {
    return result('CONTINUE', 'SCORM_TERMINAL_MISSING');
  }
  if (!e.userFinalizationRequested) {
    return result('CONTINUE', 'USER_FINALIZATION_REQUIRED');
  }
  return result('READY_TO_FINALIZE', 'SERVER_CONFIRMATION_REQUIRED');
}

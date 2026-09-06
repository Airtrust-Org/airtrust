export type LmsCompletionSource = 'scorm' | 'xapi' | 'manual' | 'administrative';

export type LmsCompletionDecisionCode =
  | 'COMPLETION_ACCEPTED'
  | 'COMPLETION_NOT_REQUESTED'
  | 'ENROLLMENT_INACTIVE'
  | 'COURSE_UNAVAILABLE'
  | 'PACKAGE_BINDING_INVALID'
  | 'ASSET_SESSION_INVALID'
  | 'PROGRESS_EVIDENCE_MISSING'
  | 'CONTENT_EVIDENCE_REQUIRED'
  | 'COMPLETION_EVIDENCE_INSUFFICIENT'
  | 'EXPLICIT_FAILURE'
  | 'STATE_INCONSISTENT'
  | 'MASTERY_SCORE_MISSING'
  | 'MASTERY_SCORE_INVALID'
  | 'MASTERY_SCORE_ZERO_NOT_ALLOWED'
  | 'SCORE_MISSING'
  | 'SCORE_INVALID'
  | 'SCORE_BELOW_MASTERY'
  | 'ADMINISTRATIVE_REASON_REQUIRED';

export interface LmsCompletionEvidenceInput {
  source: LmsCompletionSource;
  enrollmentActive: boolean;
  courseAvailable: boolean;
  packageBound: boolean;
  assetSessionValid: boolean;
  progressRowPresent: boolean;
  progressPct: unknown;
  lessonStatus?: unknown;
  completionStatus?: unknown;
  successStatus?: unknown;
  explicitCompletion?: boolean;
  explicitFailure?: boolean;
  scoreRaw?: unknown;
  scoreMin?: unknown;
  scoreMax?: unknown;
  scoreScaled?: unknown;
  masteryScore?: unknown;
  requiresAssessment: boolean;
  generatesQualification: boolean;
  informativeCourse: boolean;
  /**
   * True only when the server has validated the completion signal using the
   * runtime appropriate to the content (for example SCORM runtime or H5P
   * xAPI). A browser-reported percentage is deliberately not this evidence.
   */
  contentEvidenceValidated?: boolean;
  minimumTimeSatisfied?: boolean;
  stateConsistent?: boolean;
  administrativeAuthorized?: boolean;
  administrativeReason?: unknown;
}

export interface LmsCompletionDecision {
  accepted: boolean;
  code: LmsCompletionDecisionCode;
  scorePct: number | null;
  masteryScore: number | null;
  failurePrecedence: boolean;
}

type ParsedNumber =
  | { kind: 'absent'; value: null }
  | { kind: 'invalid'; value: null }
  | { kind: 'valid'; value: number };

function parseStrictNumber(value: unknown): ParsedNumber {
  if (value === null || value === undefined) return { kind: 'absent', value: null };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { kind: 'invalid', value: null };
  }
  return { kind: 'valid', value };
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseProgressPct(value: unknown): number | null {
  const parsed = parseStrictNumber(value);
  if (parsed.kind !== 'valid' || parsed.value < 0 || parsed.value > 100) return null;
  return parsed.value;
}

function resolveScorePct(input: LmsCompletionEvidenceInput): ParsedNumber {
  const scaled = parseStrictNumber(input.scoreScaled);
  if (scaled.kind === 'invalid') return scaled;
  if (scaled.kind === 'valid') {
    if (scaled.value < 0 || scaled.value > 1) return { kind: 'invalid', value: null };
    return { kind: 'valid', value: scaled.value * 100 };
  }

  const raw = parseStrictNumber(input.scoreRaw);
  const min = parseStrictNumber(input.scoreMin);
  const max = parseStrictNumber(input.scoreMax);
  if (raw.kind === 'invalid' || min.kind === 'invalid' || max.kind === 'invalid') {
    return { kind: 'invalid', value: null };
  }
  if (raw.kind === 'absent') return { kind: 'absent', value: null };

  if (max.kind === 'valid') {
    const minValue = min.kind === 'valid' ? min.value : 0;
    if (max.value <= minValue || raw.value < minValue || raw.value > max.value) {
      return { kind: 'invalid', value: null };
    }
    return { kind: 'valid', value: ((raw.value - minValue) / (max.value - minValue)) * 100 };
  }

  if (raw.value < 0 || raw.value > 100) return { kind: 'invalid', value: null };
  return raw;
}

function reject(
  code: LmsCompletionDecisionCode,
  scorePct: number | null,
  masteryScore: number | null,
  failurePrecedence = false,
): LmsCompletionDecision {
  return { accepted: false, code, scorePct, masteryScore, failurePrecedence };
}

/**
 * Canonical, reusable precedence for LMS completion evidence.
 *
 * Failure is evaluated before any success signal. A client-provided `passed`
 * value never authorizes completion by itself: enrollment, course/package,
 * asset session, persisted/incoming progress and an independent completion
 * signal must also be coherent.
 */
export function evaluateLmsCompletionEvidence(
  input: LmsCompletionEvidenceInput,
): LmsCompletionDecision {
  const lessonStatus = normalizeStatus(input.lessonStatus);
  const completionStatus = normalizeStatus(input.completionStatus);
  const successStatus = normalizeStatus(input.successStatus);
  const progressPct = parseProgressPct(input.progressPct);
  const assessmentRequired = input.requiresAssessment;

  const mastery = parseStrictNumber(input.masteryScore);
  let masteryValue: number | null = mastery.kind === 'valid' ? mastery.value : null;
  if (
    mastery.kind === 'invalid' ||
    (mastery.kind === 'valid' && (mastery.value < 0 || mastery.value > 100))
  ) {
    return reject('MASTERY_SCORE_INVALID', null, null);
  }
  if (assessmentRequired && mastery.kind === 'absent') {
    return reject('MASTERY_SCORE_MISSING', null, null);
  }
  if (assessmentRequired && mastery.kind === 'valid' && mastery.value === 0) {
    return reject('MASTERY_SCORE_ZERO_NOT_ALLOWED', null, 0);
  }
  if (!assessmentRequired && mastery.kind === 'absent') masteryValue = null;

  const score = resolveScorePct(input);
  const scoreValue = score.kind === 'valid' ? score.value : null;
  if (score.kind === 'invalid') return reject('SCORE_INVALID', null, masteryValue);

  const failedStatus = lessonStatus === 'failed' || successStatus === 'failed';
  const passedStatus = lessonStatus === 'passed' || successStatus === 'passed';
  const completedStatus =
    lessonStatus === 'completed' ||
    lessonStatus === 'complete' ||
    completionStatus === 'completed' ||
    completionStatus === 'complete';
  const incompleteStatus =
    lessonStatus === 'incomplete' ||
    completionStatus === 'incomplete' ||
    completionStatus === 'not attempted';
  const manualInformativeCompletion = input.source === 'manual' && input.informativeCourse;
  const failure = Boolean(input.explicitFailure) || failedStatus;
  const completionRequested =
    Boolean(input.explicitCompletion) ||
    passedStatus ||
    completedStatus ||
    manualInformativeCompletion;
  const inconsistent =
    input.stateConsistent === false ||
    (failure && completionRequested) ||
    (incompleteStatus && (passedStatus || completedStatus));

  if (failure) return reject('EXPLICIT_FAILURE', scoreValue, masteryValue, true);
  if (inconsistent) return reject('STATE_INCONSISTENT', scoreValue, masteryValue, true);

  if (assessmentRequired) {
    if (score.kind === 'absent') return reject('SCORE_MISSING', null, masteryValue);
    if (masteryValue !== null && scoreValue !== null && scoreValue < masteryValue) {
      return reject('SCORE_BELOW_MASTERY', scoreValue, masteryValue, true);
    }
  }

  if (!completionRequested) return reject('COMPLETION_NOT_REQUESTED', scoreValue, masteryValue);
  if (!input.enrollmentActive) return reject('ENROLLMENT_INACTIVE', scoreValue, masteryValue);
  if (!input.courseAvailable) return reject('COURSE_UNAVAILABLE', scoreValue, masteryValue);
  if (!input.informativeCourse && !input.packageBound) {
    return reject('PACKAGE_BINDING_INVALID', scoreValue, masteryValue);
  }

  const playerSessionRequired = input.source === 'scorm' || input.source === 'xapi';
  if (playerSessionRequired && !input.assetSessionValid) {
    return reject('ASSET_SESSION_INVALID', scoreValue, masteryValue);
  }

  const progressEvidenceRequired = !input.informativeCourse || input.generatesQualification;
  if (
    progressEvidenceRequired &&
    (!input.progressRowPresent || progressPct === null || progressPct <= 0)
  ) {
    return reject('PROGRESS_EVIDENCE_MISSING', scoreValue, masteryValue);
  }
  if (input.minimumTimeSatisfied === false) {
    return reject('COMPLETION_EVIDENCE_INSUFFICIENT', scoreValue, masteryValue);
  }

  // A qualification is an operational record, not a UI progress badge. For
  // non-interactive content the generic PATCH /progresso value is authored by
  // the browser and cannot authorize issuance on its own. Such content needs a
  // server-validated evidence mechanism before it may mint a qualification.
  if (input.generatesQualification && input.contentEvidenceValidated !== true) {
    return reject('CONTENT_EVIDENCE_REQUIRED', scoreValue, masteryValue);
  }

  if (input.source === 'administrative') {
    const reason =
      typeof input.administrativeReason === 'string' ? input.administrativeReason.trim() : '';
    if (!input.administrativeAuthorized || reason.length < 10) {
      return reject('ADMINISTRATIVE_REASON_REQUIRED', scoreValue, masteryValue);
    }
  }

  const independentCompletion =
    Boolean(input.explicitCompletion) ||
    completionStatus === 'completed' ||
    completionStatus === 'complete' ||
    (progressPct !== null && progressPct >= 100) ||
    manualInformativeCompletion;
  if (!independentCompletion) {
    return reject('COMPLETION_EVIDENCE_INSUFFICIENT', scoreValue, masteryValue);
  }

  return {
    accepted: true,
    code: 'COMPLETION_ACCEPTED',
    scorePct: scoreValue,
    masteryScore: masteryValue,
    failurePrecedence: false,
  };
}

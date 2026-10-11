/**
 * AirTrust Native V1 — deterministic, server-owned checkpoint protocol.
 *
 * This is a domain model, NOT a new LMS completion endpoint. Persistence needs
 * Schema V2 and an atomic, tenant-scoped event ledger with UNIQUE enrollment,
 * cycle, version and event ID. Never use this reducer to conclude matriculas.
 */
import {
  type NativeCourseArtifact,
  validateNativeCourseArtifact,
} from './lms-native-course-contract';
import {
  evaluateNativeAssessment,
  type NativeAssessmentResult,
} from './lms-native-grading';

export type NativeSessionScope = Readonly<{
  empresaId: number;
  matriculaId: number;
  cicloId: number;
  cursoId: number;
  artifactHash: string;
}>;

export type NativeCheckpoint = Readonly<{
  eventId: string;
  sequence: number;
  artifactHash: string;
  unitId: string;
}>;

export type NativeProgressSnapshot = Readonly<{
  scope: NativeSessionScope;
  nextSequence: number;
  seenLessonIds: readonly string[];
  /** Prior validated events as read from the durable, tenant-scoped ledger. */
  recordedEvents: ReadonlyArray<{
    eventId: string;
    sequence: number;
    unitId: string;
  }>;
}>;

export type NativeCheckpointVerdict =
  | { decision: 'APPLIED'; nextSequence: number; seenLessonIds: string[] }
  | { decision: 'IDEMPOTENT_REPLAY'; nextSequence: number; seenLessonIds: string[] };

export type NativeCompletionProof = Readonly<{
  scope: NativeSessionScope;
  persistedSnapshot: NativeProgressSnapshot;
  /**
   * Server's independently validated quiz result for the same enrolled cycle
   * and immutable edition. Never accept client-supplied status or score.
   */
  gradedAttempt: null | {
    scope: NativeSessionScope;
    assessment: NativeAssessmentResult;
    attemptId: number;
  };
  enrollmentStatus: string;
}>;

export type NativeReadinessVerdict = {
  readyForCanonicalCompletion: boolean;
  reason:
    | 'READY'
    | 'NOT_ACTIVE'
    | 'WRONG_EDITION_OR_CYCLE'
    | 'LESSON_EVIDENCE_MISSING'
    | 'ASSESSMENT_EVIDENCE_MISSING'
    | 'ASSESSMENT_NOT_SATISFIED';
};

export class NativeCheckpointError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NativeCheckpointError';
  }
}

const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function reject(code: string): never {
  throw new NativeCheckpointError(code);
}
function goodId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function assertScope(scope: NativeSessionScope): void {
  if (![scope.empresaId, scope.matriculaId, scope.cicloId, scope.cursoId].every(goodId) ||
      !DIGEST.test(scope.artifactHash)) reject('NATIVE_INVALID_SESSION_SCOPE');
}
function sameScope(a: NativeSessionScope, b: NativeSessionScope): boolean {
  return a.empresaId === b.empresaId &&
    a.matriculaId === b.matriculaId &&
    a.cicloId === b.cicloId &&
    a.cursoId === b.cursoId &&
    a.artifactHash === b.artifactHash;
}

/** All evidence must have been produced by the committed event ledger,
 * never by a mutable client-side percentage or page marker. */
function validPersistedNativeEvidence(
  course: NativeCourseArtifact,
  snapshot: NativeProgressSnapshot,
): boolean {
  const lessons = new Set(course.units.filter((unit) => unit.kind === 'lesson').map((unit) => unit.id));
  if (!Number.isSafeInteger(snapshot.nextSequence) || snapshot.nextSequence < 1 ||
      !Array.isArray(snapshot.seenLessonIds) || !Array.isArray(snapshot.recordedEvents)) return false;
  const ledger = snapshot.recordedEvents;
  if (ledger.length !== snapshot.nextSequence - 1 ||
      ledger.some((entry, index) => entry.sequence !== index + 1 ||
        !EVENT_ID.test(entry.eventId) || !lessons.has(entry.unitId)) ||
      new Set(ledger.map((entry) => entry.eventId)).size !== ledger.length) return false;
  const expectedSeen = [...new Set(ledger.map((event) => event.unitId))];
  return expectedSeen.length === snapshot.seenLessonIds.length &&
    expectedSeen.every((unitId, index) => unitId === snapshot.seenLessonIds[index]);
}

export function validateNativeCheckpoint(
  course: NativeCourseArtifact,
  snapshot: NativeProgressSnapshot,
  event: NativeCheckpoint,
): NativeCheckpointVerdict {
  const artifact = validateNativeCourseArtifact(course);
  assertScope(snapshot.scope);
  if (!validPersistedNativeEvidence(artifact, snapshot)) {
    reject('NATIVE_INVALID_PERSISTED_EVIDENCE');
  }
  if (!DIGEST.test(event.artifactHash) ||
      event.artifactHash !== snapshot.scope.artifactHash) reject('NATIVE_EDITION_CONFLICT');
  if (!EVENT_ID.test(event.eventId) || !Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    reject('NATIVE_INVALID_EVENT');
  }
  const lessons = new Set(artifact.units.filter((unit) => unit.kind === 'lesson').map((unit) => unit.id));
  if (!lessons.has(event.unitId)) reject('NATIVE_INVALID_UNIT_EVENT');
  // Requests are idempotent only if all fields match the original committed
  // record. Reusing the same key with different data is a hard conflict.
  const previous = snapshot.recordedEvents.find((entry) => entry.eventId === event.eventId);
  if (previous) {
    if (previous.unitId !== event.unitId || previous.sequence !== event.sequence) {
      reject('NATIVE_IDEMPOTENCY_CONFLICT');
    }
    return {
      decision: 'IDEMPOTENT_REPLAY',
      nextSequence: snapshot.nextSequence,
      seenLessonIds: [...snapshot.seenLessonIds],
    };
  }
  if (event.sequence !== snapshot.nextSequence) reject('NATIVE_STALE_OR_GAP_SEQUENCE');

  return {
    decision: 'APPLIED',
    nextSequence: event.sequence + 1,
    seenLessonIds: snapshot.seenLessonIds.includes(event.unitId)
      ? [...snapshot.seenLessonIds]
      : [...snapshot.seenLessonIds, event.unitId],
  };
}

export function assessNativeCompletionReadiness(
  course: NativeCourseArtifact,
  proof: NativeCompletionProof,
): NativeReadinessVerdict {
  const artifact = validateNativeCourseArtifact(course);
  const snapshot = proof.persistedSnapshot;
  assertScope(proof.scope);
  assertScope(snapshot.scope);

  if (!sameScope(proof.scope, snapshot.scope) ||
      (proof.gradedAttempt && !sameScope(proof.scope, proof.gradedAttempt.scope))) {
    return { readyForCanonicalCompletion: false, reason: 'WRONG_EDITION_OR_CYCLE' };
  }
  if (proof.enrollmentStatus !== 'EM_ANDAMENTO') {
    return { readyForCanonicalCompletion: false, reason: 'NOT_ACTIVE' };
  }
  if (!validPersistedNativeEvidence(artifact, snapshot)) {
    return { readyForCanonicalCompletion: false, reason: 'LESSON_EVIDENCE_MISSING' };
  }
  const required = artifact.units.filter((u) => u.kind === 'lesson').map((u) => u.id);
  const visited = new Set(snapshot.seenLessonIds);
  if (!required.every((id) => visited.has(id))) {
    return { readyForCanonicalCompletion: false, reason: 'LESSON_EVIDENCE_MISSING' };
  }
  if (!proof.gradedAttempt || !goodId(proof.gradedAttempt.attemptId)) {
    return { readyForCanonicalCompletion: false, reason: 'ASSESSMENT_EVIDENCE_MISSING' };
  }
  if (proof.gradedAttempt.assessment.mode !== artifact.policy.mode) {
    return { readyForCanonicalCompletion: false, reason: 'ASSESSMENT_EVIDENCE_MISSING' };
  }
  const grade = proof.gradedAttempt.assessment;
  if (!Number.isSafeInteger(grade.total) || grade.total !== artifact.questions.length ||
      grade.answered !== grade.total ||
      (grade.mode === 'SCORED' &&
        (typeof grade.scorePct !== 'number' || !Number.isFinite(grade.scorePct) ||
          grade.scorePct > 100 ||
          (grade.assessmentSatisfied && grade.scorePct < artifact.policy.masteryScore))) ||
      (grade.mode === 'FORMATIVE' && grade.scorePct !== null)) {
    return { readyForCanonicalCompletion: false, reason: 'ASSESSMENT_EVIDENCE_MISSING' };
  }
  if (!proof.gradedAttempt.assessment.assessmentSatisfied) {
    return { readyForCanonicalCompletion: false, reason: 'ASSESSMENT_NOT_SATISFIED' };
  }
  return { readyForCanonicalCompletion: true, reason: 'READY' };
}

/** Server-only wrapper that evaluates actual submitted answers against the
 * private artifact. The resulting grade must be persisted under the pinned
 * enrollment/cycle/edition before it can be considered by the canonical LMS.
 */
export function gradeNativeSubmittedAnswers(course: NativeCourseArtifact, answers: unknown) {
  return evaluateNativeAssessment(course, answers);
}

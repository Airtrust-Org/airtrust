import { describe, expect, it } from 'vitest';
import { validateNativeCourseArtifact } from '../../lib/lms/lms-native-course-contract';
import {
  assessNativeCompletionReadiness,
  gradeNativeSubmittedAnswers,
  NativeCheckpointError,
  validateNativeCheckpoint,
  type NativeProgressSnapshot,
  type NativeSessionScope,
} from '../../lib/lms/lms-native-evidence-domain';

const sha = 'a'.repeat(64);
const scope: NativeSessionScope = {
  empresaId: 6, matriculaId: 99, cicloId: 2, cursoId: 31, artifactHash: sha,
};
const course = validateNativeCourseArtifact({
  schema: 'AIRTRUST_NATIVE_COURSE_V1',
  courseId: 'nr6',
  packageVersion: 'v1',
  title: 'NR-6 EPI',
  locale: 'pt-BR',
  policy: { mode: 'SCORED', masteryScore: 75 },
  assets: [],
  units: [
    { id: 'intro', kind: 'lesson', title: 'Introdução', blocks: [{ type: 'paragraph', text: 'Conteúdo' }], questionIds: [] },
    { id: 'safety', kind: 'lesson', title: 'Segurança', blocks: [{ type: 'paragraph', text: 'Conteúdo' }], questionIds: [] },
    { id: 'exam', kind: 'assessment', title: 'Prova', blocks: [], questionIds: ['q1'] },
  ],
  questions: [{
    id: 'q1', prompt: 'Qual é a correta?',
    options: [{ id: 'yes', text: 'Sim' }, { id: 'no', text: 'Não' }],
    correctOptionId: 'yes', feedbackCorrect: 'Acertou', feedbackIncorrect: 'Revisar',
  }],
});
const starting = (): NativeProgressSnapshot => ({
  scope, nextSequence: 1, seenLessonIds: [], recordedEvents: [],
});
const goodGrade = () => gradeNativeSubmittedAnswers(course, [{ questionId: 'q1', optionId: 'yes' }]);
const proof = (state: NativeProgressSnapshot, grade: ReturnType<typeof goodGrade> | null = goodGrade()) => ({
  scope,
  persistedSnapshot: state,
  gradedAttempt: grade ? { scope, assessment: grade, attemptId: 42 } : null,
  enrollmentStatus: 'EM_ANDAMENTO',
});

describe('Native V1 — optimistic checkpoint sequence, version pinning and replay', () => {
  it('records lesson evidence once, retains stable order and advances sequence', () => {
    const first = validateNativeCheckpoint(course, starting(), {
      eventId: 'event-1', sequence: 1, artifactHash: sha, unitId: 'intro',
    });
    expect(first).toEqual({ decision: 'APPLIED', nextSequence: 2, seenLessonIds: ['intro'] });
    const saved: NativeProgressSnapshot = {
      scope, nextSequence: 2, seenLessonIds: ['intro'],
      recordedEvents: [{ eventId: 'event-1', sequence: 1, unitId: 'intro' }],
    };
    expect(validateNativeCheckpoint(course, saved, {
      eventId: 'event-2', sequence: 2, artifactHash: sha, unitId: 'intro',
    })).toEqual({ decision: 'APPLIED', nextSequence: 3, seenLessonIds: ['intro'] });
  });

  it('exact retry is idempotent; altered retry is a conflict', () => {
    const saved: NativeProgressSnapshot = {
      scope, nextSequence: 2, seenLessonIds: ['intro'],
      recordedEvents: [{ eventId: 'event-1', sequence: 1, unitId: 'intro' }],
    };
    expect(validateNativeCheckpoint(course, saved, {
      eventId: 'event-1', sequence: 1, artifactHash: sha, unitId: 'intro',
    }).decision).toBe('IDEMPOTENT_REPLAY');
    expect(() => validateNativeCheckpoint(course, saved, {
      eventId: 'event-1', sequence: 1, artifactHash: sha, unitId: 'safety',
    })).toThrowError('NATIVE_IDEMPOTENCY_CONFLICT');
  });

  it('fails closed for stale version and missing or out-of-order events', () => {
    expect(() => validateNativeCheckpoint(course, starting(), {
      eventId: 'event-1', sequence: 1, artifactHash: 'b'.repeat(64), unitId: 'intro',
    })).toThrowError('NATIVE_EDITION_CONFLICT');
    expect(() => validateNativeCheckpoint(course, starting(), {
      eventId: 'event-1', sequence: 5, artifactHash: sha, unitId: 'intro',
    })).toThrowError('NATIVE_STALE_OR_GAP_SEQUENCE');
    expect(() => validateNativeCheckpoint(course, starting(), {
      eventId: 'event-1', sequence: 1, artifactHash: sha, unitId: 'unknown',
    })).toThrowError('NATIVE_INVALID_UNIT_EVENT');
    expect(() => validateNativeCheckpoint(course, starting(), {
      eventId: 'event-1', sequence: 1, artifactHash: sha, unitId: 'exam',
    })).toThrowError('NATIVE_INVALID_UNIT_EVENT');
  });

  it('rejects fabricated or inconsistent persisted evidence', () => {
    const forged: NativeProgressSnapshot = { scope, nextSequence: 2, seenLessonIds: ['intro'], recordedEvents: [] };
    expect(() => validateNativeCheckpoint(course, forged, {
      eventId: 'event-2', sequence: 2, artifactHash: sha, unitId: 'safety',
    })).toThrowError(NativeCheckpointError);
  });

  it('requires all persisted lessons and an independently graded exam to be ready', () => {
    expect(assessNativeCompletionReadiness(course, proof(starting()))).toEqual({
      readyForCanonicalCompletion: false, reason: 'LESSON_EVIDENCE_MISSING',
    });
    const state: NativeProgressSnapshot = {
      scope, nextSequence: 3, seenLessonIds: ['intro', 'safety'],
      recordedEvents: [
        { eventId: 'event-1', sequence: 1, unitId: 'intro' },
        { eventId: 'event-2', sequence: 2, unitId: 'safety' },
      ],
    };
    expect(assessNativeCompletionReadiness(course, proof(state))).toEqual({
      readyForCanonicalCompletion: true, reason: 'READY',
    });
    expect(assessNativeCompletionReadiness(course, proof(state, null)).reason)
      .toBe('ASSESSMENT_EVIDENCE_MISSING');
    expect(assessNativeCompletionReadiness(course, proof(state,
      gradeNativeSubmittedAnswers(course, [{ questionId: 'q1', optionId: 'no' }]),
    )).reason).toBe('ASSESSMENT_NOT_SATISFIED');
  });

  it('never accepts the progress of another tenant, enrollment, cycle or edition', () => {
    const saved: NativeProgressSnapshot = {
      scope, nextSequence: 3, seenLessonIds: ['intro', 'safety'],
      recordedEvents: [
        { eventId: 'event-1', sequence: 1, unitId: 'intro' },
        { eventId: 'event-2', sequence: 2, unitId: 'safety' },
      ],
    };
    for (const changed of [
      { empresaId: 7 }, { matriculaId: 100 }, { cicloId: 3 }, { cursoId: 32 },
      { artifactHash: 'b'.repeat(64) },
    ]) {
      const mismatched = { ...scope, ...changed };
      expect(assessNativeCompletionReadiness(course, {
        ...proof(saved), scope: mismatched,
      }).reason).toBe('WRONG_EDITION_OR_CYCLE');
      expect(assessNativeCompletionReadiness(course, {
        ...proof(saved), gradedAttempt: { scope: mismatched, assessment: goodGrade(), attemptId: 42 },
      }).reason).toBe('WRONG_EDITION_OR_CYCLE');
    }
  });

  it('read-only, concluded or cancelled enrollments do not become eligible', () => {
    const saved: NativeProgressSnapshot = {
      scope, nextSequence: 3, seenLessonIds: ['intro', 'safety'],
      recordedEvents: [
        { eventId: 'event-1', sequence: 1, unitId: 'intro' },
        { eventId: 'event-2', sequence: 2, unitId: 'safety' },
      ],
    };
    for (const status of ['CONCLUIDO', 'CANCELADO', 'NAO_INICIADO', 'REPROVADO']) {
      expect(assessNativeCompletionReadiness(course, {
        ...proof(saved), enrollmentStatus: status,
      }).reason).toBe('NOT_ACTIVE');
    }
  });

  it('cannot use a client-authored fake score or incomplete assessment count', () => {
    const saved: NativeProgressSnapshot = {
      scope, nextSequence: 3, seenLessonIds: ['intro', 'safety'],
      recordedEvents: [
        { eventId: 'event-1', sequence: 1, unitId: 'intro' },
        { eventId: 'event-2', sequence: 2, unitId: 'safety' },
      ],
    };
    expect(assessNativeCompletionReadiness(course, proof(saved, {
      mode: 'SCORED', answered: 0, total: 1, scorePct: 100, assessmentSatisfied: true,
    })).reason).toBe('ASSESSMENT_EVIDENCE_MISSING');
  });
});

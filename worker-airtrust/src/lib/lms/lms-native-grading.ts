import {
  validateNativeCourseArtifact,
  type NativeCourseArtifact,
} from './lms-native-course-contract';

/**
 * Server-only assessment evaluator; never return the answer key.
 * Result is NOT a completion authorization. Eligibility additionally requires
 * persisted session evidence, tenant/RBAC, edition and matrícula validation.
 */
export type NativeAssessmentResult =
  | {
    mode: 'SCORED';
    answered: number;
    total: number;
    scorePct: number | null;
    assessmentSatisfied: boolean;
  }
  | {
    mode: 'FORMATIVE';
    answered: number;
    total: number;
    scorePct: null;
    assessmentSatisfied: boolean;
  };

export class NativeSubmissionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeSubmissionError';
  }
}

export function evaluateNativeAssessment(
  artifact: NativeCourseArtifact,
  submission: unknown,
): NativeAssessmentResult {
  const course = validateNativeCourseArtifact(artifact);
  if (!Array.isArray(submission) || submission.length > course.questions.length) {
    throw new NativeSubmissionError('NATIVE_INVALID_SUBMISSION');
  }
  const questions = new Map(course.questions.map((q) => [q.id, q]));
  const answerMap = new Map<string, string>();

  for (const item of submission) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new NativeSubmissionError('NATIVE_INVALID_ANSWER_ENTRY');
    }
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).length !== 2 ||
        typeof candidate.questionId !== 'string' ||
        typeof candidate.optionId !== 'string') {
      throw new NativeSubmissionError('NATIVE_INVALID_ANSWER_ENTRY');
    }
    const question = questions.get(candidate.questionId);
    if (!question || answerMap.has(candidate.questionId) ||
        !question.options.some((option) => option.id === candidate.optionId)) {
      throw new NativeSubmissionError('NATIVE_INVALID_ANSWER_ENTRY');
    }
    answerMap.set(candidate.questionId, candidate.optionId);
  }

  const answered = answerMap.size;
  const total = course.questions.length;
  if (course.policy.mode === 'FORMATIVE') {
    return { mode: 'FORMATIVE', answered, total, scorePct: null, assessmentSatisfied: answered === total };
  }

  if (answered !== total) {
    return { mode: 'SCORED', answered, total, scorePct: null, assessmentSatisfied: false };
  }
  const correct = course.questions.filter((q) => answerMap.get(q.id) === q.correctOptionId).length;
  const scorePct = Math.round((100 * correct) / total);
  return {
    mode: 'SCORED',
    answered,
    total,
    scorePct,
    assessmentSatisfied: scorePct >= course.policy.masteryScore,
  };
}

import {
  validateNativeCourseArtifact,
  type NativeCourseArtifact,
} from './lms-native-course-contract';

/** Explicit non-certifying practice. Never returns a score, attempt, or completion. */
export class NativePracticeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativePracticeError';
  }
}

export function gradeNativePracticeAnswer(
  artifact: NativeCourseArtifact, submission: unknown,
): { question_id: string; correct: boolean; feedback: string } {
  const course = validateNativeCourseArtifact(artifact);
  if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
    throw new NativePracticeError('NATIVE_INVALID_PRACTICE_ANSWER');
  }
  const answer = submission as Record<string, unknown>;
  if (Object.keys(answer).length !== 2 ||
    typeof answer.questionId !== 'string' ||
    typeof answer.optionId !== 'string') {
    throw new NativePracticeError('NATIVE_INVALID_PRACTICE_ANSWER');
  }
  const practiceIds = new Set(course.units.filter((unit) => unit.kind === 'practice')
    .flatMap((unit) => unit.questionIds));
  if (!practiceIds.has(answer.questionId)) {
    throw new NativePracticeError('NATIVE_PRACTICE_QUESTION_NOT_FOUND');
  }
  const question = course.questions.find((q) => q.id === answer.questionId);
  if (!question?.options.some((option) => option.id === answer.optionId)) {
    throw new NativePracticeError('NATIVE_INVALID_PRACTICE_OPTION');
  }
  const correct = question.correctOptionId === answer.optionId;
  return {
    question_id: question.id,
    correct,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

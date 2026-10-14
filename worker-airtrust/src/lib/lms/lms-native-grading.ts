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
  // Module practice is formative: never score it, consume an exam attempt,
  // or require a practice answer in the certifying submission.
  const practiceIds = new Set(course.units
    .filter((unit) => unit.kind === 'practice').flatMap((unit) => unit.questionIds));
  const certifyingQuestions = course.questions.filter((q) => !practiceIds.has(q.id));
  if (!Array.isArray(submission) || submission.length > certifyingQuestions.length) {
    throw new NativeSubmissionError('NATIVE_INVALID_SUBMISSION');
  }
  // An injected practice answer is not valid in a formal exam attempt.
  const questions = new Map(certifyingQuestions.map((q) => [q.id, q]));
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
  const total = certifyingQuestions.length;
  const scenarios = new Set(course.units.filter((unit) => unit.kind === 'scenario').flatMap((unit) => unit.questionIds));
  const exams = new Set(course.units.filter((unit) => unit.kind === 'assessment').flatMap((unit) => unit.questionIds));
  // Required scenario decisions and certifying exam questions are independent.
  // Otherwise non-certifying practice questions could dilute or inflate the grade.
  const decisionsSatisfied = course.questions
    .filter((q) => scenarios.has(q.id))
    .every((q) => answerMap.get(q.id) === q.correctOptionId);
  if (course.policy.mode === 'FORMATIVE') {
    return {
      mode: 'FORMATIVE', answered, total, scorePct: null,
      assessmentSatisfied: answered === total && decisionsSatisfied,
    };
  }

  if (answered !== total) {
    return { mode: 'SCORED', answered, total, scorePct: null, assessmentSatisfied: false };
  }
  const certifying = course.questions.filter((q) => exams.has(q.id));
  const correct = certifying.filter((q) => answerMap.get(q.id) === q.correctOptionId).length;
  const masteryScore = course.policy.masteryScore;
  const scorePct = Math.round((100 * correct) / certifying.length);
  // SCORM moduleGate means a global pass cannot compensate for failure in
  // any compulsory module assessment. Scenarios remain an independent gate.
  const modulesSatisfied = course.policy.mode !== 'SCORED' || !course.policy.moduleGate ||
    course.units.filter((unit) => unit.kind === 'assessment').every((unit) => {
      const passed = unit.questionIds.filter((id) =>
        answerMap.get(id) === questions.get(id)?.correctOptionId
      ).length;
      return passed * 100 >= masteryScore * unit.questionIds.length;
    });
  return {
    mode: 'SCORED',
    answered,
    total,
    scorePct,
    assessmentSatisfied: decisionsSatisfied && modulesSatisfied &&
      correct * 100 >= course.policy.masteryScore * certifying.length,
  };
}

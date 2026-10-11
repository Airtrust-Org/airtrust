import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  toNativeLearnerCourse,
  validateNativeCourseArtifact,
} from '../../lib/lms/lms-native-course-contract';
import { evaluateNativeAssessment } from '../../lib/lms/lms-native-grading';

const fixturePath = join(process.cwd(), '..', 'scripts', 'learning-factory', 'fixtures', 'native-v1-synthetic.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

describe('Factory Python → AirTrust Worker: synthetic Native V1 interoperability', () => {
  it('accepts the exact generated artifact as a valid course', () => {
    const course = validateNativeCourseArtifact(fixture);
    expect(course.schema).toBe('AIRTRUST_NATIVE_COURSE_V1');
    expect(course.packageVersion).toMatch(/^n-[a-f0-9]{32}$/);
    expect(course.units.map((unit) => unit.kind)).toEqual(['lesson', 'scenario', 'assessment']);
    expect(course.references?.[0]?.label).toBe('NR-6');
    expect(course.assets[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('never exposes an authoring answer key to the native React player', () => {
    const privateArtifact = validateNativeCourseArtifact(fixture);
    const learner = toNativeLearnerCourse(privateArtifact);
    const json = JSON.stringify(learner);
    expect(json).not.toContain('correctOptionId');
    expect(json).not.toContain('feedbackCorrect');
    expect(json).not.toContain('feedbackIncorrect');
    expect(learner.questions).toHaveLength(2);
  });

  it('separates valid practice decisions from the certifying assessment', () => {
    const artifact = validateNativeCourseArtifact(fixture);
    const full = evaluateNativeAssessment(artifact, [
      { questionId: 'choice-question-001', optionId: 'option-2' },
      { questionId: 'exam-question-001', optionId: 'option-2' },
    ]);
    expect(full).toMatchObject({ mode: 'SCORED', scorePct: 100, assessmentSatisfied: true });
    const failedScenario = evaluateNativeAssessment(artifact, [
      { questionId: 'choice-question-001', optionId: 'option-1' },
      { questionId: 'exam-question-001', optionId: 'option-2' },
    ]);
    expect(failedScenario).toMatchObject({ mode: 'SCORED', scorePct: 100, assessmentSatisfied: false });
    const failedExam = evaluateNativeAssessment(artifact, [
      { questionId: 'choice-question-001', optionId: 'option-2' },
      { questionId: 'exam-question-001', optionId: 'option-1' },
    ]);
    expect(failedExam).toMatchObject({ mode: 'SCORED', scorePct: 0, assessmentSatisfied: false });
  });
});

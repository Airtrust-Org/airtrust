import { describe, expect, it } from 'vitest';
import { evaluateNativeAssessment, NativeSubmissionError } from '../../lib/lms/lms-native-grading';
import { validateNativeCourseArtifact } from '../../lib/lms/lms-native-course-contract';

function course(mode: 'SCORED' | 'FORMATIVE' = 'SCORED') {
  return validateNativeCourseArtifact({
    schema: 'AIRTRUST_NATIVE_COURSE_V1',
    courseId: 'test-training',
    packageVersion: 'rc1',
    title: 'Curso de validação',
    locale: 'pt-BR',
    policy: mode === 'SCORED' ? { mode, masteryScore: 70 } : { mode },
    assets: [],
    units: [
      { id: 'lesson', title: 'Introdução', kind: 'lesson', blocks: [{ type: 'paragraph', text: 'Aula' }], questionIds: [] },
      { id: 'quiz', title: 'Prova', kind: 'assessment', blocks: [], questionIds: ['q1', 'q2'] },
    ],
    questions: [
      {
        id: 'q1', prompt: 'Pergunta 1',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctOptionId: 'a', feedbackCorrect: 'Sim', feedbackIncorrect: 'Não',
      },
      {
        id: 'q2', prompt: 'Pergunta 2',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctOptionId: 'b', feedbackCorrect: 'Sim', feedbackIncorrect: 'Não',
      },
    ],
  });
}
const good = [{ questionId: 'q1', optionId: 'a' }, { questionId: 'q2', optionId: 'b' }];
const bad = [{ questionId: 'q1', optionId: 'b' }, { questionId: 'q2', optionId: 'a' }];

describe('AirTrust native server-side grading', () => {
  it('computes real score from server-only answer keys', () => {
    expect(evaluateNativeAssessment(course(), good)).toEqual({
      mode: 'SCORED', answered: 2, total: 2, scorePct: 100, assessmentSatisfied: true,
    });
  });

  it('keeps zero a valid failing score rather than null', () => {
    expect(evaluateNativeAssessment(course(), bad)).toEqual({
      mode: 'SCORED', answered: 2, total: 2, scorePct: 0, assessmentSatisfied: false,
    });
  });

  it('keeps incomplete attempt pending and never makes up a grade', () => {
    expect(evaluateNativeAssessment(course(), [good[0]])).toEqual({
      mode: 'SCORED', answered: 1, total: 2, scorePct: null, assessmentSatisfied: false,
    });
  });

  it('does not give approved result when score below mastery', () => {
    expect(evaluateNativeAssessment(course(), [good[0], bad[1]])).toMatchObject({
      scorePct: 50, assessmentSatisfied: false,
    });
  });

  it('does not grant eligibility when a rounded display score reaches mastery prematurely', () => {
    const base = course();
    const extraQuestion = {
      ...base.questions[0],
      id: 'q3',
    };
    const input = validateNativeCourseArtifact({
      ...base,
      policy: { mode: 'SCORED', masteryScore: 67 },
      questions: [...base.questions, extraQuestion],
      units: base.units.map((unit) => unit.kind === 'assessment'
        ? { ...unit, questionIds: [...unit.questionIds, 'q3'] }
        : unit),
    });
    const result = evaluateNativeAssessment(input, [
      ...good,
      { questionId: 'q3', optionId: 'b' },
    ]);
    expect(result).toMatchObject({ scorePct: 67, assessmentSatisfied: false });
  });

  it('formative participation does not invent numerical scores', () => {
    expect(evaluateNativeAssessment(course('FORMATIVE'), good)).toEqual({
      mode: 'FORMATIVE', answered: 2, total: 2, scorePct: null, assessmentSatisfied: true,
    });
    expect(evaluateNativeAssessment(course('FORMATIVE'), [good[0]])).toMatchObject({
      assessmentSatisfied: false,
    });
  });

  it('rejects unknown questions, options, duplicates and client-supplied score', () => {
    const badPayloads = [
      [...good, good[0]],
      [{ questionId: 'q-unknown', optionId: 'a' }],
      [{ questionId: 'q1', optionId: 'forged' }],
      [{ questionId: 'q1', optionId: 'a', scorePct: 100 }],
      { scorePct: 100, completed: true },
      null,
    ];
    for (const payload of badPayloads) {
      expect(() => evaluateNativeAssessment(course(), payload)).toThrowError(NativeSubmissionError);
    }
  });

  it('requires correct scenario decisions without inflating or diluting certification scores', () => {
    const base = course();
    const scenario = { ...base.questions[0], id: 'scenario-q1' };
    const enriched = validateNativeCourseArtifact({
      ...base,
      questions: [...base.questions, scenario],
      units: [
        base.units[0],
        { id: 'decision', kind: 'scenario', title: 'Decisão', blocks: [], questionIds: ['scenario-q1'] },
        base.units[1],
      ],
    });
    const wrongDecision = evaluateNativeAssessment(enriched, [
      ...good, { questionId: 'scenario-q1', optionId: 'b' },
    ]);
    expect(wrongDecision).toEqual({
      mode: 'SCORED', answered: 3, total: 3, scorePct: 100,
      assessmentSatisfied: false,
    });
    const correctDecision = evaluateNativeAssessment(enriched, [
      ...good, { questionId: 'scenario-q1', optionId: 'a' },
    ]);
    expect(correctDecision).toMatchObject({ scorePct: 100, assessmentSatisfied: true });
    const badExam = evaluateNativeAssessment(enriched, [
      ...bad, { questionId: 'scenario-q1', optionId: 'a' },
    ]);
    expect(badExam).toMatchObject({ scorePct: 0, assessmentSatisfied: false });
  });

  it('does not modify private answer keys when scoring', () => {
    const input = course();
    evaluateNativeAssessment(input, good);
    expect(input.questions.map((q) => q.correctOptionId)).toEqual(['a', 'b']);
  });
});

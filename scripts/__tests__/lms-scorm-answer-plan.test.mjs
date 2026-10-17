import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractAnswerPlan } from '../validation/lms-scorm-answer-plan.mjs';

// The M8 metadata is intentionally presentation-only; answers are in
// window.COURSE_DATA (not window.AIRTRUST_COURSE_MODEL).
const metadataOnly = {
  schema: 'AIRTRUST_TRAINING_MODEL_M8',
  slides: [{ id: 'intro', kind: 'lesson' }, { id: 'qa', kind: 'assessment' }],
};
const runtime = {
  courseId: 'synthetic',
  slides: [
    { id: 'intro', kind: 'lesson' },
    { id: 'qa', kind: 'assessment',
      questions: [
        { q: 'Question 1', options: ['no', 'yes', 'maybe'], answer: 1 },
        { q: 'Question 2', options: ['pass', 'fail'], answer: 0 },
      ] },
  ],
};

describe('read-only SCORM complete-assessment evidence driver', () => {
  it('the certifier actually uses the loaded runtime model and does not log an extracted answer key', () => {
    const source = readFileSync(new URL('../validation/production-lms-active-course-certification-readonly.mjs', import.meta.url), 'utf8');
    assert.match(source, /runtime:\s*window\.COURSE_DATA/);
    assert.match(source, /extractAnswerPlan\(loaded\.runtime\s*\?\?\s*model\)/);
    assert.doesNotMatch(source, /JSON\.stringify\(answerPlan\)/);
  });

  it('recognizes the blind spot: M8 model has zero answers but runtime has the actual correct-answer plan', () => {
    assert.deepEqual(extractAnswerPlan(metadataOnly), []);
    const plan = extractAnswerPlan(runtime);
    assert.deepEqual(plan.map(x => ({ slideIndex: x.slideIndex, indices: x.indices })),
      [{ slideIndex: 2, indices: [1] }, { slideIndex: 2, indices: [0] }]);
    assert.ok(plan[0].path.includes('.questions[0]'));
  });
  it('does not invent correct answers for missing or invalid question keys', () => {
    assert.deepEqual(extractAnswerPlan({ slides: [{ questions: [
      { options: ['a', 'b'] }, { options: ['a', 'b'], answer: 99 }, { options: ['a', 'b'], answer: -1 },
    ] }] }), []);
  });
  it('also supports the conventional correctIndex authoring schema', () => {
    const plan = extractAnswerPlan({ slides: [{ questions: [{ options: ['a', 'b'], correctIndex: 0 }] }] });
    assert.deepEqual(plan.map(x => x.indices), [[0]]);
  });
});

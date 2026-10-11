import { describe, expect, it } from 'vitest';
import {
  NATIVE_COURSE_SCHEMA,
  NativeCourseValidationError,
  toNativeLearnerCourse,
  validateNativeCourseArtifact,
} from '../../lib/lms/lms-native-course-contract';

function valid() {
  return {
    schema: NATIVE_COURSE_SCHEMA,
    courseId: 'nr6-epi',
    packageVersion: 'rc4',
    title: 'NR-6 — Equipamentos de Proteção Individual',
    locale: 'pt-BR',
    policy: { mode: 'SCORED', masteryScore: 80 },
    assets: [
      { id: 'hero', path: 'media/hero.webp', sha256: 'a'.repeat(64), mime: 'image/webp' },
      { id: 'clip', path: 'media/clip.mp4', sha256: 'b'.repeat(64), mime: 'video/mp4' },
    ],
    units: [
      {
        id: 'intro',
        title: 'Introdução',
        kind: 'lesson',
        blocks: [
          { type: 'heading', text: 'Segurança' },
          { type: 'paragraph', text: '<script>alert("x")</script>' },
          { type: 'image', assetId: 'hero', alt: 'Equipamento de proteção individual' },
          { type: 'video', assetId: 'clip', alt: 'Demonstração EPI' },
          { type: 'bullets', items: ['Escolher', 'Conferir', 'Utilizar'] },
        ],
        questionIds: [],
      },
      {
        id: 'quiz',
        title: 'Verificação de aprendizagem',
        kind: 'assessment',
        blocks: [],
        questionIds: ['q1'],
      },
    ],
    questions: [{
      id: 'q1',
      prompt: 'Como proceder?',
      options: [{ id: 'a', text: 'Ignorar' }, { id: 'b', text: 'Inspecionar' }],
      correctOptionId: 'b',
      feedbackCorrect: 'Certo',
      feedbackIncorrect: 'Revise o procedimento',
    }],
  };
}
type Editable = ReturnType<typeof valid>;
const clone = (): Editable => structuredClone(valid());

function expectError(value: unknown, code: string) {
  expect(() => validateNativeCourseArtifact(value)).toThrowError(NativeCourseValidationError);
  expect(() => validateNativeCourseArtifact(value)).toThrowError(code);
}

describe('AirTrust Native V1: fail-closed authoring contract', () => {
  it('accepts a well-formed scored artifact but does not certify it', () => {
    const artifact = validateNativeCourseArtifact(valid());
    expect(artifact.units).toHaveLength(2);
    expect(artifact.policy).toEqual({ mode: 'SCORED', masteryScore: 80 });
  });

  it('removes the entire answer key and grading feedback from learner payload', () => {
    const full = validateNativeCourseArtifact(valid());
    const learner = toNativeLearnerCourse(full);
    const serialized = JSON.stringify(learner);
    expect(serialized).not.toContain('correctOptionId');
    expect(serialized).not.toContain('feedbackCorrect');
    expect(serialized).not.toContain('feedbackIncorrect');
    expect(serialized).not.toContain('Revise o procedimento');
    expect(learner.questions[0]?.options).toHaveLength(2);
    expect(learner.units[0]?.blocks[1]).toEqual({
      type: 'paragraph', text: '<script>alert("x")</script>',
    });
    learner.questions[0]!.options[0]!.text = 'alteração local';
    expect(full.questions[0]!.options[0]!.text).toBe('Ignorar');
  });

  it('does not permit an import draft to be published as a native course', () => {
    expectError({ schema: 'AIRTRUST_NATIVE_IMPORT_DRAFT_V1', publishable: true }, 'NATIVE_UNEXPECTED_FIELD');
  });

  it('rejects invented completion, certificate or permission fields', () => {
    expectError({ ...valid(), completed: true }, 'NATIVE_UNEXPECTED_FIELD');
    expectError({ ...valid(), empresa_id: 4 }, 'NATIVE_UNEXPECTED_FIELD');
    const exam = clone();
    (exam.questions[0] as object as Record<string, unknown>).passed = true;
    expectError(exam, 'NATIVE_UNEXPECTED_FIELD');
  });

  it('requires stable unique ids for slides, questions, assets and answers', () => {
    const course = clone();
    course.units[1].id = 'intro';
    expectError(course, 'NATIVE_DUPLICATE_ID');
    const other = clone();
    other.questions[0].options[1].id = 'a';
    expectError(other, 'NATIVE_DUPLICATE_ID');
  });

  it('rejects non-local, traversal, script, and mismatched assets', () => {
    for (const path of ['../other.webp', '/secret.webp', 'https://cdn.example.com/file.webp', 'img/%2e%2e/file.webp']) {
      const candidate = clone();
      candidate.assets[0].path = path;
      expectError(candidate, 'NATIVE_INVALID_ASSET_PATH');
    }
    const mismatch = clone();
    mismatch.assets[0].mime = 'video/mp4';
    expectError(mismatch, 'NATIVE_MIME_MISMATCH');
    const unknown = clone();
    unknown.units[0].blocks[2] = { type: 'image', assetId: 'unknown', alt: 'invalid' };
    expectError(unknown, 'NATIVE_UNKNOWN_ASSET');
  });

  it('refuses executable blocks or URLs in the content model', () => {
    const course = clone();
    course.units[0].blocks.push({ type: 'html', code: 'alert(1)' } as never);
    expectError(course, 'NATIVE_UNSUPPORTED_BLOCK');
  });

  it('keeps the proof policy separate from a display of progress', () => {
    const course = clone();
    course.units[0].questionIds.push('q1');
    expectError(course, 'NATIVE_QUESTIONS_IN_LESSON');
    const second = clone();
    second.units[1].questionIds = [];
    expectError(second, 'NATIVE_EMPTY_ASSESSMENT');
  });

  it('does not accept missing or reused question references', () => {
    const course = clone();
    course.units[1].questionIds = ['missing'];
    expectError(course, 'NATIVE_UNKNOWN_QUESTION');
    const unlinked = clone();
    unlinked.units = [{ ...unlinked.units[0] }];
    expectError(unlinked, 'NATIVE_UNUSED_QUESTION');
  });

  it('requires scored courses to have questions and a valid mastery threshold', () => {
    const noQuestions = clone();
    noQuestions.policy.masteryScore = 0;
    expectError(noQuestions, 'NATIVE_INVALID_MASTERY');
    const noExam = clone();
    noExam.units = [noExam.units[0]];
    noExam.questions = [];
    expectError(noExam, 'NATIVE_SCORED_WITHOUT_QUESTIONS');
  });

  it('permits explicit formative courses without invented score or answers', () => {
    const course = clone();
    course.policy = { mode: 'FORMATIVE' } as Editable['policy'];
    course.questions = [];
    course.units = [course.units[0]];
    expect(validateNativeCourseArtifact(course).policy).toEqual({ mode: 'FORMATIVE' });
    expect(toNativeLearnerCourse(validateNativeCourseArtifact(course)).questions).toEqual([]);
  });
});

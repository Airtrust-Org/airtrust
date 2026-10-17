import { describe, expect, it } from 'vitest';
import { canWriteNative } from '../../routes/lms-native-write';
import {
  gradeNativePracticeAnswer, NativePracticeError,
} from '../../lib/lms/lms-native-practice';
import {
  toNativeLearnerCourse, validateNativeCourseArtifact,
} from '../../lib/lms/lms-native-course-contract';
import { evaluateNativeAssessment, NativeSubmissionError } from '../../lib/lms/lms-native-grading';
import { assessNativeCompletionReadiness } from '../../lib/lms/lms-native-evidence-domain';

function fixture() {
  return validateNativeCourseArtifact({
    schema: 'AIRTRUST_NATIVE_COURSE_V1', courseId: 'safety', packageVersion: 'rc01',
    title: 'Segurança e Qualidade', locale: 'pt-BR',
    policy: { mode: 'SCORED', masteryScore: 70 },
    assets: [], units: [
      { id: 'l1', title: 'Módulo 1', kind: 'lesson', questionIds: [],
        blocks: [{ type: 'paragraph', text: 'Treinamento com conteúdo completo' }] },
      { id: 'p1', title: 'Fixação Módulo 1', kind: 'practice', questionIds: ['practice-q'],
        blocks: [] },
      { id: 'exam', title: 'Prova oficial', kind: 'assessment', questionIds: ['exam-q'],
        blocks: [] },
    ], questions: [
      { id: 'practice-q', prompt: 'Reforce o conceito', options: [
        {id: 'a', text: 'Sim'}, {id: 'b', text: 'Não'},
      ], correctOptionId: 'b', feedbackCorrect: 'Conceito consolidado',
        feedbackIncorrect: 'Leia novamente o módulo' },
      { id: 'exam-q', prompt: 'Questão oficial', options: [
        {id: 'a', text: 'Adequado'}, {id: 'b', text: 'Inadequado'},
      ], correctOptionId: 'a', feedbackCorrect: 'Correto',
        feedbackIncorrect: 'Incorreto' },
    ],
  });
}

describe('AirTrust P3 — formative practice strictly isolated from official exam', () => {
  it('uses exact tenant flags and stays disabled in production', () => {
    const base = {
      ENVIRONMENT:'staging',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'6',
    };
    expect(canWriteNative(base as never, 6)).toBe(true);
    expect(canWriteNative({...base,ENVIRONMENT:'production'} as never,6)).toBe(false);
    expect(canWriteNative(base as never,7)).toBe(false);
    expect(canWriteNative({...base,NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'*'} as never,6)).toBe(false);
    expect(canWriteNative({...base,NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:''} as never,6)).toBe(false);
  });

  it('keeps answer keys and pedagogical feedback out of learner projection', () => {
    const student = toNativeLearnerCourse(fixture());
    expect(student.units[1].kind).toBe('practice');
    expect(JSON.stringify(student)).not.toContain('correctOptionId');
    expect(JSON.stringify(student)).not.toContain('Conceito consolidado');
  });

  it('returns server feedback only for practice, and never a score', () => {
    const c = fixture();
    expect(gradeNativePracticeAnswer(c, {questionId:'practice-q',optionId:'a'})).toEqual({
      question_id:'practice-q', correct:false, feedback:'Leia novamente o módulo',
    });
    const correct = gradeNativePracticeAnswer(c,{questionId:'practice-q',optionId:'b'});
    expect(correct).toEqual({question_id:'practice-q',correct:true,feedback:'Conceito consolidado'});
    expect(JSON.stringify(correct)).not.toMatch(/score|completed|attempt|certific/i);
  });

  it('never leaks official exam answers through the practice correction channel', () => {
    const c = fixture();
    for (const payload of [
      {questionId:'exam-q',optionId:'a'},
      {questionId:'practice-q',optionId:'forged'},
      {questionId:'practice-q',optionId:'a',score:100},
      {questionId:'practice-q'},
      null,
    ]) expect(() => gradeNativePracticeAnswer(c,payload)).toThrow(NativePracticeError);
  });

  it('requires only official questions for a certifying attempt; rejects injected practice', () => {
    const c = fixture();
    expect(evaluateNativeAssessment(c,[{questionId:'exam-q',optionId:'a'}])).toEqual({
      mode:'SCORED', answered:1, total:1, scorePct:100, assessmentSatisfied:true,
    });
    expect(evaluateNativeAssessment(c,[{questionId:'exam-q',optionId:'b'}]).assessmentSatisfied).toBe(false);
    expect(() => evaluateNativeAssessment(c,[{questionId:'practice-q',optionId:'b'}]))
      .toThrow(NativeSubmissionError);
    expect(() => evaluateNativeAssessment(c,[
      {questionId:'exam-q',optionId:'a'},{questionId:'practice-q',optionId:'b'},
    ])).toThrow(NativeSubmissionError);
  });

  it('does not require practice to be answered to satisfy formal completion readiness', () => {
    const c=fixture(), hash='a'.repeat(64);
    const scope={empresaId:6,matriculaId:100,cicloId:23,cursoId:57,artifactHash:hash};
    const grade=evaluateNativeAssessment(c,[{questionId:'exam-q',optionId:'a'}]);
    expect(assessNativeCompletionReadiness(c,{
      scope,
      persistedSnapshot:{scope,nextSequence:2,seenLessonIds:['l1'],
        recordedEvents:[{eventId:'event-1',sequence:1,unitId:'l1'}]},
      gradedAttempt:{scope,attemptId:10,assessment:grade},enrollmentStatus:'EM_ANDAMENTO',
    })).toEqual({readyForCanonicalCompletion:true,reason:'READY'});
  });
});

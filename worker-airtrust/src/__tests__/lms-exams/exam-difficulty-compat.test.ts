import {describe,it,expect} from 'vitest';
import {
 createQuestionDraft,reviewQuestionDraft,publishReviewedQuestion,
 verifyPublishedQuestion,validateQuestionRevision,
} from '../../lib/lms-exams/question-bank-domain';

const content={
 moduleId:'m1',topicId:'t1',sourceUnitId:'u1',sourceSha256:'a'.repeat(64),
 prompt:'Qual alternativa está correta?',choices:[{id:'o1',text:'Correta'},{id:'o2',text:'Incorreta'}],
 correctChoiceId:'o1',explanation:'A primeira alternativa está correta.',
};

describe('Banco de avaliações — compatibilidade de dificuldade',()=>{
 it('mantém publicação e verificação de revisão legada sem dificuldade',async()=>{
  const draft=createQuestionDraft({tenantId:6,courseId:15,questionId:'q1'},content,'u1');
  expect(Object.hasOwn(draft,'difficulty')).toBe(false);
  const reviewed=reviewQuestionDraft(draft,'u2');
  const published=await publishReviewedQuestion(reviewed,'u3');
  expect(await verifyPublishedQuestion(published)).toBe(true);
  expect(Object.hasOwn(published,'difficulty')).toBe(false);
 });
 it('aceita nível explícito e preserva imutabilidade de revisão',async()=>{
  const draft=createQuestionDraft({tenantId:6,courseId:15,questionId:'q2'},
   {...content,difficulty:'AVANCADA'},'u1');
  const reviewed=reviewQuestionDraft(draft,'u2');
  const published=await publishReviewedQuestion(reviewed,'u3');
  expect(published.difficulty).toBe('AVANCADA');
  expect(await verifyPublishedQuestion(published)).toBe(true);
  expect(()=>validateQuestionRevision({...published,difficulty:'BASICA'})).not.toThrow();
  expect(await verifyPublishedQuestion({...published,difficulty:'BASICA'})).toBe(false);
 });
 it('rejeita dificuldade fora dos três níveis',()=>{
  expect(()=>createQuestionDraft({tenantId:6,courseId:15,questionId:'q3'},
   {...content,difficulty:'INDEFINIDA' as 'AVANCADA'},'u1')).toThrow();
 });
});

import {describe,it,expect} from 'vitest';
import {normalizeQuestionDifficulty,difficultyForPatch} from './examDifficulty';
describe('Question Bank difficulty form',()=>{
 it('sends an absent difficulty for the unclassified legacy option',()=>{
  const difficulty=normalizeQuestionDifficulty('');
  expect(difficulty).toBeUndefined();
  const payload={questionId:'q1',content:{prompt:'P',...(difficulty===undefined?{}:{difficulty})}};
  expect(JSON.stringify(payload)).not.toContain('difficulty');
 });
 it('allows clearing previously classified drafts',()=>{
  const before={difficulty:'AVANCADA'};
  const after={...before,difficulty:normalizeQuestionDifficulty('')};
  expect(after.difficulty).toBeUndefined();
  expect(JSON.stringify({changes:{difficulty:difficultyForPatch(after.difficulty)}})).toContain('"difficulty":null');
 });
 it('accepts exactly three difficulties, rejecting unsupported input',()=>{
  expect(normalizeQuestionDifficulty('BASICA')).toBe('BASICA');
  expect(normalizeQuestionDifficulty('INTERMEDIARIA')).toBe('INTERMEDIARIA');
  expect(normalizeQuestionDifficulty('AVANCADA')).toBe('AVANCADA');
  expect(()=>normalizeQuestionDifficulty('0')).toThrow('NIVEL_DE_DIFICULDADE_INVALIDO');
 });
});

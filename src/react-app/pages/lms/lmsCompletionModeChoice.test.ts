import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_SCORM_COMPLETION_POLICY,
  SCORM_COMPLETION_MODE_CHOICES,
  canUseLegacyEvaluatedPolicy,
} from './lmsCompletionModeChoice';

describe('modalidade de conclusão para novas edições SCORM', () => {
  it('inicia novos cursos como formativos, não com avaliação obrigatória', () => {
    expect(DEFAULT_NEW_SCORM_COMPLETION_POLICY).toBe('FORMATIVE');
  });
  it('oferece somente as duas modalidades decididas pelo proprietário', () => {
    expect(SCORM_COMPLETION_MODE_CHOICES).toEqual([
      { value: 'FORMATIVE', label: 'Formativo — sem avaliação final' },
      { value: 'SCORED', label: 'Com avaliação' },
    ]);
  });
});

describe('proteção contra falsa prova externa no curso', () => {
  it('impede criar ou migrar um curso para SCORED sem edição de avaliação certificada', () => {
    expect(canUseLegacyEvaluatedPolicy('SCORED', undefined)).toBe(false);
    expect(canUseLegacyEvaluatedPolicy('SCORED', 'FORMATIVE')).toBe(false);
  });
  it('mantém edição histórica SCORED editável sem reinterpretar a política', () => {
    expect(canUseLegacyEvaluatedPolicy('SCORED', 'SCORED')).toBe(true);
    expect(canUseLegacyEvaluatedPolicy('FORMATIVE', 'SCORED')).toBe(true);
    expect(canUseLegacyEvaluatedPolicy('FORMATIVE', undefined)).toBe(true);
  });
});

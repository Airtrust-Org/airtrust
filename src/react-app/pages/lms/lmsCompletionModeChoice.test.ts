import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_SCORM_COMPLETION_POLICY,
  SCORM_COMPLETION_MODE_CHOICES,
  canUseLegacyEvaluatedPolicy,
  canSaveScormModeForRole,
  defaultNewScormModeForRole,
} from './lmsCompletionModeChoice';

describe('modalidade de conclusão para novas edições SCORM', () => {
  it('inicia novos cursos como formativos, não com avaliação obrigatória', () => {
    expect(DEFAULT_NEW_SCORM_COMPLETION_POLICY).toBe('FORMATIVE');
  });
  it('alinha seleção de novo curso à permissão real no backend', () => {
    expect(defaultNewScormModeForRole(true)).toBe('FORMATIVE');
    expect(defaultNewScormModeForRole(false)).toBe('SCORED');
  });
  it('oferece somente as duas modalidades decididas pelo proprietário', () => {
    expect(SCORM_COMPLETION_MODE_CHOICES).toEqual([
      { value: 'FORMATIVE', label: 'Formativo — sem avaliação final' },
      { value: 'SCORED', label: 'Com avaliação' },
    ]);
  });
});

describe('autorização de envio do formulário de novo curso', () => {
  it('permite que o gestor envie o novo SCORM SCORED padrão ao onSave', () => {
    const requested = defaultNewScormModeForRole(false);
    expect(canSaveScormModeForRole(requested, undefined, false, false)).toBe(true);
  });
  it('permite que o administrador envie o novo SCORM formativo padrão ao onSave', () => {
    const requested = defaultNewScormModeForRole(true);
    expect(canSaveScormModeForRole(requested, undefined, true, false)).toBe(true);
  });
  it('mantém a troca de modalidade bloqueada na edição existente', () => {
    expect(canSaveScormModeForRole('FORMATIVE', 'SCORED', true, true)).toBe(false);
    expect(canSaveScormModeForRole('SCORED', 'FORMATIVE', false, true)).toBe(false);
  });
  it('não autoriza criação SCORED pelo administrador sem edição de prova habilitada', () => {
    expect(canSaveScormModeForRole('SCORED', undefined, true, false)).toBe(false);
  });
});

describe('proteção contra falsa prova externa no curso', () => {
  it('impede criar ou migrar um curso para SCORED sem edição de avaliação certificada', () => {
    expect(canUseLegacyEvaluatedPolicy('SCORED', undefined)).toBe(false);
    expect(canUseLegacyEvaluatedPolicy('SCORED', 'FORMATIVE')).toBe(false);
  });
  it('impede downgrade da edição SCORED pela edição simples de metadados', () => {
    expect(canUseLegacyEvaluatedPolicy('SCORED', 'SCORED')).toBe(true);
    expect(canUseLegacyEvaluatedPolicy('FORMATIVE', 'SCORED')).toBe(false);
    expect(canUseLegacyEvaluatedPolicy('FORMATIVE', undefined)).toBe(true);
    expect(canUseLegacyEvaluatedPolicy('FORMATIVE', 'FORMATIVE')).toBe(true);
  });
});

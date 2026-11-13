import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_SCORM_COMPLETION_POLICY,
  SCORM_COMPLETION_MODE_CHOICES,
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

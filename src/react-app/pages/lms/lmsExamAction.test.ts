import { describe, expect, it } from 'vitest';
import { getLmsExamAction } from './lmsExamAction';

describe('ação de avaliação do curso', () => {
  it('exibe Fazer avaliação somente com prontidão do Worker', () => {
    expect(getLmsExamAction('READY')).toBe('Fazer avaliação');
  });
  it('reconhece aprovação pendente de fechamento canônico', () => {
    expect(getLmsExamAction('PASSED')).toBe('Confirmar conclusão');
  });
  it.each(['STUDY_PENDING', 'NOT_AVAILABLE', 'COMPLETED', 'EXTERNAL_ASSESSMENT_PENDING', '', null, undefined])(
    'não fabrica botão para estado %s', (state) => {
      expect(getLmsExamAction(state)).toBeNull();
    },
  );
});

import { describe, expect, it } from 'vitest';
import {
  buildUnlinkedAccountToast,
  countWithoutLinkedAccount,
  LMS_UNLINKED_ACCOUNT_HINT,
} from '../lmsLearnerLink';

describe('lmsLearnerLink', () => {
  it('conta somente linhas explicitamente sem vínculo (0), ignorando ausente e vinculado', () => {
    expect(
      countWithoutLinkedAccount([
        { aluno_vinculado: 0 },
        { aluno_vinculado: 1 },
        {},
        { aluno_vinculado: 0 },
      ]),
    ).toBe(2);
  });

  it('não gera aviso quando todos têm conta', () => {
    expect(buildUnlinkedAccountToast(0)).toBeNull();
    expect(buildUnlinkedAccountToast(Number.NaN)).toBeNull();
  });

  it('gera aviso no singular e no plural sem expor dados pessoais', () => {
    expect(buildUnlinkedAccountToast(1)).toContain('1 funcionário matriculado não tem');
    expect(buildUnlinkedAccountToast(3)).toContain('3 funcionários matriculados não têm');
    expect(LMS_UNLINKED_ACCOUNT_HINT).toContain('o aluno não verá o curso');
  });
});

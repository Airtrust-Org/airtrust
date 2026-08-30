import { describe, expect, it } from 'vitest';
import { safeFrmsRecoveryError } from '../useFrmsRecovery';

describe('safeFrmsRecoveryError', () => {
  it('keeps load failures operational and free of backend detail', () => {
    const message = safeFrmsRecoveryError('load');

    expect(message).toBe('Não foi possível carregar o contexto de recuperação do FRMS. Tente novamente.');
    expect(message).not.toMatch(/SQL|SQLITE|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });

  it('keeps submission failures operational and free of backend detail', () => {
    const message = safeFrmsRecoveryError('submit');

    expect(message).toBe('Não foi possível registrar a atividade de recuperação. Tente novamente.');
    expect(message).not.toMatch(/SQL|SQLITE|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });
});

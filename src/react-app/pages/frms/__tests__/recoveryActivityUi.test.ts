import { describe, expect, it } from 'vitest';
import { safeRecoveryActivityErrorMessage } from '../recoveryActivityUi';

describe('recoveryActivityUi', () => {
  it('does not expose technical backend details', () => {
    const technicalDetail = 'SQLITE_CONSTRAINT: frms_recovery_activity at worker.ts:912:7';
    const message = safeRecoveryActivityErrorMessage(technicalDetail);

    expect(message).toBe('Não foi possível registrar a condição operacional. Tente novamente.');
    expect(message).not.toContain('SQLITE_CONSTRAINT');
    expect(message).not.toContain('worker.ts');
  });
});

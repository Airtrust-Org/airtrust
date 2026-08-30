import { describe, expect, it } from 'vitest';
import { safeOperationalReadinessError } from '../useOperationalReadiness';

describe('safeOperationalReadinessError', () => {
  it('keeps load failures operational and free of backend detail', () => {
    const message = safeOperationalReadinessError('load');

    expect(message).toBe('Não foi possível carregar a prontidão operacional. Tente novamente.');
    expect(message).not.toMatch(/SQL|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });

  it('keeps submission failures operational and free of backend detail', () => {
    const message = safeOperationalReadinessError('submit');

    expect(message).toBe('Não foi possível registrar o teste de prontidão. Tente novamente.');
    expect(message).not.toMatch(/SQL|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });
});

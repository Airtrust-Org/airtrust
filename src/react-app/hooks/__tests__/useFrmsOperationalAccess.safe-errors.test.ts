import { describe, expect, it } from 'vitest';
import { safeFrmsOperationalRequestError } from '../useFrmsOperationalAccess';

describe('FRMS maintenance operational errors', () => {
  it('returns only operational messages for every visible request kind', () => {
    const messages = [
      safeFrmsOperationalRequestError('access'),
      safeFrmsOperationalRequestError('maintenance-team'),
      safeFrmsOperationalRequestError('maintenance-checkin'),
    ];

    for (const message of messages) {
      expect(message).not.toContain('SQLITE');
      expect(message).not.toContain('worker.ts');
      expect(message).not.toContain('stack');
      expect(message).toMatch(/Não foi possível/);
    }
  });
});

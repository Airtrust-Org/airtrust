import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFrmsOperationalRequestError, withFrmsAccessTimeout } from '../useFrmsOperationalAccess';

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

describe('FRMS operational access must fail closed when a request hangs', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts a never-settling access request within the defined deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const pending = withFrmsAccessTimeout((signal) => {
      requestSignal = signal;
      return new Promise<string>(() => {});
    }, 100);

    const rejection = expect(pending).rejects.toThrow('FRMS_ACCESS_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('returns valid evidence without aborting when the request succeeds', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const result = await withFrmsAccessTimeout(async (signal) => {
      requestSignal = signal;
      return { enabled: true };
    }, 100);
    expect(result).toEqual({ enabled: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(requestSignal?.aborted).toBe(false);
  });
});

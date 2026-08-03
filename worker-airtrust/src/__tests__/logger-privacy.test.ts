import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../utils/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structured logger privacy', () => {
  it('keeps the user id but omits the user email', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const context = {
      get(key: string) {
        if (key === 'requestId') return 'req-privacy-1';
        if (key === 'user') return { id: 42, email: 'operator@example.invalid' };
        return undefined;
      },
      env: { ENVIRONMENT: 'test' },
    };

    createLogger(context, 'PrivacyTest').info('safe log');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const serialized = String(logSpy.mock.calls[0]?.[0]);
    const entry = JSON.parse(serialized) as {
      context: Record<string, unknown>;
    };

    expect(entry.context.userId).toBe(42);
    expect(entry.context).not.toHaveProperty('userEmail');
    expect(serialized).not.toContain('operator@example.invalid');
  });
});

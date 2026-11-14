import { afterEach, describe, expect, it, vi } from 'vitest';
import { importWithRetry } from './lazyWithRetry';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lazy import with unavailable session storage', () => {
  it('resolves successful import even when retry marker removal throws', async () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        removeItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
      },
    });
    const module = { default: () => null };
    await expect(importWithRetry(() => Promise.resolve(module), 'public-page')).resolves.toBe(module);
  });

  it('does not reload when the retry guard cannot be persisted', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/forgot-password', href: 'https://example.test/forgot-password', reload },
      sessionStorage: {
        getItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
        setItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
      },
    });
    vi.stubGlobal('navigator', { userAgent: 'vitest' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const importer = vi.fn().mockRejectedValue(new Error('ChunkLoadError'));
    await expect(importWithRetry(importer, 'public-page', { reloadOnChunkError: true, maxAttempts: 2 })).rejects.toThrow('ChunkLoadError');
    expect(importer).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });
});

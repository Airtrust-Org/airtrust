import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionProfilesBounded, type SessionProfilesFetcher } from '../sessionProfilesTransport';

afterEach(() => { vi.useRealTimers(); });

describe('session profile lookup fail-closed transport', () => {
  it('times out and aborts each stalled GET, never a third attempt', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetcher: SessionProfilesFetcher = vi.fn((_url, options) => {
      signals.push(options.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    const result = fetchSessionProfilesBounded('/session-profiles', fetcher, 100);
    const rejected = expect(result).rejects.toThrow('SESSION_PROFILES_TIMEOUT');
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('retries once on a transport TypeError, not on HTTP errors', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    expect((await fetchSessionProfilesBounded('/session-profiles', fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const forbidden = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    expect((await fetchSessionProfilesBounded('/session-profiles', forbidden)).status).toBe(403);
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  it('does not retry 401, 503 or unexpected failures', async () => {
    for (const status of [401, 503]) {
      const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }));
      expect((await fetchSessionProfilesBounded('/session-profiles', fetcher)).status).toBe(status);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const unexpected = vi.fn().mockRejectedValue(new Error('schema error'));
    await expect(fetchSessionProfilesBounded('/session-profiles', unexpected)).rejects.toThrow('schema error');
    expect(unexpected).toHaveBeenCalledTimes(1);
  });

  it('allows only read-only GET with an abort signal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    await fetchSessionProfilesBounded('/session-profiles', fetcher);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', cache: 'no-store', signal: expect.any(AbortSignal) });
  });
});

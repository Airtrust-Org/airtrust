import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFrmsSnapshotBounded, type FrmsSnapshotFetcher } from '../frmsSnapshotTransport';

describe('FRMS operational snapshot fail-closed transport', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts a stalled GET, retries only once, and accepts fresh evidence', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    let calls = 0;
    const fetcher: FrmsSnapshotFetcher = async (_url, options) => {
      signals.push(options.signal as AbortSignal);
      calls++;
      if (calls === 1) return new Promise<Response>(() => {});
      return new Response(JSON.stringify({ success: true, data: [{ empresa_id: 999013 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const pending = fetchFrmsSnapshotBounded<{ success: boolean }>('https://example.test/api/frms/operational-snapshot', fetcher, 100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(calls).toBe(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(120);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('never replays a 401 or 403 response as a network error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 403 }));
    const result = await fetchFrmsSnapshotBounded('https://example.test/api/frms/operational-snapshot', fetcher, 100);
    expect(result.response.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails within two bounded deadlines when the network ignores abort', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
    const pending = fetchFrmsSnapshotBounded('https://example.test/api/frms/operational-snapshot', fetcher, 100);
    const rejection = expect(pending).rejects.toThrow('FRMS_SNAPSHOT_TIMEOUT');
    await vi.advanceTimersByTimeAsync(250);
    await rejection;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not replay a terminal authentication error', async () => {
    const fetcher = vi.fn(async () => { throw new Error('Authentication required'); });
    await expect(fetchFrmsSnapshotBounded('https://example.test/api/frms/operational-snapshot', fetcher, 100))
      .rejects.toThrow('Authentication required');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

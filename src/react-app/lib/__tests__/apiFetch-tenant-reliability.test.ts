import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadApiFetch() {
  vi.resetModules();
  const module = await import('../apiFetch');
  module.installGlobalApiFetch();
  return module;
}

describe('apiFetch tenant-safe bounded caches', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    globalThis.__airtrust_api_fetch_installed__ = undefined;
    globalThis.__airtrust_api_fetch__ = undefined;
    globalThis.__airtrust_inflightGetMap__ = undefined;
    globalThis.__airtrust_recentGetCache__ = undefined;
    globalThis.__airtrust_endpointBackoff__ = undefined;
    vi.restoreAllMocks();
  });

  it('preserves the original server response during local backoff', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'origin unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    const { apiFetch } = await loadApiFetch();

    const first = await apiFetch('/api/dashboard/reliability');
    const second = await apiFetch('/api/dashboard/reliability');

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(second.headers.get('X-AirTrust-Local-Backoff')).toBe('1');
    expect(await second.json()).toEqual({ error: 'origin unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears recentGetCache, endpointBackoff and inflight map on tenant reset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: ['fresh'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    const { apiFetch } = await loadApiFetch();
    const tenant = await import('../tenant-data-layer');

    await apiFetch('/api/dashboard/cache');
    await apiFetch('/api/dashboard/cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    tenant.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });
    await apiFetch('/api/dashboard/cache');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps cached response snapshots instead of retaining unlimited Response clones', async () => {
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL) =>
        new Response(JSON.stringify({ url: String(input) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    const { apiFetch } = await loadApiFetch();

    for (let index = 0; index < 80; index += 1) {
      await apiFetch(`/api/dashboard/cache-${index}`);
    }

    expect(globalThis.__airtrust_recentGetCache__?.size).toBeLessThanOrEqual(64);
  });

  it('aborts a request in progress when company changes', async () => {
    const tenant = await import('../tenant-data-layer');
    const signal = tenant.combineWithTenantAbortSignal();
    const request = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

    tenant.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });

    expect(signal.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

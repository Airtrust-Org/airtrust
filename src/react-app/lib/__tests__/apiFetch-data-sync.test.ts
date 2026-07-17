import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, installGlobalApiFetch } from '../apiFetch';
import { onDataChanged } from '../../utils/data-sync';

describe('apiFetch data-change notifications', () => {
  beforeEach(() => {
    globalThis.__airtrust_api_fetch_installed__ = undefined;
    globalThis.__airtrust_api_fetch__ = undefined;
    globalThis.__airtrust_inflightGetMap__ = undefined;
    globalThis.__airtrust_recentGetCache__ = undefined;
    globalThis.__airtrust_endpointBackoff__ = undefined;
    vi.restoreAllMocks();
  });

  it('emits the scale scope after a successful mutation', async () => {
    const callback = vi.fn();
    const cleanup = onDataChanged(callback, ['escala']);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    installGlobalApiFetch();
    const response = await apiFetch('/api/escalas/evd/1', { method: 'PATCH' });

    expect(response?.ok).toBe(true);
    expect(callback).toHaveBeenCalledWith('escala');
    cleanup();
  });

  it('does not emit for GET requests', async () => {
    const callback = vi.fn();
    const cleanup = onDataChanged(callback, ['escala']);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    installGlobalApiFetch();
    const response = await apiFetch('/api/escalas/evd/1', { method: 'GET' });

    expect(response?.ok).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    cleanup();
  });

  it('authenticated requests with Authorization header skip fallback retry and cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    installGlobalApiFetch();

    const response = await apiFetch('/api/funcionarios/123', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(response?.ok).toBe(true);
    // Authenticated GET: hasAuthorizationHeader=true causes cache bypass
    // and no fallback retry attempted in performFetchWithFallback
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('authenticated mutation requests do not persist origin override on fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    installGlobalApiFetch();

    const response = await apiFetch('/api/escalas/evd/1', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(response?.ok).toBe(true);
    // Authenticated mutation: hasAuthorizationHeader=true prevents fallback attempt
    // therefore no origin override is persisted to sessionStorage
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('API_ORIGIN_OVERRIDE')).toBeNull();
  });
});

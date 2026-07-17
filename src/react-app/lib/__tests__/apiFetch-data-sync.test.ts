import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, installGlobalApiFetch } from '../apiFetch';
import { onDataChanged } from '../../utils/data-sync';

async function loadApiFetchWithRemoteOrigin() {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://airtrust-api.airtrust.workers.dev/api');
  return import('../apiFetch');
}

describe('apiFetch data-change notifications', () => {
  beforeEach(() => {
    globalThis.__airtrust_api_fetch_installed__ = undefined;
    globalThis.__airtrust_api_fetch__ = undefined;
    globalThis.__airtrust_inflightGetMap__ = undefined;
    globalThis.__airtrust_recentGetCache__ = undefined;
    globalThis.__airtrust_endpointBackoff__ = undefined;
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
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

  it('returns the original 404 after one authenticated call and never stores an alternate origin', async () => {
    vi.stubEnv('VITE_ALLOW_API_ORIGIN_FALLBACK', 'true');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('alternate', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock });

    const { apiFetch: configuredApiFetch, installGlobalApiFetch: installConfiguredApiFetch } =
      await loadApiFetchWithRemoteOrigin();
    installConfiguredApiFetch('https://airtrust-api.airtrust.workers.dev/api');
    const response = await configuredApiFetch('/api/health', {
      headers: { authorization: 'Bearer token' },
    });

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('API_ORIGIN_OVERRIDE')).toBeNull();
  });

  it('removes a persisted alternate origin before an authenticated Request is sent', async () => {
    vi.stubEnv('VITE_ALLOW_API_ORIGIN_FALLBACK', 'true');
    window.sessionStorage.setItem('API_ORIGIN_OVERRIDE', 'https://airtrust-api-production.airtrust.workers.dev');
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock });

    const { apiFetch: configuredApiFetch, installGlobalApiFetch: installConfiguredApiFetch } =
      await loadApiFetchWithRemoteOrigin();
    installConfiguredApiFetch('https://airtrust-api.airtrust.workers.dev/api');
    await configuredApiFetch(
      new Request('http://localhost/api/health', {
        headers: new Headers({ AUTHORIZATION: 'Bearer token' }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://airtrust-api.airtrust.workers.dev/api/health',
      undefined,
    );
    expect(window.sessionStorage.getItem('API_ORIGIN_OVERRIDE')).toBeNull();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s never falls back', async (method) => {
    vi.stubEnv('VITE_ALLOW_API_ORIGIN_FALLBACK', 'true');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('alternate', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock });

    const { apiFetch: configuredApiFetch, installGlobalApiFetch: installConfiguredApiFetch } =
      await loadApiFetchWithRemoteOrigin();
    installConfiguredApiFetch('https://airtrust-api.airtrust.workers.dev/api');
    const response = await configuredApiFetch('/api/health', { method });

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never falls back for an unauthenticated tenant-scoped GET', async () => {
    vi.stubEnv('VITE_ALLOW_API_ORIGIN_FALLBACK', 'true');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('alternate', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock });

    const { apiFetch: configuredApiFetch, installGlobalApiFetch: installConfiguredApiFetch } =
      await loadApiFetchWithRemoteOrigin();
    installConfiguredApiFetch('https://airtrust-api.airtrust.workers.dev/api');
    const response = await configuredApiFetch('/api/escalas/1');

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('permits the explicit local-development health fallback only', async () => {
    vi.stubEnv('VITE_ALLOW_API_ORIGIN_FALLBACK', 'true');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('alternate', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchMock });

    const { apiFetch: configuredApiFetch, installGlobalApiFetch: installConfiguredApiFetch } =
      await loadApiFetchWithRemoteOrigin();
    installConfiguredApiFetch('https://airtrust-api.airtrust.workers.dev/api');
    const response = await configuredApiFetch('/api/health');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('API_ORIGIN_OVERRIDE')).toBe(
      'https://airtrust-api-production.airtrust.workers.dev',
    );
  });
});

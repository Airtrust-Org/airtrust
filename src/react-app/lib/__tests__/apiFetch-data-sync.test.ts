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
});

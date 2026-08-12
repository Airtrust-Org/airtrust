import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('apiFetch network failures', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__airtrust_api_fetch_installed__ = undefined;
    globalThis.__airtrust_api_fetch__ = undefined;
    globalThis.__airtrust_inflightGetMap__ = undefined;
    globalThis.__airtrust_recentGetCache__ = undefined;
    globalThis.__airtrust_endpointBackoff__ = undefined;
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.cookie = 'auth_token=; Max-Age=0; path=/';
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not mask a failed authenticated upload mutation with a same-origin Pages retry', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.airtrust.online/api');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const { apiFetch, installGlobalApiFetch } = await import('../apiFetch');
    installGlobalApiFetch('https://api.airtrust.online/api');

    await expect(
      apiFetch(
        '/api/lms/cursos/32/content-upload/file?tipo_conteudo=scorm&upload_id=upload-1&path=media%2Fcap08%2Fpcm_connectors.webp',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Type': 'image/webp' },
          body: new Uint8Array([1, 2, 3, 4]),
        },
      ),
    ).rejects.toThrow('Failed to fetch');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://api.airtrust.online/api/lms/cursos/32/content-upload/file',
    );
  });
});

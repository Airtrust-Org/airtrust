import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithAuthMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: fetchWithAuthMock,
}));

vi.mock('../apiFetch', () => ({ apiFetch: apiFetchMock }));

function makeJwt(tenantId: number): string {
  return `header.${btoa(JSON.stringify({ empresa_id: tenantId, exp: 4_102_444_800 }))}.signature`;
}

describe('appFetch routing', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    fetchWithAuthMock.mockReset();
    apiFetchMock.mockReset();
    fetchWithAuthMock.mockResolvedValue(new Response('ok'));
    apiFetchMock.mockResolvedValue(new Response('ok'));
  });

  it('uses refresh-aware authentication for the configured API', async () => {
    const { appFetch } = await import('../app-fetch');
    await appFetch('https://api.airtrust.online/api/funcionarios');

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('routes a relative AirTrust API request through auth even without a cached session', async () => {
    const { appFetch } = await import('../app-fetch');
    await appFetch('/api/funcionarios');

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('keeps public assets outside the authenticated client', async () => {
    const { appFetch } = await import('../app-fetch');
    await appFetch('/assets/airtrust-logo.svg');

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
  });

  it('does not leak the bearer token to an external origin whose path starts with /api', async () => {
    const { appFetch } = await import('../app-fetch');
    await appFetch('https://external.example/api/resource');

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
  });

  it('rejects a response from tenant A that completes after tenant B is selected', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    let resolveResponse!: (response: Response) => void;
    fetchWithAuthMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const { appFetch } = await import('../app-fetch');
    const tenant = await import('../tenant-data-layer');
    const request = appFetch('/api/funcionarios/7');

    sessionStorage.setItem('airtrust_token', makeJwt(2));
    tenant.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });
    resolveResponse(new Response(JSON.stringify({ id: 7, nome: 'Empresa A' })));

    await expect(request).rejects.toMatchObject({ name: 'StaleTenantResponseError' });
  });

  it('rejects an in-flight API response after logout', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    let resolveResponse!: (response: Response) => void;
    fetchWithAuthMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const { appFetch } = await import('../app-fetch');
    const request = appFetch('/api/funcionarios/7');

    sessionStorage.removeItem('airtrust_token');
    window.dispatchEvent(new CustomEvent('airtrust:token-changed', { detail: { token: null } }));
    resolveResponse(new Response(JSON.stringify({ id: 7, nome: 'Empresa A' })));

    await expect(request).rejects.toMatchObject({ name: 'StaleTenantResponseError' });
  });
});

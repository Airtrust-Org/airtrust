import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: apiFetchMock,
}));

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    get length() {
      return store.size;
    },
  };
}

function makeJwt(expirationSecondsFromNow: number): string {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expirationSecondsFromNow,
    sub: '1',
    empresa_id: 10,
  };

  return [
    btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    btoa(JSON.stringify(payload)),
    'signature',
  ].join('.');
}

describe('auth session storage', () => {
  beforeEach(() => {
    vi.resetModules();
    apiFetchMock.mockReset();

    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorage(),
      configurable: true,
    });
  });

  it('usa sessão temporária quando a preferência de lembrar login ainda não existe', async () => {
    const module = await import('../api');

    expect(module.getPersistLogin()).toBe(false);
  });

  it('lê token persistente sem migrar para sessionStorage', async () => {
    const module = await import('../api');
    const accessToken = makeJwt(3600);

    localStorage.setItem('airtrust_token', accessToken);
    localStorage.setItem('airtrust_refresh_token', 'refresh-persistente');

    expect(module.getAccessToken()).toBe(accessToken);
    expect(module.getRefreshToken()).toBe('refresh-persistente');
    expect(sessionStorage.getItem('airtrust_token')).toBeNull();
    expect(sessionStorage.getItem('airtrust_refresh_token')).toBeNull();
  });

  it('limpa sessão somente em falha terminal de refresh', async () => {
    const module = await import('../api');
    module.setPersistLogin(true);
    module.setTokens(makeJwt(3600), 'refresh-terminal');

    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Revogado', code: 'REFRESH_TOKEN_REVOKED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(module.refreshAccessToken()).rejects.toMatchObject({
      name: 'AuthRefreshError',
      terminal: true,
    });

    expect(module.getAccessToken()).toBeNull();
    expect(module.getRefreshToken()).toBeNull();
  });

  it('mantém sessão local em falha transitória de refresh', async () => {
    const module = await import('../api');
    const accessToken = makeJwt(3600);
    module.setPersistLogin(true);
    module.setTokens(accessToken, 'refresh-transiente');

    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Serviço indisponível' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(module.refreshAccessToken()).rejects.toMatchObject({
      name: 'AuthRefreshError',
      terminal: false,
    });

    expect(module.readAuthStorageValue('airtrust_token')).toBe(accessToken);
    expect(module.readAuthStorageValue('airtrust_refresh_token')).toBe('refresh-transiente');
  });
  it('coalesces concurrent refreshes into a single request', async () => {
    const module = await import('../api');
    module.setPersistLogin(true);
    module.setTokens(makeJwt(1), 'refresh-race');

    let resolveResponse!: (response: Response) => void;
    apiFetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const first = module.refreshAccessToken();
    const second = module.refreshAccessToken();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(
        JSON.stringify({
          data: {
            accessToken: makeJwt(3600),
            refreshToken: 'refresh-rotated',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await Promise.all([first, second]);
    expect(module.getRefreshToken()).toBe('refresh-rotated');
  });
});

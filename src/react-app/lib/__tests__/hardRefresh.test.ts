import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hardRefreshAppWithDeps } from '../hardRefresh';

type ServiceWorkerRegistrationLike = Pick<ServiceWorkerRegistration, 'update'>;

function createMemoryStorage(initial: Record<string, string> = {}) {
  const memory = new Map(Object.entries(initial));
  return {
    get length() {
      return memory.size;
    },
    key(index: number): string | null {
      return Array.from(memory.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      memory.delete(key);
    },
    getItem(key: string): string | null {
      return memory.get(key) ?? null;
    },
  };
}

function createCachesApi(keys: string[]) {
  const deleteMock = vi.fn(async () => true);
  return {
    api: {
      keys: vi.fn(async () => keys),
      delete: deleteMock,
    },
    deleteMock,
  };
}

describe('hardRefreshApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('atualiza SW e limpa apenas caches do AirTrust', async () => {
    const updateMock = vi.fn(async () => undefined);
    const { api, deleteMock } = createCachesApi([
      'airtrust-v8-assets',
      'other-cache',
      'AirTrust-runtime',
    ]);
    const replaceMock = vi.fn();

    await hardRefreshAppWithDeps({
      replace: replaceMock,
      cachesApi: api,
      getServiceWorkerRegistration: async () =>
        ({ update: updateMock }) as ServiceWorkerRegistrationLike,
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenNthCalledWith(1, 'airtrust-v8-assets');
    expect(deleteMock).toHaveBeenNthCalledWith(2, 'AirTrust-runtime');
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it('nao remove token/sessao de autenticacao', async () => {
    const localStorageApi = createMemoryStorage({ auth_token: 'token' });
    const sessionStorageApi = createMemoryStorage({
      auth_session: 'session',
      'airtrust-runtime-recover:/frms/fadiga-checkin': '1',
      'airtrust-manifest-version': 'v1',
      'airtrust-frontend-version': '808bb11',
    });
    const { api } = createCachesApi([]);
    const replaceMock = vi.fn();

    await hardRefreshAppWithDeps({
      replace: replaceMock,
      cachesApi: api,
      getServiceWorkerRegistration: async () => null,
      localStorageApi,
      sessionStorageApi,
    });

    expect(localStorageApi.getItem('auth_token')).toBe('token');
    expect(sessionStorageApi.getItem('auth_session')).toBe('session');
    expect(sessionStorageApi.getItem('airtrust-runtime-recover:/frms/fadiga-checkin')).toBeNull();
    expect(sessionStorageApi.getItem('airtrust-manifest-version')).toBeNull();
    expect(sessionStorageApi.getItem('airtrust-frontend-version')).toBeNull();
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it('aplica cache-busting sem loop de parametros antigos', async () => {
    const { api } = createCachesApi([]);
    const replaceMock = vi.fn();
    const href =
      'https://airtrust.online/frms/fadiga-checkin?refresh=123&runtime_recover=1&reason=x';

    await hardRefreshAppWithDeps({
      replace: replaceMock,
      href,
      now: () => 123456789,
      cachesApi: api,
      getServiceWorkerRegistration: async () => null,
      localStorageApi: createMemoryStorage(),
      sessionStorageApi: createMemoryStorage(),
    });

    const nextUrl = new URL(replaceMock.mock.calls[0][0] as string);
    expect(nextUrl.searchParams.has('refresh')).toBe(true);
    expect(nextUrl.searchParams.has('runtime_recover')).toBe(false);
    expect(nextUrl.searchParams.has('reason')).toBe(false);
    expect(nextUrl.searchParams.getAll('refresh')).toHaveLength(1);
    expect(nextUrl.searchParams.get('refresh')).toBe('123456789');
  });

  it('faz fallback para reload em caso de erro', async () => {
    const { api } = createCachesApi([]);
    const reloadMock = vi.fn();

    await hardRefreshAppWithDeps({
      reload: reloadMock,
      cachesApi: api,
      getServiceWorkerRegistration: async () => {
        throw new Error('sw failed');
      },
      localStorageApi: createMemoryStorage(),
      sessionStorageApi: createMemoryStorage(),
    });

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

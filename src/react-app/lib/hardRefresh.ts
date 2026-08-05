const REFRESH_QUERY_PARAM = 'refresh';
const REFRESH_RUNTIME_RECOVER_PARAM = 'runtime_recover';

const LOCAL_STORAGE_KEYS_TO_REMOVE = [
  'airtrust-update-available',
  'airtrust-manifest-version',
  'airtrust-frontend-version',
];
const SESSION_STORAGE_KEYS_TO_REMOVE = [
  '__sw_cleared',
  'airtrust-manifest-version',
  'airtrust-frontend-version',
];
const SESSION_STORAGE_PREFIXES_TO_REMOVE = ['airtrust-runtime-recover:'];

interface HardRefreshDeps {
  cachesApi?: Pick<CacheStorage, 'keys' | 'delete'>;
  getServiceWorkerRegistration?: () => Promise<ServiceWorkerRegistration | null>;
  now?: () => number;
  reload?: () => void;
  replace?: (url: string) => void;
  href?: string;
  localStorageApi?: Pick<Storage, 'length' | 'key' | 'removeItem'>;
  sessionStorageApi?: Pick<Storage, 'length' | 'key' | 'removeItem'>;
}

function removeStorageKeys(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
  keys: string[],
  prefixes: string[],
): void {
  for (const key of keys) {
    storage.removeItem(key);
  }

  const keysToEvaluate: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keysToEvaluate.push(key);
  }

  for (const key of keysToEvaluate) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
}

function clearRefreshUrlParams(url: URL): void {
  url.searchParams.delete(REFRESH_QUERY_PARAM);
  url.searchParams.delete(REFRESH_RUNTIME_RECOVER_PARAM);
  url.searchParams.delete('reason');
}

export async function hardRefreshApp(): Promise<void> {
  return hardRefreshAppWithDeps();
}

export async function hardRefreshAppWithDeps(deps: HardRefreshDeps = {}): Promise<void> {
  const cachesApi =
    deps.cachesApi ?? (typeof window !== 'undefined' && 'caches' in window ? caches : null);
  const getServiceWorkerRegistration =
    deps.getServiceWorkerRegistration ??
    (async () => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
      return navigator.serviceWorker.getRegistration();
    });
  const now = deps.now ?? Date.now;
  const replace = deps.replace ?? ((url: string) => window.location.replace(url));
  const reload = deps.reload ?? (() => window.location.reload());
  const href = deps.href ?? window.location.href;
  const localStorageApi =
    deps.localStorageApi ??
    (typeof window !== 'undefined' && 'localStorage' in window ? window.localStorage : null);
  const sessionStorageApi =
    deps.sessionStorageApi ??
    (typeof window !== 'undefined' && 'sessionStorage' in window ? window.sessionStorage : null);

  try {
    const registration = await getServiceWorkerRegistration();
    if (registration) {
      await registration.update();
    }

    if (cachesApi) {
      const cacheNames = await cachesApi.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.toLowerCase().startsWith('airtrust'))
          .map((cacheName) => cachesApi.delete(cacheName)),
      );
    }

    if (localStorageApi) {
      removeStorageKeys(localStorageApi, LOCAL_STORAGE_KEYS_TO_REMOVE, []);
    }

    if (sessionStorageApi) {
      removeStorageKeys(
        sessionStorageApi,
        SESSION_STORAGE_KEYS_TO_REMOVE,
        SESSION_STORAGE_PREFIXES_TO_REMOVE,
      );
    }

    const nextUrl = new URL(href);
    clearRefreshUrlParams(nextUrl);
    nextUrl.searchParams.set(REFRESH_QUERY_PARAM, now().toString());

    replace(nextUrl.toString());
  } catch {
    reload();
  }
}

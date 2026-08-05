import { API_BASE_URL } from '@/react-app/config/api';
import { notifyDataChanged, type DataChangeScope } from '@/react-app/utils/data-sync';
import { LruTtlCache } from '@/react-app/lib/lru-ttl-cache';
import { getCurrentTenantId, registerTenantCacheReset } from '@/react-app/lib/tenant-data-layer';

type ApiFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ResponseSnapshot {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
}

interface EndpointBackoff {
  snapshot: ResponseSnapshot;
  until: number;
}

declare global {
  var __airtrust_api_fetch_installed__: boolean | undefined;
  var __airtrust_api_fetch__: ApiFetchFn | undefined;
  var __airtrust_inflightGetMap__: Map<string, Promise<Response>> | undefined;
  var __airtrust_recentGetCache__: LruTtlCache<string, ResponseSnapshot> | undefined;
  var __airtrust_endpointBackoff__: LruTtlCache<string, EndpointBackoff> | undefined;
}

async function responseToSnapshot(response: Response): Promise<ResponseSnapshot> {
  const clone = response.clone();
  return {
    body: await clone.arrayBuffer(),
    status: clone.status,
    statusText: clone.statusText,
    headers: [...clone.headers.entries()],
  };
}

function responseFromSnapshot(snapshot: ResponseSnapshot, localBackoff = false): Response {
  const headers = new Headers(snapshot.headers);
  if (localBackoff) headers.set('X-AirTrust-Local-Backoff', '1');
  return new Response(snapshot.body.slice(0), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers,
  });
}

export function clearApiFetchCaches(): void {
  globalThis.__airtrust_inflightGetMap__?.clear();
  globalThis.__airtrust_recentGetCache__?.clear();
  globalThis.__airtrust_endpointBackoff__?.clear();
}

registerTenantCacheReset('apiFetch', clearApiFetchCaches);

function safeSessionGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors (privacy mode / blocked storage)
  }
}

function safeSessionRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function computeAltOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const suffix = '.airtrust.workers.dev';
    if (!host.endsWith(suffix)) return null;
    if (host.endsWith(`-production${suffix}`)) {
      return `${url.protocol}//${host.replace(`-production${suffix}`, suffix)}`;
    }
    return `${url.protocol}//${host.replace(suffix, `-production${suffix}`)}`;
  } catch {
    return null;
  }
}

function isExplicitLocalFallbackEnabled(): boolean {
  const env = import.meta.env as ImportMetaEnv & { VITE_ALLOW_API_ORIGIN_FALLBACK?: string };
  const isDevelopmentBuild = env.DEV === true || env.MODE === 'development' || env.MODE === 'test';
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  return isLocalHost && isDevelopmentBuild && env.VITE_ALLOW_API_ORIGIN_FALLBACK === 'true';
}

const PUBLIC_FALLBACK_PATHS = new Set(['/api/health', '/api/version', '/api/capabilities']);

function isSameOriginApiInput(rawInput: string): boolean {
  try {
    const url = new URL(rawInput, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function isExplicitPublicFallbackPath(rawInput: string): boolean {
  if (!isRelativeApiInput(rawInput) && !isSameOriginApiInput(rawInput)) {
    return false;
  }

  try {
    return PUBLIC_FALLBACK_PATHS.has(new URL(rawInput, window.location.origin).pathname);
  } catch {
    return false;
  }
}

function isAuthenticatedRequest(
  headers: Headers,
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  if (headers.has('Authorization')) return true;

  const credentials =
    init?.credentials || (input instanceof Request ? input.credentials : undefined);
  if (credentials === 'include') return true;

  try {
    if (
      window.localStorage.getItem('airtrust_token') ||
      window.sessionStorage.getItem('airtrust_token') ||
      /(?:^|;\s*)auth_token=/.test(document.cookie)
    ) {
      return true;
    }
  } catch {
    // Storage and cookies can be unavailable in privacy-restricted contexts.
  }

  return false;
}

function normalizeUrlForKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !['_t', 't', '_ts', 'timestamp', 'cacheBust'].includes(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, value] of params) {
      url.searchParams.append(key, value);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function getGetCacheTtlMs(pathname: string): number {
  if (/\/health$/i.test(pathname)) return 60_000; // health: 1 min
  if (/\/dashboard\//i.test(pathname)) return 30_000; // dashboard: 30s
  return 15_000; // default: 15s (era 1.5s)
}

function buildResolvedUrl(rawInput: string, apiOrigin: string): URL | null {
  try {
    const parsed = new URL(rawInput, window.location.origin);
    if (rawInput.startsWith('/api/')) {
      return new URL(`${apiOrigin}${rawInput}`);
    }
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')) {
      return new URL(`${apiOrigin}${parsed.pathname}${parsed.search}`);
    }
    return parsed;
  } catch {
    return null;
  }
}

function isRelativeApiInput(rawInput: string): boolean {
  return rawInput.startsWith('/api/');
}

function isTrustedApiOrigin(
  override: string,
  defaultOrigin: string,
  altOrigin: string | null,
): boolean {
  return override === defaultOrigin || (!!altOrigin && override === altOrigin);
}

function dataChangeScopeForMutation(pathname: string): DataChangeScope | null {
  if (/\/api\/treinamentos(\/|$)/i.test(pathname)) return 'treinamentos';
  if (/\/api\/escalas(\/|$)/i.test(pathname) || /\/api\/evd(\/|$)/i.test(pathname)) {
    return 'escala';
  }
  if (/\/api\/simuladores(\/|$)/i.test(pathname)) return 'simuladores';
  if (/\/api\/qualificacoes(\/|$)/i.test(pathname) || /\/api\/certificados(\/|$)/i.test(pathname)) {
    return 'qualificacoes';
  }
  return null;
}

function notifyMutationDataChange(
  method: string,
  pathname: string | null,
  response: Response,
): void {
  if (!response.ok || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
  if (!pathname) return;
  const scope = dataChangeScopeForMutation(pathname);
  if (scope) notifyDataChanged(scope);
}

export function installGlobalApiFetch(apiBaseUrl: string = API_BASE_URL): void {
  if (typeof window === 'undefined' || globalThis.__airtrust_api_fetch_installed__) {
    return;
  }

  globalThis.__airtrust_api_fetch_installed__ = true;
  const originalFetch = window.fetch.bind(window);
  const defaultOrigin = apiBaseUrl.replace(/\/api$/, '');
  const localFallbackEnabled = isExplicitLocalFallbackEnabled();
  const altOrigin = localFallbackEnabled ? computeAltOrigin(defaultOrigin) : null;
  const inflightGetMap =
    globalThis.__airtrust_inflightGetMap__ || new Map<string, Promise<Response>>();
  const recentGetCache =
    globalThis.__airtrust_recentGetCache__ || new LruTtlCache<string, ResponseSnapshot>(64, 15_000);
  const endpointBackoff =
    globalThis.__airtrust_endpointBackoff__ || new LruTtlCache<string, EndpointBackoff>(64, 15_000);
  globalThis.__airtrust_inflightGetMap__ = inflightGetMap;
  globalThis.__airtrust_recentGetCache__ = recentGetCache;
  globalThis.__airtrust_endpointBackoff__ = endpointBackoff;

  const apiFetchImpl: ApiFetchFn = async (input, init) => {
    const method = (
      (init?.method || (input instanceof Request ? input.method : 'GET')) as string
    ).toUpperCase();
    const rawInput =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const requestHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => requestHeaders.set(key, value));
    }
    const bypassGetCache = requestHeaders.get('X-AirTrust-Bypass-Cache') === '1';
    const authenticated = isAuthenticatedRequest(requestHeaders, input, init);
    const canFallback =
      localFallbackEnabled &&
      !authenticated &&
      method === 'GET' &&
      isExplicitPublicFallbackPath(rawInput) &&
      !!altOrigin;
    const override = safeSessionGet('API_ORIGIN_OVERRIDE');
    if (override && (!canFallback || !isTrustedApiOrigin(override, defaultOrigin, altOrigin))) {
      safeSessionRemove('API_ORIGIN_OVERRIDE');
    }
    const apiOrigin =
      canFallback && override && isTrustedApiOrigin(override, defaultOrigin, altOrigin)
        ? override
        : defaultOrigin;

    const performFetchWithFallback = async (): Promise<Response> => {
      let triedAlt = false;

      const tryOnce = async (originToUse: string): Promise<Response> => {
        try {
          const candidate = new URL(rawInput, window.location.origin);
          if (
            candidate.origin === window.location.origin &&
            candidate.pathname.startsWith('/api/')
          ) {
            return await originalFetch(originToUse + candidate.pathname + candidate.search, init);
          }
          if (isRelativeApiInput(rawInput)) {
            return await originalFetch(originToUse + rawInput, init);
          }
          return await originalFetch(input, init);
        } catch {
          return await originalFetch(input, init);
        }
      };

      const response = await tryOnce(apiOrigin);
      // Authenticated requests must never silently retry against — and
      // never persist an override to — a different backend origin. A
      // transient 404 (partial deploy, drifted route) on an authenticated
      // call should surface as-is, not cause this session to start sending
      // subsequent authenticated requests (including mutations) to a
      // different environment without the user's knowledge.
      if ((response.status === 404 || response.status === 0) && canFallback && !triedAlt) {
        triedAlt = true;
        const altResponse = await tryOnce(altOrigin);
        if (altResponse.ok) {
          safeSessionSet('API_ORIGIN_OVERRIDE', altOrigin);
          return altResponse;
        }
      }

      return response;
    };

    const resolved = buildResolvedUrl(rawInput, apiOrigin);
    const isApiRequest =
      resolved &&
      (resolved.pathname.startsWith('/api/') ||
        resolved.origin === defaultOrigin ||
        (altOrigin ? resolved.origin === altOrigin : false));

    if (!resolved || !isApiRequest || method !== 'GET' || bypassGetCache || authenticated) {
      const response = await performFetchWithFallback();
      notifyMutationDataChange(method, resolved?.pathname || null, response);
      return response;
    }

    const now = Date.now();
    const tenantScope = getCurrentTenantId() ?? 'public';
    const endpointKey = `${tenantScope}:${resolved.origin}${resolved.pathname}`;
    const activeBackoff = endpointBackoff.get(endpointKey, now);
    if (activeBackoff && activeBackoff.until > now) {
      // Preserve the actual server status/body that initiated backoff. The local
      // marker is explicit and never fabricates a 429 that the server did not send.
      return responseFromSnapshot(activeBackoff.snapshot, true);
    }

    const requestKey = `${tenantScope}:${method}:${normalizeUrlForKey(resolved.toString())}`;
    const cached = recentGetCache.get(requestKey, now);
    if (cached) {
      return responseFromSnapshot(cached);
    }

    const inflight = inflightGetMap.get(requestKey);
    if (inflight) {
      const response = await inflight;
      return response.clone();
    }

    const requestPromise = (async () => {
      const response = await performFetchWithFallback();
      const snapshot = await responseToSnapshot(response);
      if (response.ok) {
        recentGetCache.set(requestKey, snapshot, getGetCacheTtlMs(resolved.pathname));
      }

      const isEscalasEndpoint = /\/api\/escalas(\/|$)/i.test(resolved.pathname);
      const shouldBackoff =
        response.status === 429 || (response.status >= 500 && !isEscalasEndpoint);
      if (shouldBackoff) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader
          ? Math.max(Number.parseInt(retryAfterHeader, 10) * 1000, 5000)
          : response.status === 429
            ? 15000
            : 5000;
        endpointBackoff.set(
          endpointKey,
          { snapshot, until: Date.now() + retryAfterMs },
          retryAfterMs,
        );
      } else {
        endpointBackoff.delete(endpointKey);
      }

      return response;
    })();

    if (inflightGetMap.size >= 128) {
      const response = await requestPromise;
      return response.clone();
    }

    inflightGetMap.set(requestKey, requestPromise);
    try {
      const response = await requestPromise;
      return response.clone();
    } finally {
      inflightGetMap.delete(requestKey);
    }
  };

  globalThis.__airtrust_api_fetch__ = apiFetchImpl;
  globalThis.apiFetch = apiFetchImpl;
  window.apiFetch = apiFetchImpl;
}

export const apiFetch: ApiFetchFn = (input, init) => {
  const activeFetch = globalThis.__airtrust_api_fetch__;
  if (activeFetch) {
    return activeFetch(input, init);
  }
  return fetch(input, init);
};

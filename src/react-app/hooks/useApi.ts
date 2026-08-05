import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { requestController } from '../utils/request-control';
import { logger } from '../utils/logger';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { appFetch } from '@/react-app/lib/app-fetch';
import {
  classifyFrontendError,
  frontendErrorMessage,
  FrontendApiError,
  apiJson,
} from '@/react-app/lib/api-contract';
import { LruTtlCache } from '@/react-app/lib/lru-ttl-cache';
import {
  assertTenantDataScope,
  captureTenantDataScope,
  getCurrentTenantId,
  registerTenantCacheReset,
} from '@/react-app/lib/tenant-data-layer';

const buildFullUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  let path = url.replace(/^\/+/, '');
  if (base.endsWith('/api') && path.toLowerCase().startsWith('api/')) path = path.slice(4);
  return `${base}/${path}`;
};

interface UseApiOptions {
  retry?: number;
  retryDelay?: number;
  enabled?: boolean;
  dedupeInitial?: boolean;
  requireAuth?: boolean;
  bypassGetCache?: boolean;
  skipAuth?: boolean;
  method?: string;
  staleTime?: number;
  refetchInterval?: number;
}

const inMemoryGetCache = new LruTtlCache<string, unknown>(100, 5 * 60 * 1000);
registerTenantCacheReset('useApi', () => inMemoryGetCache.clear());

export function clearApiCacheByPattern(urlFragment: string): void {
  inMemoryGetCache.deleteMatching((key) => key.includes(urlFragment));
}

function unwrapResponsePayload<T>(result: unknown): T {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const envelope = result as {
      success?: boolean;
      data?: T;
      error?: string;
      pagination?: unknown;
      stats?: unknown;
      meta?: unknown;
    };
    if (envelope.success === false) {
      throw new FrontendApiError(envelope.error || 'Erro desconhecido', 'client');
    }
    if (envelope.success === true) {
      const hasExtended =
        envelope.pagination !== undefined ||
        envelope.stats !== undefined ||
        envelope.meta !== undefined;
      return (hasExtended ? result : envelope.data) as T;
    }
  }
  return result as T;
}

export function useApi<T>(url: string, options: UseApiOptions = {}) {
  const {
    retry = 3,
    retryDelay = 1000,
    enabled = true,
    dedupeInitial = true,
    requireAuth = true,
    bypassGetCache = false,
    skipAuth = false,
    staleTime = 0,
    refetchInterval,
    method: optionsMethod,
  } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logout, token: authToken, empresaAtualId } = useAuth();
  const hasFetchedInitialRef = useRef(false);
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (cb: () => void, delayMs: number) => {
      clearRetryTimeout();
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        if (isMountedRef.current) cb();
      }, delayMs);
    },
    [clearRetryTimeout],
  );

  const fetchData = useCallback(
    async (attemptNumber = 0) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (inFlightRef.current && attemptNumber === 0) return;
      inFlightRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const fullUrl = buildFullUrl(url);
        const method = (optionsMethod || 'GET').toUpperCase();
        const tenantId = empresaAtualId ?? getCurrentTenantId();
        const scope = captureTenantDataScope();
        const cacheKey = `${tenantId ?? 'pending'}:${method}:${fullUrl}:${skipAuth ? 'public' : 'auth'}`;

        if (method === 'GET' && staleTime > 0) {
          const cached = inMemoryGetCache.get(cacheKey);
          if (cached !== undefined) {
            setData(cached as T);
            return;
          }
        }

        if (requireAuth && !skipAuth && !authToken) return;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (method === 'GET') {
          headers['Cache-Control'] = 'no-cache';
          if (bypassGetCache) headers['X-AirTrust-Bypass-Cache'] = '1';
        }

        let requestUrl = fullUrl;
        if (method === 'GET' && bypassGetCache) {
          const separator = fullUrl.includes('?') ? '&' : '?';
          requestUrl = `${fullUrl}${separator}_t=${Date.now()}`;
        }

        requestController.recordRequest();
        const response = await (skipAuth ? apiFetch : appFetch)(requestUrl, {
          method,
          headers,
        });

        if (response.status === 401) {
          logout();
          throw new FrontendApiError('Sessão expirada.', 'session-expired', 401);
        }
        if (response.status === 403) {
          throw new FrontendApiError('Acesso negado.', 'permission', 403);
        }

        const result = await response.json().catch(() => undefined);
        assertTenantDataScope(scope);
        if (!response.ok) {
          const message =
            result && typeof result === 'object' && 'error' in result
              ? String((result as { error?: unknown }).error || '')
              : `Erro ${response.status}: ${response.statusText}`;
          throw new FrontendApiError(
            message,
            response.status >= 500 ? 'server' : 'client',
            response.status,
          );
        }

        const nextData = unwrapResponsePayload<T>(result);
        setData(nextData);
        if (method === 'GET' && staleTime > 0) {
          inMemoryGetCache.set(cacheKey, nextData, staleTime);
        }
      } catch (caught) {
        const classified = classifyFrontendError(caught);
        const canRetry =
          !['permission', 'session-expired', 'stale-tenant'].includes(classified.kind) &&
          attemptNumber < retry;
        if (canRetry) {
          logger.warn(
            `[useApi] Erro em ${url}, retry em ${retryDelay}ms (${attemptNumber + 1}/${retry})`,
          );
          scheduleRetry(() => fetchData(attemptNumber + 1), retryDelay);
        } else if (classified.kind !== 'stale-tenant') {
          logger.error(`[useApi] Erro final em ${url}:`, classified);
          setError(frontendErrorMessage(classified));
          hasFetchedInitialRef.current = false;
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [
      authToken,
      bypassGetCache,
      enabled,
      empresaAtualId,
      logout,
      optionsMethod,
      requireAuth,
      retry,
      retryDelay,
      scheduleRetry,
      skipAuth,
      staleTime,
      url,
    ],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (dedupeInitial) {
      if (hasFetchedInitialRef.current) return;
      hasFetchedInitialRef.current = true;
    }
    void fetchData();
    return () => {
      hasFetchedInitialRef.current = false;
      isMountedRef.current = false;
      clearRetryTimeout();
      inFlightRef.current = false;
    };
  }, [authToken, clearRetryTimeout, dedupeInitial, enabled, empresaAtualId, fetchData, url]);

  useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;
    const intervalId = window.setInterval(() => void fetchData(), refetchInterval);
    return () => window.clearInterval(intervalId);
  }, [enabled, fetchData, refetchInterval]);

  const refetch = useCallback(() => {
    hasFetchedInitialRef.current = false;
    clearApiCacheByPattern(buildFullUrl(url));
    return fetchData();
  }, [fetchData, url]);

  return { data, loading, error, refetch };
}

export function useApiMutation<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (url: string, options: RequestInit): Promise<T> => {
    try {
      setLoading(true);
      setError(null);
      requestController.recordRequest();
      return await apiJson<T>(buildFullUrl(url), options);
    } catch (caught) {
      const message = frontendErrorMessage(caught);
      setError(message);
      throw classifyFrontendError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

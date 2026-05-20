import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { requestController } from '../utils/request-control';
import { logger } from '../utils/logger';

const buildFullUrl = (url: string): string => {
  // Absolute URL: return as-is
  if (/^https?:\/\//i.test(url)) return url;

  // Normalizar base (garantir sem barra final dupla)
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

  // Remover barras iniciais múltiplas
  let path = url.replace(/^\/+/, '');

  // Se base termina com /api e path começa com api/, remover prefixo duplicado "api/"
  if (base.endsWith('/api') && path.toLowerCase().startsWith('api/')) {
    path = path.slice(4); // remove 'api/'
  }

  // Se path começa com 'api/' mas base NÃO termina com '/api', manter (caso tenha vindo de outra convenção)
  // Garantir que sempre haja uma barra entre base e path
  const full = `${base}/${path}`;

  // Logs removidos para performance - buildFullUrl executado centenas de vezes

  return full;
};

const getStoredAccessToken = (): string | null => {
  const sessionStorageKeys = [
    'airtrust_token',
    'token',
    'auth_token',
    'accessToken',
    'access_token',
    'airtrust_access_token',
  ];

  for (const key of sessionStorageKeys) {
    const value = sessionStorage.getItem(key);
    if (value) return value;
  }

  const localStorageKeys = [
    'airtrust_token',
    'token',
    'auth_token',
    'accessToken',
    'access_token',
    'airtrust_access_token',
  ];

  for (const key of localStorageKeys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }

  return null;
};

interface UseApiOptions {
  retry?: number;
  retryDelay?: number;
  enabled?: boolean;
  /**
   * Evita disparo duplicado em React StrictMode (efeito montado 2x em dev).
   * Mantém primeira chamada e ignora a segunda se ainda na mesma render inicial.
   * Default: true
   */
  dedupeInitial?: boolean;
  /**
   * Quando true exige presença de token antes de realizar fetch.
   * Para endpoints públicos (ex: /qualificacoes/historico, /qualificacoes/tipos) usar false.
   * Default: true.
   */
  requireAuth?: boolean;
  /**
   * Quando true, força bypass do cache/dedupe global de GET no fetch wrapper.
   * Útil para módulos que exigem atualização em tempo real (ex: FRMS).
   */
  bypassGetCache?: boolean;
  /**
   * Quando true, NÃO injeta o header Authorization mesmo que haja token disponível.
   * Usar em endpoints públicos que devem usar fallback de empresa (ex: FRMS demo).
   */
  skipAuth?: boolean;
  method?: string;
  staleTime?: number;
  refetchInterval?: number;
}

const inMemoryGetCache = new Map<string, { timestamp: number; data: unknown }>();

/** Clear all in-memory GET cache entries whose key contains `urlFragment`. */
export function clearApiCacheByPattern(urlFragment: string): void {
  for (const key of inMemoryGetCache.keys()) {
    if (key.includes(urlFragment)) {
      inMemoryGetCache.delete(key);
    }
  }
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
  } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logout, refreshToken, token: authToken } = useAuth();
  const hasFetchedInitialRef = useRef(false);
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const authWaitAttemptsRef = useRef(0);

  const clearRetryTimeout = () => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const scheduleRetry = useCallback((cb: () => void, delayMs: number) => {
    clearRetryTimeout();
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      if (isMountedRef.current) cb();
    }, delayMs);
  }, []);

  // Stable references to options fields that affect request execution
  const optionsMethod = options.method;
  const optionsSkipAuth = skipAuth;

  const fetchData = useCallback(
    async (attemptNumber = 0) => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      if (inFlightRef.current && attemptNumber === 0) {
        return;
      }

      inFlightRef.current = true;

      try {
        setLoading(true);
        setError(null);

        // Construir URL completa com regras robustas e sem duplicar "/api":
        // - Se começa com http, usa como está
        // - Se começa com "/api/", usar a ORIGEM da API (API_BASE_URL sem "/api") + url
        // - Se começa com "/" mas NÃO com "/api", prefixar "/api"
        // - Se começa com "/api", usar ORIGEM + url (evita duplicação)
        // - Caso contrário (paths relativos), prefixar com "/api/"
        const fullUrl = buildFullUrl(url);

        const executeRequest = async (accessToken: string | null) => {
          const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (!optionsSkipAuth && accessToken) {
            requestHeaders['Authorization'] = `Bearer ${accessToken}`;
          }

          const isGetRequest = !optionsMethod || optionsMethod.toUpperCase() === 'GET';

          if (isGetRequest) {
            requestHeaders['Cache-Control'] = 'no-cache';
            if (bypassGetCache) {
              requestHeaders['X-AirTrust-Bypass-Cache'] = '1';
            }
          }

          let requestUrl = fullUrl;
          if (isGetRequest && bypassGetCache) {
            try {
              const bustedUrl = new URL(fullUrl);
              bustedUrl.searchParams.set('_t', String(Date.now()));
              requestUrl = bustedUrl.toString();
            } catch {
              const separator = fullUrl.includes('?') ? '&' : '?';
              requestUrl = `${fullUrl}${separator}_t=${Date.now()}`;
            }
          }

          requestController.recordRequest();
          return fetch(requestUrl, {
            ...options,
            headers: requestHeaders,
          });
        };

        const token = authToken || getStoredAccessToken();
        const method = (optionsMethod || 'GET').toUpperCase();
        const cacheKey = `${method}:${fullUrl}:${optionsSkipAuth ? 'noauth' : token || 'anon'}`;

        if (method === 'GET' && staleTime > 0) {
          const cached = inMemoryGetCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < staleTime) {
            setData(cached.data as T);
            setLoading(false);
            inFlightRef.current = false;
            return;
          }
        }

        // Se requisição exige autenticação e token ainda não carregou,
        // aguardar sem fazer fetch. O useEffect depende de authToken,
        // então re-executará quando o token carregar.
        if (requireAuth && !skipAuth && !token) {
          // Manter loading = true — não fazer fetch sem token
          inFlightRef.current = false;
          return;
        }

        let response = await executeRequest(token);

        if (response.status === 401) {
          logger.warn(`[useApi] 401 em ${fullUrl} - tentando renovar token`);

          try {
            await refreshToken();
            const renewedToken = authToken || getStoredAccessToken();
            response = await executeRequest(renewedToken);
          } catch (refreshError) {
            logger.error(`[useApi] Refresh falhou em ${fullUrl}:`, refreshError);
            logout();
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
          }

          if (response.status === 401) {
            logger.warn(`[useApi] 401 persistente em ${fullUrl}`);
            logout();
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
          }
        }

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || `Erro ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success !== undefined) {
          if (result.success) {
            // Se a resposta contém campos adicionais (pagination, stats, meta), preservar objeto completo
            const hasExtended =
              typeof result === 'object' &&
              (result.pagination !== undefined ||
                result.stats !== undefined ||
                result.meta !== undefined);
            if (hasExtended) {
              setData(result as T);
              if (method === 'GET') {
                inMemoryGetCache.set(cacheKey, { timestamp: Date.now(), data: result as T });
              }
            } else {
              setData(result.data as T);
              if (method === 'GET') {
                inMemoryGetCache.set(cacheKey, {
                  timestamp: Date.now(),
                  data: result.data as T,
                });
              }
            }
          } else {
            throw new Error((result as { error?: string }).error || 'Erro desconhecido');
          }
        } else if (Array.isArray(result)) {
          setData(result as T);
          if (method === 'GET') {
            inMemoryGetCache.set(cacheKey, { timestamp: Date.now(), data: result as T });
          }
        } else if (typeof result === 'object') {
          setData(result as T);
          if (method === 'GET') {
            inMemoryGetCache.set(cacheKey, { timestamp: Date.now(), data: result as T });
          }
        } else {
          throw new Error('Formato de resposta inválido');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';

        // Não fazer retry em erros de autenticação (401) - já foi tratado acima
        const isAuthError =
          errorMessage.includes('Sessão expirada') || errorMessage.includes('401');

        // Retry logic (exceto para erros de autenticação)
        if (!isAuthError && attemptNumber < retry) {
          logger.warn(
            `[useApi] Erro em ${url}, retry em ${retryDelay}ms... (${attemptNumber + 1}/${retry})`,
          );
          scheduleRetry(() => fetchData(attemptNumber + 1), retryDelay);
        } else {
          logger.error(`[useApi] Erro final em ${url}:`, errorMessage);
          setError(errorMessage);
          setLoading(false);
          // Permitir nova tentativa manual via refetch após erro
          hasFetchedInitialRef.current = false;
        }
      } finally {
        inFlightRef.current = false;
        if (attemptNumber === 0) {
          setLoading(false);
        }
      }
    },
    [
      authToken,
      enabled,
      logout,
      optionsMethod,
      optionsSkipAuth,
      refreshToken,
      requireAuth,
      bypassGetCache,
      staleTime,
      retry,
      retryDelay,
      scheduleRetry,
      url,
    ],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) return;
    // Dedup por instância: evita duplo-fetch em React StrictMode (mount→unmount→mount).
    // O cleanup reseta o flag para que remontagens legítimas (troca de url/id) sempre busquem.
    if (dedupeInitial) {
      if (hasFetchedInitialRef.current) return;
      hasFetchedInitialRef.current = true;
    }
    fetchData();
    return () => {
      hasFetchedInitialRef.current = false;
      isMountedRef.current = false;
      clearRetryTimeout();
      inFlightRef.current = false;
      authWaitAttemptsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, authToken]);

  useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;
    const intervalId = window.setInterval(() => {
      fetchData();
    }, refetchInterval);
    return () => window.clearInterval(intervalId);
  }, [enabled, fetchData, refetchInterval]);

  const refetch = useCallback(() => {
    hasFetchedInitialRef.current = false;
    clearApiCacheByPattern(buildFullUrl(url));
    return fetchData();
  }, [fetchData, url]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

export function useApiMutation<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logout, refreshToken, token: authToken } = useAuth();

  const mutate = useCallback(
    async (url: string, options: RequestInit): Promise<T> => {
      try {
        setLoading(true);
        setError(null);

        const fullUrl = buildFullUrl(url);

        // Buscar token do AuthContext (prioritário) ou fallback para tokens legados
        const localStorageKeys = [
          'airtrust_token',
          'token',
          'auth_token',
          'accessToken',
          'access_token',
          'airtrust_access_token',
        ];

        let lsToken: string | null = null;
        for (const key of localStorageKeys) {
          const value = localStorage.getItem(key);
          if (value) {
            lsToken = value;
            break;
          }
        }

        const token = authToken || lsToken;

        const executeRequest = async (accessToken: string | null) => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
          };

          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
          } else {
            logger.warn(`[useApiMutation] Nenhum token encontrado para ${fullUrl}`);
          }

          requestController.recordRequest();
          return fetch(fullUrl, {
            ...options,
            headers,
          });
        };

        let response = await executeRequest(token);

        if (response.status === 401) {
          logger.warn(`[useApiMutation] 401 em ${fullUrl} - tentando renovar token`);

          try {
            await refreshToken();
            const renewedToken = authToken || getStoredAccessToken();
            response = await executeRequest(renewedToken);
          } catch (refreshError) {
            logger.error(`[useApiMutation] Refresh falhou em ${fullUrl}:`, refreshError);
            logout();
            window.location.href = '/login';
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
          }

          if (response.status === 401) {
            logger.warn(`[useApiMutation] 401 persistente em ${fullUrl}`);
            logout();
            window.location.href = '/login';
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
          }
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erro na requisição');
        }

        if (!result.success) {
          throw new Error(result.error || 'Erro desconhecido');
        }

        return result.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [authToken, logout, refreshToken],
  );

  return { mutate, loading, error };
}

// ================== DEBUG URL TESTS (somente desenvolvimento) ==================
if (
  typeof window !== 'undefined' &&
  import.meta.env.MODE === 'development' &&
  !(globalThis as unknown as Record<string, boolean>).__useApi_url_tests_executed
) {
  (globalThis as unknown as Record<string, boolean>).__useApi_url_tests_executed = true;
  // URL tests removidos (performance) - buildFullUrl testado em CI/CD
}

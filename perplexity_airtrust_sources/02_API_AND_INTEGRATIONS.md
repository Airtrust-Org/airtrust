# API & Integrations


---
## FILE: src/react-app/config/api.ts
~~~typescript
/**
 * Configuração da API
 * Centraliza URLs e configurações de conexão com o backend
 *
 * SECURITY FIXES:
 * - Token stored in memory by default (not localStorage)
 * - Optional secure httpOnly cookie fallback support
 * - Token validation before use
 * - Proper error handling for expired tokens (401)
 * - Support for refresh tokens
 */

import { apiFetch } from '@/react-app/lib/apiFetch';

const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api';

function resolveApiBase(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL;
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  const normalizedEnvUrl = envUrl?.trim();

  // 🎯 LOCAL DEVELOPMENT: rota pelo proxy Vite → VITE_DEV_PROXY_TARGET (default: produção).
  // Para usar worker local: set VITE_DEV_PROXY_TARGET=http://localhost:8787 no .env.local
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${origin}/api`;
  }

  if (normalizedEnvUrl && normalizedEnvUrl.length > 0) return normalizedEnvUrl;

  // 🎯 STAGING: main.airtrust.pages.dev → staging API (zero cache)
  if (host === 'main.airtrust.pages.dev') {
    return 'https://airtrust-api-staging.airtrust.workers.dev/api';
  }

  // 🚀 PRODUCTION: usar o dominio canonico da API
  if (
    host === 'airtrust.online' ||
    host === 'www.airtrust.online' ||
    host === 'api.airtrust.online' ||
    host === 'production.airtrust.pages.dev' ||
    host.includes('pages.dev') ||
    host.includes('airtrust.pages.dev')
  ) {
    return PRODUCTION_API_BASE_URL;
  }

  return `${origin}/api`;
}

export const API_BASE_URL = resolveApiBase();
export const AUTH_TOKEN_CHANGED_EVENT = 'airtrust:token-changed';

// ===== TOKEN STORAGE (Memory-based for security) =====
let cachedToken: string | null = null;
let cachedRefreshToken: string | null = null;

let _persistLogin = false;
export function setPersistLogin(val: boolean) {
  _persistLogin = val;
}
export function getPersistLogin() {
  return _persistLogin;
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  cachedToken = accessToken;
  if (refreshToken) {
    cachedRefreshToken = refreshToken;
  }
  const persist = _persistLogin;
  if (persist) {
    try {
      localStorage.setItem('airtrust_token', accessToken);
      if (refreshToken) localStorage.setItem('airtrust_refresh_token', refreshToken);
    } catch {}
  } else {
    try {
      sessionStorage.setItem('airtrust_token', accessToken);
      if (refreshToken) sessionStorage.setItem('airtrust_refresh_token', refreshToken);
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_TOKEN_CHANGED_EVENT, {
        detail: { token: accessToken, refreshToken: refreshToken ?? cachedRefreshToken },
      }),
    );
  }
}

export function clearTokens(): void {
  cachedToken = null;
  cachedRefreshToken = null;
  try {
    localStorage.removeItem('airtrust_token');
  } catch {}
  try {
    localStorage.removeItem('airtrust_refresh_token');
  } catch {}
  try {
    sessionStorage.removeItem('airtrust_token');
  } catch {}
  try {
    sessionStorage.removeItem('airtrust_refresh_token');
  } catch {}
  if (typeof document !== 'undefined') {
    document.cookie = 'auth_token=; Max-Age=0; path=/;';
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_TOKEN_CHANGED_EVENT, {
        detail: { token: null, refreshToken: null },
      }),
    );
  }
}

export function getAccessToken(): string | null {
  if (cachedToken) {
    if (isValidToken(cachedToken)) return cachedToken;
    cachedToken = null;
  }
  // Fallback: read from sessionStorage (or migrate legacy localStorage value)
  try {
    let stored =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('airtrust_token') : null;
    if (!stored && typeof localStorage !== 'undefined') {
      stored = localStorage.getItem('airtrust_token');
      if (stored && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('airtrust_token', stored);
        localStorage.removeItem('airtrust_token');
      }
    }
    if (stored && isValidToken(stored)) {
      cachedToken = stored;
      return cachedToken;
    }
  } catch {
    // ignore (private mode, etc.)
  }
  return null;
}

export async function ensureValidAccessToken(): Promise<string | null> {
  const currentToken = getAccessToken();
  if (currentToken && isValidToken(currentToken)) {
    return currentToken;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return null;
  }

  await refreshAccessToken();
  return getAccessToken();
}

export function getRefreshToken(): string | null {
  if (cachedRefreshToken) return cachedRefreshToken;

  try {
    let stored =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('airtrust_refresh_token')
        : null;
    if (!stored && typeof localStorage !== 'undefined') {
      stored = localStorage.getItem('airtrust_refresh_token');
      if (stored && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('airtrust_refresh_token', stored);
        localStorage.removeItem('airtrust_refresh_token');
      }
    }
    if (stored) {
      cachedRefreshToken = stored;
      return cachedRefreshToken;
    }
  } catch {
    // ignore (private mode, etc.)
  }

  return null;
}

/**
 * Validate JWT token format (basic check)
 */
function isValidToken(token: string | null): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // JWT format: header.payload.signature
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    // Decode payload (no signature verification here - that's done by backend)
    const payload = JSON.parse(atob(parts[1]));

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false; // Token expired
    }

    return true;
  } catch {
    return false;
  }
}

export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/auth/login`,
  LOGOUT: `${API_BASE_URL}/auth/logout`,
  REFRESH_TOKEN: `${API_BASE_URL}/auth/refresh`,
  VERIFY_TOKEN: `${API_BASE_URL}/auth/verify`,

  FUNCIONARIOS: `${API_BASE_URL}/funcionarios`,
  FUNCIONARIO_BY_ID: (id: number) => `${API_BASE_URL}/funcionarios/${id}`,

  CERTIFICACOES: `${API_BASE_URL}/qualificacoes`,

  PASTA_VIRTUAL: `${API_BASE_URL}/pasta-virtual`,

  SIMULADORES: `${API_BASE_URL}/simuladores`,

  HEALTH: `${API_BASE_URL.replace('/api', '')}/api/health`,
  AUDIT_LOGS: `${API_BASE_URL.replace('/api', '')}/api/sistema/audit-logs`,
};

export const fetchConfig = {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include' as RequestCredentials,
};

/**
 * Fetch with authorization header and automatic token refresh
 * @param url - API endpoint
 * @param options - Fetch options
 * @param retry - Internal: whether this is a retry attempt
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retry: boolean = false,
): Promise<Response> {
  const token = getAccessToken();
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;

  // ===== TOKEN VALIDATION =====
  if (!isValidToken(token)) {
    // Try to refresh
    if (!retry && cachedRefreshToken) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch {
        clearTokens();
        throw new Error('Token refresh failed');
      }
    }

    // If no refresh possible, clear tokens
    clearTokens();
    throw new Error('Authentication required');
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...(isFormDataBody ? {} : fetchConfig.headers),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  };

  const response = await apiFetch(url, config);

  // ===== HANDLE 401 UNAUTHORIZED =====
  if (response.status === 401 && !retry) {
    // Token expired or invalid, try refresh
    if (cachedRefreshToken) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch {
        clearTokens();
        throw new Error('Session expired. Please login again.');
      }
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await apiFetch(API_ENDPOINTS.REFRESH_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      throw new Error('Refresh token failed');
    }

    const responseJson = (await response.json()) as {
      success?: boolean;
      data?: {
        accessToken?: string;
        refreshToken?: string;
        access_token?: string;
        refresh_token?: string;
      };
      accessToken?: string;
      refreshToken?: string;
      access_token?: string;
      refresh_token?: string;
    };

    const payload = responseJson.data ?? responseJson;
    const newAccessToken = payload.accessToken ?? payload.access_token;
    const newRefreshToken = payload.refreshToken ?? payload.refresh_token;

    if (newAccessToken) {
      setTokens(newAccessToken, newRefreshToken);

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('airtrust_token', newAccessToken);
          if (newRefreshToken) {
            sessionStorage.setItem('airtrust_refresh_token', newRefreshToken);
          }
        }
      } catch {
        // ignore storage failures
      }
    } else {
      throw new Error('No token in refresh response');
    }
  } catch (error) {
    clearTokens();
    throw error;
  }
}

/**
 * Perform logout
 */
export async function logout(): Promise<void> {
  try {
    const token = getAccessToken();
    if (token) {
      await apiFetch(API_ENDPOINTS.LOGOUT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.warn('Logout request failed', error);
  } finally {
    clearTokens();
  }
}

~~~

---
## FILE: src/react-app/utils/api-cache.ts
~~~typescript
/**
 * Cache de API em memória para reduzir requisições ao Cloudflare Workers
 * Implementa cache com TTL para endpoints críticos
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Obter dado do cache se ainda for válido
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`[CACHE MISS] ${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      console.log(`[CACHE EXPIRED] ${key} (idade: ${age}ms)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[CACHE HIT] ${key} (idade: ${age}ms)`);
    return entry.data as T;
  }

  /**
   * Armazenar dado em cache com TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    // Limpar cache se crescer demais
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`[CACHE] Removida entrada mais antiga`);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });

    console.log(`[CACHE SET] ${key} com TTL ${ttlMs}ms`);
  }

  /**
   * Limpar cache específico
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[CACHE INVALIDATED] ${key}`);
  }

  /**
   * Limpar cache por padrão (ex: /api/dashboard/*)
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const [key] of this.cache) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[CACHE INVALIDATED] ${count} entradas com padrão ${pattern}`);
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[CACHE CLEARED] ${size} entradas removidas`);
  }

  /**
   * Obter estatísticas do cache
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
        isExpired: Date.now() - entry.timestamp > entry.ttl,
      })),
    };
  }
}

// Singleton
export const apiCache = new APICache();

/**
 * Hook para fetch com cache automático
 * Exemplo:
 * const data = await cachedFetch(
 *   `/api/endpoint`,
 *   5 * 60 * 1000  // 5 minutos de cache
 * );
 */
export async function cachedFetch<T>(
  url: string,
  ttlMs: number = 5 * 60 * 1000,
  options?: RequestInit,
): Promise<T> {
  const cacheKey = `${url}:${JSON.stringify(options || {})}`;

  // Verificar cache
  const cached = apiCache.get<T>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fazer request
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as T;

  // Armazenar em cache
  apiCache.set(cacheKey, data, ttlMs);

  return data;
}

~~~

---
## FILE: src/react-app/utils/api-client.ts
~~~typescript
/**
 * API CLIENT - Cliente centralizado para chamadas de API
 *
 * Benefícios:
 * - Validação automática de 404
 * - Tratamento de erros padronizado
 * - Retry automático com exponential backoff
 * - Logs consistentes
 * - Timeout configurável
 * - Circuit breaker para evitar cascata de falhas
 * - Retry-After header support
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface ApiOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  validateStatus?: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

// ===== CIRCUIT BREAKER STATE =====
interface CircuitBreakerState {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout = 10000;
  private defaultRetries = 3;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetTime = 60000; // 60 seconds

  constructor() {
    // Keep /api prefix as Worker routes expect it
    this.baseUrl = API_BASE_URL;
  }

  // ===== EXPONENTIAL BACKOFF CALCULATION =====
  private getBackoffDelay(attempt: number): number {
    // 1s, 2s, 4s, 8s (capped at 8s)
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }

  // ===== CIRCUIT BREAKER LOGIC =====
  private checkCircuitBreaker(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') {
      return true; // OK, proceed
    }

    if (this.circuitBreaker.state === 'OPEN') {
      // Check if we should try half-open
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceFailure > this.circuitBreakerResetTime) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        console.info('[API] Circuit breaker entering HALF_OPEN state');
        return true; // Try one request
      }

      console.warn('[API] Circuit breaker is OPEN, rejecting request');
      return false; // Don't even try
    }

    // HALF_OPEN state: allow request to proceed
    return true;
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= 2) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        console.info('[API] Circuit breaker CLOSED (recovered)');
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'OPEN';
      console.error(`[API] Circuit breaker OPEN (${this.circuitBreaker.failureCount} failures)`);
    } else if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'OPEN';
      console.error('[API] Circuit breaker back to OPEN');
    }
  }

  /**
   * Faz uma requisição GET
   */
  async get<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Faz uma requisição POST
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PUT
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PATCH
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição DELETE
   */
  async delete<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Requisição genérica com retry e timeout
   */
  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retries,
      validateStatus = true,
      ...fetchOptions
    } = options;

    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const resolvedRetries =
      typeof retries === 'number' ? retries : method === 'GET' ? this.defaultRetries : 0;

    // ===== CIRCUIT BREAKER CHECK =====
    if (!this.checkCircuitBreaker()) {
      return {
        success: false,
        error: 'Serviço temporariamente indisponível (circuit breaker)',
        code: 'SERVICE_UNAVAILABLE',
      };
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= resolvedRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // ===== STATUS CODE HANDLING =====
        if (validateStatus && !response.ok) {
          // 401 Unauthorized - don't retry
          if (response.status === 401) {
            console.error(`[API] 401 Unauthorized: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Não autorizado',
              code: 'UNAUTHORIZED',
            };
          }

          // 403 Forbidden - don't retry
          if (response.status === 403) {
            console.error(`[API] 403 Forbidden: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Acesso negado',
              code: 'FORBIDDEN',
            };
          }

          // 422 Unprocessable Entity - don't retry
          if (response.status === 422) {
            console.error(`[API] 422 Unprocessable Entity: ${endpoint}`);
            const errorData = await response.json().catch(() => ({}));
            this.recordFailure();
            return {
              success: false,
              error: errorData.error || 'Dados inválidos',
              code: 'UNPROCESSABLE_ENTITY',
            };
          }

          // 404 Not Found - don't retry
          if (response.status === 404) {
            console.error(`[API] 404 Not Found: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Recurso não encontrado',
              code: 'NOT_FOUND',
            };
          }

          // 429 Too Many Requests - retry with Retry-After
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
            const delay = retryAfter > 0 ? retryAfter * 1000 : this.getBackoffDelay(attempt);

            console.warn(`[API] 429 Rate Limited: ${endpoint}, waiting ${delay}ms`);

            if (attempt < resolvedRetries) {
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            this.recordFailure();
            return {
              success: false,
              error: 'Muitas requisições, tente novamente mais tarde',
              code: 'RATE_LIMITED',
            };
          }

          // 5xx Server Error - retry
          if (response.status >= 500) {
            throw new Error(`Erro no servidor: ${response.status}`);
          }
        }

        const data = await response.json();
        this.recordSuccess();
        return data;
      } catch (error: any) {
        lastError = error;

        // ===== RETRY LOGIC =====
        const isRetryable =
          error.name === 'AbortError' ||
          error.message.includes('fetch') ||
          error.message.includes('Erro no servidor');

        if (attempt < resolvedRetries && isRetryable) {
          const delay = this.getBackoffDelay(attempt);
          console.warn(
            `[API] Tentativa ${attempt + 1}/${
              resolvedRetries + 1
            } falhou para ${endpoint}, aguardando ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        this.recordFailure();
        console.error(`[API] Erro em ${endpoint}:`, error);
        return {
          success: false,
          error: error.message || 'Erro na requisição',
          code: 'REQUEST_FAILED',
        };
      }
    }

    this.recordFailure();
    return {
      success: false,
      error: lastError?.message || 'Erro na requisição após múltiplas tentativas',
      code: 'MAX_RETRIES_EXCEEDED',
    };
  }

  /**
   * Upload de arquivo
   */
  async upload<T = any>(
    endpoint: string,
    formData: FormData,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Get Blob for PDF/File download
   */
  async getBlob(endpoint: string): Promise<Blob> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = getAccessToken();

    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.status}`);
    }

    return await response.blob();
  }

  /**
   * Download de arquivo com retry
   */
  async download(endpoint: string, filename?: string): Promise<void> {
    try {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const response = await fetch(url);

          if (!response.ok) {
            if (response.status >= 500 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, this.getBackoffDelay(attempt)));
              continue;
            }
            throw new Error(`Erro ao baixar arquivo: ${response.status}`);
          }

          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename || 'download';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);

          this.recordSuccess();
          return;
        } catch (error: any) {
          lastError = error;
          if (attempt < 2) {
            console.warn(`[API] Download attempt ${attempt + 1}/3 failed, retrying...`);
            continue;
          }
        }
      }

      this.recordFailure();
      throw lastError || new Error('Erro ao baixar arquivo após múltiplas tentativas');
    } catch (error: any) {
      console.error('[API] Erro ao baixar arquivo:', error);
      throw error;
    }
  }
}

export const api = new ApiClient();

export default ApiClient;

~~~

---
## FILE: src/react-app/utils/apiUtils.ts
~~~typescript
/**
 * @file apiUtils.ts
 * @description Utilitários centralizados para chamadas de API com URL base automática
 *
 * Este arquivo fornece funções auxiliares para garantir que todas as URLs de API
 * usem a base URL correta em produção (VITE_API_URL) ou o origin em desenvolvimento.
 */

import { API_BASE_URL } from '@/react-app/config/api';

export { API_BASE_URL };

/**
 * Função global para chamadas de API com URL base automática
 * @param endpoint - Endpoint da API (ex: '/api/qualificacoes')
 * @param options - Opções de RequestInit (headers, method, body, etc)
 * @returns Promise<Response>
 */
export async function fetchWithBaseUrl(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
  return fetch(url, options);
}

/**
 * Wrapper para fetch com logging de erros
 */
export async function fetchWithLogging(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      console.warn(`API Error: ${response.status} ${response.statusText} on ${url}`);
    }
    return response;
  } catch (error) {
    console.error(`Fetch Error: ${error} on ${url}`);
    throw error;
  }
}

/**
 * Helper para construir URL completa
 */
export function buildApiUrl(endpoint: string): string {
  return endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
}

~~~

---
## FILE: src/react-app/utils/formatApiError.ts
~~~typescript
export interface ApiErrorDetail {
  path?: string[];
  message: string;
}

export interface ApiErrorPayload {
  error?: string;
  details?: ApiErrorDetail[];
}

export function formatApiError(data: ApiErrorPayload | undefined, fallback: string): string {
  if (!data) return fallback;
  let msg = data.error || fallback;
  if (Array.isArray(data.details) && data.details.length > 0) {
    msg +=
      '\n' + data.details.map((d) => `- ${d.path?.join('.') || 'campo'}: ${d.message}`).join('\n');
  }
  return msg;
}

~~~

---
## FILE: src/react-app/utils/handleApiError.ts
~~~typescript
import { useToast } from '@/react-app/hooks/useToast';

// Hook que retorna função padronizada para exibir erros de API
export function useHandleApiError() {
  const { error: toastError } = useToast();
  return (message?: string) => {
    if (!message) return;
    toastError(message);
  };
}

~~~

---
## FILE: src/react-app/utils/request-control.ts
~~~typescript
/**
 * Sistema de controle global de requests para evitar rate limiting
 *
 * Monitora e limita o número de requests feitos pela aplicação
 */

import { REQUEST_LIMITS } from './constants';
import { apiFetch } from '../lib/apiFetch';
import { logger } from './logger';

interface RequestStats {
  count: number;
  lastReset: number;
  windowMs: number;
}

class RequestController {
  private stats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.MINUTE_WINDOW,
  };

  private readonly MAX_REQUESTS_PER_MINUTE = REQUEST_LIMITS.PER_MINUTE;
  private readonly MAX_REQUESTS_PER_DAY = REQUEST_LIMITS.PER_DAY;

  private dailyStats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.DAY_WINDOW,
  };

  /**
   * Verifica se pode fazer um request
   */
  canMakeRequest(): boolean {
    this.resetIfNeeded();

    // Verifica limite por minuto
    if (this.stats.count >= this.MAX_REQUESTS_PER_MINUTE) {
      logger.warn(
        `[RequestControl] Limite de ${this.MAX_REQUESTS_PER_MINUTE} requests/min atingido`,
      );
      return false;
    }

    // Verifica limite diário
    if (this.dailyStats.count >= this.MAX_REQUESTS_PER_DAY) {
      logger.error(
        `[RequestControl] Limite diário de ${this.MAX_REQUESTS_PER_DAY} requests atingido!`,
      );
      return false;
    }

    return true;
  }

  /**
   * Registra um novo request
   */
  recordRequest(): void {
    this.resetIfNeeded();
    this.stats.count++;
    this.dailyStats.count++;
  }

  /**
   * Obtém estatísticas atuais
   */
  getStats() {
    this.resetIfNeeded();
    return {
      perMinute: this.stats.count,
      maxPerMinute: this.MAX_REQUESTS_PER_MINUTE,
      perDay: this.dailyStats.count,
      maxPerDay: this.MAX_REQUESTS_PER_DAY,
      percentDay: Math.round((this.dailyStats.count / this.MAX_REQUESTS_PER_DAY) * 100),
    };
  }

  /**
   * Reseta contadores se necessário
   */
  private resetIfNeeded(): void {
    const now = Date.now();

    // Reset contador por minuto
    if (now - this.stats.lastReset >= this.stats.windowMs) {
      this.stats.count = 0;
      this.stats.lastReset = now;
    }

    // Reset contador diário
    if (now - this.dailyStats.lastReset >= this.dailyStats.windowMs) {
      this.dailyStats.count = 0;
      this.dailyStats.lastReset = now;
    }
  }

  /**
   * Reseta manualmente os contadores (para testes)
   */
  reset(): void {
    this.stats.count = 0;
    this.stats.lastReset = Date.now();
    this.dailyStats.count = 0;
    this.dailyStats.lastReset = Date.now();
  }
}

// Instância global
export const requestController = new RequestController();

/**
 * Hook para usar o request controller
 */
export function useRequestControl() {
  return {
    canMakeRequest: () => requestController.canMakeRequest(),
    recordRequest: () => requestController.recordRequest(),
    getStats: () => requestController.getStats(),
  };
}

/**
 * Wrapper para fetch que controla requests
 */
export async function controlledFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!requestController.canMakeRequest()) {
    const stats = requestController.getStats();
    throw new Error(
      `Request bloqueado: limite atingido (${stats.perMinute}/${stats.maxPerMinute} por min, ${stats.perDay}/${stats.maxPerDay} por dia)`,
    );
  }

  requestController.recordRequest();
  return apiFetch(input, init);
}

~~~

---
## FILE: src/services/agendamentos.service.ts
~~~typescript
import api from './api';
import { Agendamento, AgendamentoCreate, AgendamentoUpdate, PaginacaoParams } from '@/types';

interface FiltrosAgendamentos {
  search?: string;
  simulador_id?: string;
  funcionario_id?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
}

export const agendamentosService = {
  listar: async (filtros?: FiltrosAgendamentos, paginacao?: PaginacaoParams): Promise<Agendamento[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.simulador_id) params.append('simulador_id', filtros.simulador_id);
    if (filtros?.funcionario_id) params.append('funcionario_id', filtros.funcionario_id);
    if (filtros?.status) params.append('status', filtros.status);
    if (filtros?.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros?.data_fim) params.append('data_fim', filtros.data_fim);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) params.append('limit', paginacao.limit.toString());

    return api.get(`/agendamentos?${params}`);
  },

  buscarPorId: async (id: string): Promise<Agendamento> => {
    return api.get(`/agendamentos/${id}`);
  },

  criar: async (data: AgendamentoCreate): Promise<Agendamento> => {
    return api.post('/agendamentos', data);
  },

  atualizar: async (id: string, data: AgendamentoUpdate): Promise<Agendamento> => {
    return api.put(`/agendamentos/${id}`, data);
  },

  excluir: async (id: string): Promise<void> => {
    return api.delete(`/agendamentos/${id}`);
  },

  iniciar: async (id: string): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/iniciar`);
  },

  finalizar: async (id: string, dados?: any): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/finalizar`, dados);
  },

  cancelar: async (id: string, motivo?: string): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/cancelar`, { motivo });
  }
};

~~~

---
## FILE: src/services/api.ts
~~~typescript
import { API_BASE_URL, getAccessToken } from '../react-app/config/api';

type Primitive = string | number | boolean;

type ApiParams = Record<string, Primitive | Primitive[] | null | undefined>;

interface ApiConfig {
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob' | 'text';
  params?: ApiParams;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: ApiParams): string {
  const base = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  if (!params || Object.keys(params).length === 0) {
    return base;
  }

  const url = new URL(base, typeof window !== 'undefined' ? window.location.origin : undefined);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function parseResponse(response: Response, responseType: ApiConfig['responseType']) {
  if (responseType === 'blob') {
    return response.blob();
  }

  if (responseType === 'text') {
    return response.text();
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(method: string, path: string, data?: unknown, config: ApiConfig = {}) {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(config.headers || {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    if (data instanceof FormData) {
      body = data;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(data);
    }
  }

  const response = await fetch(buildUrl(path, config.params), {
    method,
    headers,
    body,
    signal: config.signal,
  });

  const parsed = await parseResponse(response, config.responseType);

  if (!response.ok) {
    const fallbackMessage = `Erro HTTP ${response.status}`;
    const message =
      (parsed && typeof parsed === 'object' && ('error' in parsed || 'message' in parsed)
        ? (parsed as { error?: string; message?: string }).error ||
          (parsed as { error?: string; message?: string }).message
        : null) || fallbackMessage;

    const error = new Error(message);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = parsed;
    throw error;
  }

  return parsed;
}

const api = {
  get: (path: string, config?: ApiConfig) => request('GET', path, undefined, config),
  post: (path: string, data?: unknown, config?: ApiConfig) => request('POST', path, data, config),
  put: (path: string, data?: unknown, config?: ApiConfig) => request('PUT', path, data, config),
  patch: (path: string, data?: unknown, config?: ApiConfig) => request('PATCH', path, data, config),
  delete: (path: string, config?: ApiConfig) => request('DELETE', path, undefined, config),
};

console.info('[API] Legacy compatibility adapter ativo:', API_BASE_URL);

export default api;

~~~

---
## FILE: src/services/funcionarios.service.ts
~~~typescript
import api from './api';
import {
  Funcionario,
  FuncionarioCreate,
  FuncionarioUpdate,
  ImportResult,
  FiltrosFuncionarios,
  PaginacaoParams,
} from '@/types';

export const funcionariosService = {
  listar: async (
    filtros?: FiltrosFuncionarios,
    paginacao?: PaginacaoParams,
  ): Promise<{ data: Funcionario[]; total: number; page: number }> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.cargo) params.append('cargo', filtros.cargo);
    if (filtros?.setor) params.append('setor', filtros.setor);
    if (filtros?.ativo !== undefined) params.append('ativo', filtros.ativo.toString());
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      // Sem paginação explícita → buscar "todos" para preencher páginas
      params.append('limit', '10000');
      params.append('page', '1');
    }

    const response = await api.get(`/funcionarios?${params}`);
    console.log('[funcionariosService.listar] Response:', response);

    // API returns { success: true, data: [...] }
    // axios interceptor returns response.data, so we get the actual { success, data } object
    let data: Funcionario[] = [];

    if (Array.isArray(response)) {
      data = response;
    } else if (response && typeof response === 'object' && 'data' in response) {
      data = Array.isArray(response.data) ? response.data : [];
    }

    return { data, total: data.length, page: 1 };
  },

  buscarPorId: async (id: string | number): Promise<Funcionario> => {
    const response = await api.get(`/funcionarios/${id}`);
    // API returns { success: true, data: {...} }
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  criar: async (data: FuncionarioCreate): Promise<Funcionario> => {
    const response = await api.post('/funcionarios', data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  atualizar: async (id: string | number, data: FuncionarioUpdate): Promise<Funcionario> => {
    const response = await api.put(`/funcionarios/${id}`, data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  excluir: async (id: string | number): Promise<void> => {
    return api.delete(`/funcionarios/${id}`);
  },

  importar: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/funcionarios/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/funcionarios/export', { responseType: 'blob' });
  },
};

~~~

---
## FILE: src/services/index.ts
~~~typescript
export * from './funcionarios.service';
export * from './qualificacoes.service';
export * from './simuladores.service';
export * from './agendamentos.service';

~~~

---
## FILE: src/services/qualificacoes.service.ts
~~~typescript
import api from './api';
import {
  Qualificacao,
  QualificacaoCreate,
  QualificacaoUpdate,
  ImportResult,
  FiltrosQualificacoes,
  PaginacaoParams,
  DashboardStats,
} from '@/types';

export const qualificacoesService = {
  listar: async (
    filtros?: FiltrosQualificacoes,
    paginacao?: PaginacaoParams,
  ): Promise<Qualificacao[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.tipo_qualificacao) params.append('tipo', filtros.tipo_qualificacao);
    if (filtros?.status) params.append('status', filtros.status);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      // Endpoint aplica limite máximo interno (~100); evitar 500 usando um limite alto porém seguro
      params.append('limit', '100');
      params.append('page', '1');
    }

    const response = await api.get(`/qualificacoes?${params}`);
    return response.qualificacoes || response.data || [];
  },

  dashboard: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/qualificacoes');
    return response.data || response.stats || response;
  },

  buscarPorId: async (id: string | number): Promise<Qualificacao> => {
    const response = await api.get(`/qualificacoes/${id}`);
    return response.qualificacao || response.data;
  },

  criar: async (data: QualificacaoCreate): Promise<Qualificacao> => {
    const response = await api.post('/qualificacoes', data);
    return response.data || response;
  },

  atualizar: async (id: string | number, data: QualificacaoUpdate): Promise<Qualificacao> => {
    const response = await api.put(`/qualificacoes/${id}`, data);
    return response.data || response;
  },

  excluir: async (id: string | number): Promise<void> => {
    return api.delete(`/qualificacoes/${id}`);
  },

  importar: async (data: any[]): Promise<ImportResult> => {
    return api.post('/qualificacoes/import', { qualificacoes: data });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/qualificacoes/export', { responseType: 'blob' });
  },

  buscarPorFuncionario: async (
    funcionarioId: number,
  ): Promise<{ funcionario: any; qualificacoes: Qualificacao[]; stats: any }> => {
    return api.get(`/qualificacoes/funcionario/${funcionarioId}`);
  },
};

~~~

---
## FILE: src/services/simuladores.service.ts
~~~typescript
import api from './api';
import {
  Simulador,
  SimuladorCreate,
  SimuladorUpdate,
  FiltrosSimuladores,
  PaginacaoParams,
} from '@/types';

export const simuladoresService = {
  listar: async (
    filtros?: FiltrosSimuladores,
    paginacao?: PaginacaoParams,
  ): Promise<Simulador[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.tipo) params.append('tipo', filtros.tipo);
    if (filtros?.status) params.append('status', filtros.status);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      params.append('limit', '10000');
      params.append('page', '1');
    }

    return api.get(`/simuladores?${params}`);
  },

  buscarPorId: async (id: string): Promise<Simulador> => {
    return api.get(`/simuladores/${id}`);
  },

  criar: async (data: SimuladorCreate): Promise<Simulador> => {
    return api.post('/simuladores', data);
  },

  atualizar: async (id: string, data: SimuladorUpdate): Promise<Simulador> => {
    return api.put(`/simuladores/${id}`, data);
  },

  excluir: async (id: string): Promise<void> => {
    return api.delete(`/simuladores/${id}`);
  },

  importar: async (file: File): Promise<{ sucesso: number; erros: any[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/simuladores/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/simuladores/export', { responseType: 'blob' });
  },

  modelosSessao: async (): Promise<any[]> => {
    return api.get('/simuladores/modelos-sessao');
  },
};

~~~

---
## FILE: worker-airtrust/src/routes/admin-apply-migration.ts
~~~typescript
import { Hono } from 'hono';
import { auth } from '../middleware/auth';

const app = new Hono();

app.post('/apply-migration', auth(), async (c) => {
  const db = c.env.DB;
  const { migration_sql } = await c.req.json() as { migration_sql: string };
  
  if (!migration_sql) {
    return c.json({ success: false, error: 'migration_sql é obrigatório' }, 400);
  }
  
  try {
    const result = await db.exec(migration_sql);
    return c.json({ success: true, result }, 200);
  } catch (error) {
    console.error('Migration error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/admin-domain-events.ts
~~~typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.get('/domain-events', async (c) => {
  const empresaId = c.req.query('empresa_id');
  const tipo = c.req.query('tipo');
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);

  let sql = `
    SELECT id, empresa_id, modulo, tipo, payload, processado, created_at, processed_at
    FROM domain_events
    WHERE deleted_at IS NULL
  `;
  const bindings: Array<string | number> = [];

  if (empresaId) {
    sql += ' AND empresa_id = ?';
    bindings.push(Number(empresaId));
  }
  if (tipo) {
    sql += ' AND tipo = ?';
    bindings.push(tipo);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  bindings.push(limit);

  const result = await c.env.DB.prepare(sql)
    .bind(...bindings)
    .all();

  return c.json({
    success: true,
    data: result.results || [],
    total: (result.results || []).length,
  });
});

app.get('/integracoes/health', async (c) => {
  const empresaId = c.req.query('empresa_id') || String((c.get as any)('empresaId') || '');

  const eventos = empresaId
    ? await c.env.DB.prepare(
        `SELECT tipo, consumidores, processado_por, ultimo_erro, created_at
         FROM domain_events
         WHERE empresa_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 50`,
      )
        .bind(Number(empresaId))
        .all<{
          tipo: string;
          consumidores: string | null;
          processado_por: string | null;
          ultimo_erro: string | null;
          created_at: string;
        }>()
    : {
        results: [] as Array<{
          tipo: string;
          consumidores: string | null;
          processado_por: string | null;
          ultimo_erro: string | null;
          created_at: string;
        }>,
      };

  const jobs = await c.env.DB.prepare(
    `SELECT status_geracao, COUNT(*) as total
     FROM pasta_virtual_jobs
     WHERE deleted_at IS NULL
     GROUP BY status_geracao`,
  )
    .all<{ status_geracao: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status_geracao: string; total: number }> }));

  const pendencias = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as total
     FROM qualificacoes_pendencias
     WHERE deleted_at IS NULL
     GROUP BY status`,
  )
    .all<{ status: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status: string; total: number }> }));

  return c.json({
    success: true,
    data: {
      empresa_id: empresaId || null,
      eventos_recentes: eventos.results || [],
      pasta_virtual_jobs: jobs.results || [],
      qualificacoes_pendencias: pendencias.results || [],
      version: c.env.APP_VERSION || '0.0.0-dev',
    },
  });
});

app.post('/integracoes/test-event', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const { publishDomainEvent } = await import('../shared/domainEvents');

  await publishDomainEvent(
    c.env.DB,
    String(body.modulo || 'admin'),
    String(body.tipo || 'FUNCIONARIO_ATUALIZADO') as any,
    {
      empresa_id: String(body.empresa_id || (c.get as any)('empresaId') || '0'),
      origem_modulo: String(body.modulo || 'admin'),
      origem_usuario_id: String((c.get as any)('userId') || '0'),
      funcionario_id: body.funcionario_id ? String(body.funcionario_id) : undefined,
      ...(body.payload || {}),
    },
  );

  return c.json({ success: true });
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/admin-manual-migrations.ts
~~~typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.post('/apply-migration-0133', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0133] Iniciando correção de FKs...');

    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pasta_virtual', 'avaliacoes_manobras')",
      )
      .all();
    const existingTables = new Set(
      tables.results?.map((t: Record<string, unknown>) => String(t.name)) || [],
    );

    console.log('[MIGRATION-0133] Tabelas encontradas:', Array.from(existingTables));

    if (existingTables.has('pasta_virtual')) {
      console.log('[MIGRATION-0133] Corrigindo pasta_virtual...');

      const pvStatements = [
        'PRAGMA foreign_keys=OFF',
        'CREATE TABLE IF NOT EXISTS pasta_virtual_backup AS SELECT * FROM pasta_virtual',
        `CREATE TABLE pasta_virtual_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          funcionario_id INTEGER NOT NULL,
          tipo_documento TEXT NOT NULL,
          categoria TEXT,
          caminho_arquivo TEXT,
          arquivourl TEXT,
          nome_arquivo TEXT,
          nomeoriginal TEXT,
          arquivo_tamanho INTEGER,
          tamanho INTEGER,
          dataupload TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          uploadedby INTEGER,
          certificacao_id INTEGER,
          descricao TEXT,
          deleted_at TEXT,
          FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
        )`,
        'INSERT INTO pasta_virtual_new SELECT * FROM pasta_virtual',
        'DROP TABLE pasta_virtual',
        'ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual',
        'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)',
        'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)',
        'PRAGMA foreign_keys=ON',
      ];

      await db.batch(pvStatements.map((sql) => db.prepare(sql)));
      console.log('[MIGRATION-0133] ✅ pasta_virtual corrigida');
    }

    if (existingTables.has('avaliacoes_manobras')) {
      console.log('[MIGRATION-0133] Corrigindo avaliacoes_manobras...');

      const amStatements = [
        'PRAGMA foreign_keys=OFF',
        'CREATE TABLE IF NOT EXISTS avaliacoes_manobras_backup AS SELECT * FROM avaliacoes_manobras',
        `CREATE TABLE avaliacoes_manobras_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE NOT NULL,
          ficha_uuid TEXT NOT NULL,
          participante_id INTEGER NOT NULL,
          manobra_id INTEGER NOT NULL,
          manobra_codigo TEXT NOT NULL,
          manobra_nome TEXT NOT NULL,
          nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
          observacoes TEXT,
          avaliador_id INTEGER NOT NULL,
          data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
          FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
          FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
          FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
        )`,
        'INSERT INTO avaliacoes_manobras_new SELECT * FROM avaliacoes_manobras',
        'DROP TABLE avaliacoes_manobras',
        'ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)',
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)',
        'PRAGMA foreign_keys=ON',
      ];

      await db.batch(amStatements.map((sql) => db.prepare(sql)));
      console.log('[MIGRATION-0133] ✅ avaliacoes_manobras corrigida');
    }

    console.log('[MIGRATION-0133] ✅ Correção concluída!');

    return c.json({
      success: true,
      message: `Migration 0133 aplicada! Tabelas corrigidas: ${Array.from(existingTables).join(', ')}`,
      tables: Array.from(existingTables),
    });
  } catch (error) {
    console.error('[MIGRATION-0133] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0134', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0134] Iniciando fix NUCLEAR para funcionarios_old...');

    const statements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE IF EXISTS pasta_virtual_temp',
      'CREATE TABLE pasta_virtual_temp AS SELECT * FROM pasta_virtual',
      'DROP TABLE IF EXISTS pasta_virtual',
      `CREATE TABLE pasta_virtual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        categoria TEXT,
        caminho_arquivo TEXT,
        arquivourl TEXT,
        nome_arquivo TEXT,
        nomeoriginal TEXT,
        arquivo_tamanho INTEGER,
        tamanho INTEGER,
        dataupload TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        uploadedby INTEGER,
        certificacao_id INTEGER,
        descricao TEXT,
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )`,
      'INSERT INTO pasta_virtual SELECT * FROM pasta_virtual_temp',
      'DROP TABLE pasta_virtual_temp',
      'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)',
      'CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)',
    ];

    const checkAM = await db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='avaliacoes_manobras'")
      .first();

    if (checkAM) {
      statements.push('DROP TABLE IF EXISTS avaliacoes_manobras_temp');
      statements.push('CREATE TABLE avaliacoes_manobras_temp AS SELECT * FROM avaliacoes_manobras');
      statements.push('DROP TABLE IF EXISTS avaliacoes_manobras');
      statements.push(`CREATE TABLE avaliacoes_manobras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        ficha_uuid TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        manobra_codigo TEXT NOT NULL,
        manobra_nome TEXT NOT NULL,
        nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
        observacoes TEXT,
        avaliador_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
        FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
        FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )`);
      statements.push('INSERT INTO avaliacoes_manobras SELECT * FROM avaliacoes_manobras_temp');
      statements.push('DROP TABLE avaliacoes_manobras_temp');
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)',
      );
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)',
      );
      statements.push(
        'CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)',
      );
    }

    statements.push('PRAGMA foreign_keys=ON');

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0134] ✅ Fix NUCLEAR concluído!');

    return c.json({
      success: true,
      message: 'Migration 0134 aplicada! Todas as FK para funcionarios_old foram removidas.',
    });
  } catch (error) {
    console.error('[MIGRATION-0134] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0135', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0135] Removendo todos os triggers...');

    const triggerStatements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TRIGGER IF EXISTS trg_funcionarios_audit',
      'DROP TRIGGER IF EXISTS trg_funcionarios_update_timestamp',
      'DROP TRIGGER IF EXISTS trg_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS trg_pasta_virtual_validate_fk',
      'DROP TRIGGER IF EXISTS trg_avaliacoes_timestamp',
      'DROP TRIGGER IF EXISTS update_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS insert_pasta_virtual_timestamp',
      'DROP TRIGGER IF EXISTS trg_funcionarios_old_cleanup',
      'DROP TRIGGER IF EXISTS trg_any_audit_insert',
      'DROP TRIGGER IF EXISTS trg_any_audit_update',
      'DROP TRIGGER IF EXISTS trg_any_audit_delete',
      'PRAGMA foreign_keys=ON',
    ];

    await db.batch(triggerStatements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0135] ✅ Todos os triggers removidos!');

    return c.json({
      success: true,
      message: 'Migration 0135 aplicada! Todos os triggers removidos.',
    });
  } catch (error) {
    console.error('[MIGRATION-0135] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.get('/debug-funcionarios-old', async (c) => {
  const db = c.env.DB;

  try {
    const tables = await db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'view', 'trigger', 'index') ORDER BY type, name",
      )
      .all();

    const suspect =
      tables.results?.filter(
        (row: any) => row.sql && String(row.sql).toLowerCase().includes('funcionarios_old'),
      ) || [];

    const checkTable = await db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='funcionarios_old'")
      .first();

    return c.json({
      success: true,
      funcionarios_old_table_exists: !!checkTable,
      total_objects: tables.results?.length || 0,
      suspect_objects: suspect,
      all_tables: tables.results
        ?.filter((row: any) => row.type === 'table')
        .map((row: any) => row.name),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

app.post('/apply-migration-0136', async (c) => {
  const db = c.env.DB;

  try {
    console.log('[MIGRATION-0136] Reconstruindo 12 tabelas com FKs corretas...');

    const statements = [
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE IF EXISTS alertas_enviados_backup',
      'CREATE TABLE alertas_enviados_backup AS SELECT * FROM alertas_enviados',
      'DROP TABLE alertas_enviados',
      `CREATE TABLE alertas_enviados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER,
        data_envio TEXT DEFAULT (datetime('now')),
        destinatario TEXT,
        status TEXT DEFAULT 'ENVIADO',
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO alertas_enviados SELECT * FROM alertas_enviados_backup',
      'DROP TABLE alertas_enviados_backup',
      'DROP TABLE IF EXISTS arquivos_backup',
      'CREATE TABLE arquivos_backup AS SELECT * FROM arquivos',
      'DROP TABLE arquivos',
      `CREATE TABLE arquivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        nome_original TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        categoria TEXT DEFAULT 'geral',
        tamanho INTEGER,
        tipo TEXT,
        url_r2 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO arquivos SELECT * FROM arquivos_backup',
      'DROP TABLE arquivos_backup',
      'DROP TABLE IF EXISTS compliance_status_backup',
      'CREATE TABLE compliance_status_backup AS SELECT * FROM compliance_status',
      'DROP TABLE compliance_status',
      `CREATE TABLE compliance_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL,
        status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,
        detalhes TEXT,
        avaliado_por TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO compliance_status SELECT * FROM compliance_status_backup',
      'DROP TABLE compliance_status_backup',
      'DROP TABLE IF EXISTS consentimentos_lgpd_backup',
      'CREATE TABLE consentimentos_lgpd_backup AS SELECT * FROM consentimentos_lgpd',
      'DROP TABLE consentimentos_lgpd',
      `CREATE TABLE consentimentos_lgpd (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('coleta_dados', 'uso_imagem', 'compartilhamento', 'tratamento_dados')),
        aceito INTEGER NOT NULL DEFAULT 0,
        data_aceite TEXT,
        ip_aceite TEXT,
        user_agent TEXT,
        revogado INTEGER DEFAULT 0,
        data_revogacao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO consentimentos_lgpd SELECT * FROM consentimentos_lgpd_backup',
      'DROP TABLE consentimentos_lgpd_backup',
      'DROP TABLE IF EXISTS documentos_backup',
      'CREATE TABLE documentos_backup AS SELECT * FROM documentos',
      'DROP TABLE documentos',
      `CREATE TABLE documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        funcionario_id INTEGER NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        tamanho INTEGER NOT NULL,
        r2_key TEXT NOT NULL UNIQUE,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO documentos SELECT * FROM documentos_backup',
      'DROP TABLE documentos_backup',
      'DROP TABLE IF EXISTS fichas_manobras_historico_backup',
      'CREATE TABLE fichas_manobras_historico_backup AS SELECT * FROM fichas_manobras_historico',
      'DROP TABLE fichas_manobras_historico',
      `CREATE TABLE fichas_manobras_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ficha_uuid TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        manobra_codigo TEXT NOT NULL,
        manobra_nome TEXT NOT NULL,
        nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
        observacoes TEXT,
        avaliador_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
        FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
        FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )`,
      'INSERT INTO fichas_manobras_historico SELECT * FROM fichas_manobras_historico_backup',
      'DROP TABLE fichas_manobras_historico_backup',
      'DROP TABLE IF EXISTS funcionario_documentos_backup',
      'CREATE TABLE funcionario_documentos_backup AS SELECT * FROM funcionario_documentos',
      'DROP TABLE funcionario_documentos',
      `CREATE TABLE funcionario_documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        caminho_r2 TEXT NOT NULL,
        tamanho_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        descricao TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO funcionario_documentos SELECT * FROM funcionario_documentos_backup',
      'DROP TABLE funcionario_documentos_backup',
      'DROP TABLE IF EXISTS funcionarios_aeronaves_backup',
      'CREATE TABLE funcionarios_aeronaves_backup AS SELECT * FROM funcionarios_aeronaves',
      'DROP TABLE funcionarios_aeronaves',
      `CREATE TABLE funcionarios_aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        aeronave_id INTEGER NOT NULL,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
        FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),
        UNIQUE(funcionario_id, aeronave_id, data_inicio)
      )`,
      'INSERT INTO funcionarios_aeronaves SELECT * FROM funcionarios_aeronaves_backup',
      'DROP TABLE funcionarios_aeronaves_backup',
      'DROP TABLE IF EXISTS instrutores_simulador_backup',
      'CREATE TABLE instrutores_simulador_backup AS SELECT * FROM instrutores_simulador',
      'DROP TABLE instrutores_simulador',
      `CREATE TABLE instrutores_simulador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        habilitacoes TEXT,
        observacoes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO instrutores_simulador SELECT * FROM instrutores_simulador_backup',
      'DROP TABLE instrutores_simulador_backup',
      'DROP TABLE IF EXISTS licencas_backup',
      'CREATE TABLE licencas_backup AS SELECT * FROM licencas',
      'DROP TABLE licencas',
      `CREATE TABLE licencas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        numero TEXT NOT NULL,
        data_emissao TEXT NOT NULL,
        data_vencimento TEXT NOT NULL,
        observacoes TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO licencas SELECT * FROM licencas_backup',
      'DROP TABLE licencas_backup',
      'DROP TABLE IF EXISTS logs_acesso_dados_backup',
      'CREATE TABLE logs_acesso_dados_backup AS SELECT * FROM logs_acesso_dados',
      'DROP TABLE logs_acesso_dados',
      `CREATE TABLE logs_acesso_dados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        usuario_id INTEGER,
        acao TEXT NOT NULL CHECK(acao IN ('READ', 'UPDATE', 'DELETE', 'EXPORT')),
        campos_acessados TEXT,
        ip TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO logs_acesso_dados SELECT * FROM logs_acesso_dados_backup',
      'DROP TABLE logs_acesso_dados_backup',
      'DROP TABLE IF EXISTS notificacoes_backup',
      'CREATE TABLE notificacoes_backup AS SELECT * FROM notificacoes',
      'DROP TABLE notificacoes',
      `CREATE TABLE notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        funcionario_id INTEGER,
        lida BOOLEAN DEFAULT 0,
        data_envio TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      )`,
      'INSERT INTO notificacoes SELECT * FROM notificacoes_backup',
      'DROP TABLE notificacoes_backup',
      'PRAGMA foreign_keys=ON',
    ];

    await db.batch(statements.map((sql) => db.prepare(sql)));

    console.log('[MIGRATION-0136] ✅ Todas as 12 tabelas foram reconstruídas!');

    return c.json({
      success: true,
      message: 'Migration 0136 aplicada! Todas as 12 tabelas foram reconstruídas com FKs corretas.',
    });
  } catch (error) {
    console.error('[MIGRATION-0136] ❌ Erro:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/admin-migrate.ts
~~~typescript
/**
 * ADMIN MIGRATE ROUTE - Endpoint temporário para aplicar migrations
 * ⚠️ USAR APENAS EM EMERGÊNCIAS - Remover após uso
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/admin/migrate/0118
 * Aplica migration 0118: adiciona coluna modelo_aeronave_id
 * RBAC: apenas admin
 */
app.post('/0118', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;

  try {
    // 1. Adicionar nova coluna
    await db.prepare('ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id TEXT').run();

    // 2. Copiar dados
    await db
      .prepare('UPDATE funcionarios SET modelo_aeronave_id = aeronave WHERE aeronave IS NOT NULL')
      .run();

    // 3. Criar índice
    await db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id)',
      )
      .run();

    // 4. Verificar resultado
    const sample = await db
      .prepare('SELECT id, nome, aeronave, modelo_aeronave_id FROM funcionarios LIMIT 5')
      .all();

    return c.json({
      success: true,
      message: 'Migration 0118 aplicada com sucesso',
      sample: sample.results,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Se coluna já existe, retornar sucesso
    if (errorMessage.includes('duplicate column name')) {
      const sample = await db
        .prepare('SELECT id, nome, aeronave, modelo_aeronave_id FROM funcionarios LIMIT 5')
        .all();
      return c.json({
        success: true,
        message: 'Migration 0118 já foi aplicada anteriormente',
        sample: sample.results,
      });
    }

    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/admin-migration.ts
~~~typescript
/**
 * ENDPOINT ADMIN TEMPORÁRIO - Aplicar Migration 0133
 *
 * DELETE APÓS USO!
 *
 * Para executar:
 * curl -X POST https://airtrust-api-production.airtrust.workers.dev/admin/apply-migration-0133
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.post('/apply-migration-0133', async (c) => {
  const db = c.env.DB;

  try {
    await db.exec('PRAGMA foreign_keys=OFF');

    // 1. PASTA_VIRTUAL
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pasta_virtual_backup AS SELECT * FROM pasta_virtual
    `);

    await db.exec(`
      CREATE TABLE pasta_virtual_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        categoria TEXT,
        caminho_arquivo TEXT,
        arquivourl TEXT,
        nome_arquivo TEXT,
        nomeoriginal TEXT,
        arquivo_tamanho INTEGER,
        tamanho INTEGER,
        dataupload TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        uploadedby INTEGER,
        certificacao_id INTEGER,
        descricao TEXT,
        deleted_at TEXT,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`INSERT INTO pasta_virtual_new SELECT * FROM pasta_virtual`);
    await db.exec(`DROP TABLE pasta_virtual`);
    await db.exec(`ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual`);

    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at)`,
    );

    // 2. AVALIACOES_MANOBRAS
    await db.exec(`
      CREATE TABLE IF NOT EXISTS avaliacoes_manobras_backup AS SELECT * FROM avaliacoes_manobras
    `);

    await db.exec(`
      CREATE TABLE avaliacoes_manobras_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        ficha_uuid TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        manobra_codigo TEXT NOT NULL,
        manobra_nome TEXT NOT NULL,
        nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
        observacoes TEXT,
        avaliador_id INTEGER NOT NULL,
        data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
        FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
        FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`INSERT INTO avaliacoes_manobras_new SELECT * FROM avaliacoes_manobras`);
    await db.exec(`DROP TABLE avaliacoes_manobras`);
    await db.exec(`ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras`);

    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id)`,
    );
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id)`,
    );

    await db.exec('PRAGMA foreign_keys=ON');

    return c.json({
      success: true,
      message: 'Migration 0133 aplicada com sucesso!',
    });
  } catch (error) {
    console.error('Erro ao aplicar migration:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/admin-perfis.ts
~~~typescript
/**
 * ADMIN PERFIS PERMISSÕES ROUTES
 *
 * Gerenciamento de permissões por perfil (GESTOR, INSTRUTOR, ALUNO) por módulo.
 * Apenas ADMINISTRADOR pode alterar configurações de permissão.
 *
 * Endpoints:
 *   GET  /api/admin/perfis/permissoes  - Listar permissões configuradas
 *   POST /api/admin/perfis/permissoes  - Salvar permissões (batch upsert)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';

type PerfisVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminPerfisRoutes = new Hono<{ Bindings: Env; Variables: PerfisVars }>();

adminPerfisRoutes.use('/*', auth());
adminPerfisRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
});

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

// Módulos válidos para controle de acesso
const MODULOS_VALIDOS = [
  'qualificacoes',
  'escalas',
  'lms',
  'certificados',
  'frms',
  'simuladores',
  'funcionarios',
  'relatorios',
  'agendamentos',
] as const;

const ACOES_VALIDAS = ['visualizar', 'editar', 'criar', 'deletar'] as const;
const PERFIS_VALIDOS = ['GESTOR', 'INSTRUTOR', 'ALUNO'] as const;

type PermissaoRow = {
  perfil: string;
  modulo: string;
  acao: string;
  permitido: number;
};

async function savePerfisPermissoes(
  c: Parameters<typeof adminPerfisRoutes.get>[1] extends (ctx: infer T) => unknown ? T : never,
) {
  const { empresaId, role, userId: callerId } = getTenantContext(c);
  requireAdmin(role, 'atualizar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.salvar');

  const body = await c.req.json<unknown>().catch(() => null);

  if (!Array.isArray(body)) {
    throw badRequest('O corpo da requisição deve ser um array de permissões', 'INVALID_PAYLOAD');
  }

  if (body.length > 500) {
    throw badRequest('Máximo de 500 permissões por requisição', 'TOO_MANY_ITEMS');
  }

  type PermBody = { perfil: string; modulo: string; acao: string; permitido: boolean };
  const items: PermBody[] = [];

  for (const item of body) {
    if (!item || typeof item !== 'object') {
      throw badRequest('Item inválido no array', 'INVALID_ITEM');
    }
    const { perfil, modulo, acao, permitido } = item as Record<string, unknown>;

    if (typeof perfil !== 'string' || !(PERFIS_VALIDOS as readonly string[]).includes(perfil)) {
      throw badRequest(`Perfil inválido: ${perfil}`, 'INVALID_PERFIL');
    }
    if (typeof modulo !== 'string' || !(MODULOS_VALIDOS as readonly string[]).includes(modulo)) {
      throw badRequest(`Módulo inválido: ${modulo}`, 'INVALID_MODULO');
    }
    if (typeof acao !== 'string' || !(ACOES_VALIDAS as readonly string[]).includes(acao)) {
      throw badRequest(`Ação inválida: ${acao}`, 'INVALID_ACAO');
    }
    if (typeof permitido !== 'boolean') {
      throw badRequest(`Campo 'permitido' deve ser boolean`, 'INVALID_PERMITIDO');
    }

    items.push({ perfil, modulo, acao, permitido });
  }

  const db = c.env.DB;

  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO perfis_permissoes (empresa_id, perfil, modulo, acao, permitido, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(empresa_id, perfil, modulo, acao) DO UPDATE SET
           permitido = excluded.permitido,
           updated_at = excluded.updated_at`,
      )
      .bind(empresaId, item.perfil, item.modulo, item.acao, item.permitido ? 1 : 0)
      .run();
  }

  logger.info(
    `Admin id=${callerId} atualizou ${items.length} permissões de perfis empresa_id=${empresaId}`,
  );

  return c.json({ success: true, message: `${items.length} permissões atualizadas` });
}

// ---------------------------------------------------------------------------
// GET /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.get('/permissoes', async (c) => {
  const { empresaId, role } = getTenantContext(c);
  requireAdmin(role, 'listar permissões de perfis');

  const logger = createLogger(c, 'AdminPerfis.listar');

  const { results } = await c.env.DB.prepare(
    `SELECT perfil, modulo, acao, permitido
     FROM perfis_permissoes
     WHERE empresa_id = ?
     ORDER BY perfil, modulo, acao`,
  )
    .bind(empresaId)
    .all<PermissaoRow>();

  logger.info(`Permissões de perfis listadas empresa_id=${empresaId}`);

  return c.json({ success: true, data: results ?? [] });
});

// ---------------------------------------------------------------------------
// POST|PUT /api/admin/perfis/permissoes
// ---------------------------------------------------------------------------
adminPerfisRoutes.post('/permissoes', savePerfisPermissoes);
adminPerfisRoutes.put('/permissoes', savePerfisPermissoes);

export { adminPerfisRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/admin-usuarios.ts
~~~typescript
/**
 * ADMIN USUARIOS ROUTES
 *
 * Gerenciamento completo de usuários: CRUD, convites, permissões individuais.
 * Requer perfil ADMINISTRADOR ou GESTOR (apenas admin pode alterar outros admins).
 *
 * Endpoints:
 *   GET    /api/admin/usuarios              - Listar usuários da empresa
 *   POST   /api/admin/usuarios              - Criar usuário (envia convite)
 *   GET    /api/admin/usuarios/:id          - Detalhar usuário
 *   PUT    /api/admin/usuarios/:id          - Atualizar usuário
 *   DELETE /api/admin/usuarios/:id          - Desativar usuário (soft delete)
 *   POST   /api/admin/usuarios/:id/invite   - Reenviar convite
 *   GET    /api/admin/usuarios/:id/permissoes - Permissões individuais
 *   PUT    /api/admin/usuarios/:id/permissoes - Atualizar permissões individuais
 *   GET    /api/admin/usuarios/funcionarios-sem-usuario - Funcionários sem usuário
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden, notFound } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/security';
// crypto.randomBytes está disponível via Node.js compat ou podemos usar crypto.getRandomValues

type AdminVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminUsuariosRoutes = new Hono<{ Bindings: Env; Variables: AdminVars }>();

// Todos os endpoints requerem autenticação
adminUsuariosRoutes.use('/*', auth());
adminUsuariosRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

// ---------------------------------------------------------------------------
// Helper: garante que o caller é ADMINISTRADOR ou GESTOR
// ---------------------------------------------------------------------------
function requireAdminOrGestor(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN' && normalized !== 'GESTOR') {
    throw forbidden(
      action
        ? `Apenas ADMINISTRADOR ou GESTOR podem ${action}`
        : 'Acesso restrito a ADMINISTRADOR e GESTOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

function getCallerId(c: { get: (k: string) => unknown }): number {
  const raw = c.get('userId');
  return typeof raw === 'string' ? Number(raw) : (raw as number);
}

function getCallerRole(c: { get: (k: string) => unknown }): string {
  return String(c.get('userRole') || '').toUpperCase();
}

// Gerar token de convite seguro (usar Web Crypto disponível no Workers)
function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Data de expiração do convite (48 horas)
function inviteExpiresAt(): string {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function escapeInviteHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInviteLink(frontendUrl: string | undefined, inviteToken: string): string {
  const baseUrl = (frontendUrl || 'https://airtrust.online').replace(/\/$/, '');
  return `${baseUrl}/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;
}

async function sendInviteEmail(
  env: Env,
  logger: ReturnType<typeof createLogger>,
  payload: { email: string; nome: string; perfil: string; inviteLink: string },
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    return false;
  }

  try {
    const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
    const fromName = env.BREVO_FROM_NAME || 'Treinamento';

    if (env.BREVO_API_KEY) {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: payload.email, name: payload.nome }],
          subject: 'Bem-vindo ao AirTrust — Defina sua senha',
          htmlContent: `
            <p>Olá, <strong>${escapeInviteHtml(payload.nome)}</strong>!</p>
            <p>Você foi convidado para acessar o AirTrust com o perfil <strong>${escapeInviteHtml(payload.perfil)}</strong>.</p>
            <p>Clique no botão abaixo para definir sua senha e ativar seu acesso:</p>
            <p><a href="${payload.inviteLink}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Ativar minha conta</a></p>
            <p>Este link expira em 48 horas.</p>
            <p>Se você não esperava este convite, ignore este e-mail.</p>
          `,
        }),
      });

      const emailSent = brevoResponse.status === 201;
      if (!emailSent) {
        logger.warn(
          `Brevo retornou status ${brevoResponse.status} para convite de ${payload.email}`,
        );
      }

      return emailSent;
    }

    return false;
  } catch (emailError) {
    logger.warn(`Falha ao enviar e-mail de convite para ${payload.email}:`, emailError);
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/funcionarios-sem-usuario
// Lista funcionários da empresa sem vínculo com usuário do sistema
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/funcionarios-sem-usuario', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar funcionários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `
      SELECT f.id, f.nome, f.email, f.matricula, f.cargo
      FROM funcionarios f
      WHERE f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND f.ativo = 1
        AND NOT EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.funcionario_id = f.id
            AND u.deleted_at IS NULL
            AND u.active = 1
        )
      ORDER BY f.nome ASC
      LIMIT 200
    `,
    )
    .bind(empresaId)
    .all<{
      id: number;
      nome: string;
      email: string | null;
      matricula: string | null;
      cargo: string | null;
    }>();

  return c.json({ success: true, data: rows.results || [] });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios
// Lista usuários da empresa (admin vê todas, gestor vê sua empresa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar usuários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  // Admins globais podem ver todos; outros ficam restritos à empresa
  const callerRole = getCallerRole(c);
  const isGlobalAdmin = callerRole === 'ADMINISTRADOR' || callerRole === 'ADMIN';

  type UserRow = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    empresa_nome: string;
    is_primary: number;
    created_at: string;
    last_login: string | null;
    convite_pendente: number;
  };

  let rows: UserRow[] = [];

  if (isGlobalAdmin) {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ue.empresa_id
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .all<UserRow>();
    rows = result.results || [];
  } else {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ?
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .bind(empresaId, empresaId)
      .all<UserRow>();
    rows = result.results || [];
  }

  return c.json({ success: true, data: rows });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver usuário');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  type UserDetail = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    created_at: string;
    last_login: string | null;
  };

  const user = await db
    .prepare(
      `
      SELECT
        u.id, u.email, u.nome, u.perfil, u.active,
        u.funcionario_id, f.nome AS funcionario_nome,
        ue.empresa_id, u.created_at, u.last_login
      FROM usuarios u
      INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
      LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(empresaId, id)
    .first<UserDetail>();

  if (!user) throw notFound('Usuário não encontrado');

  // Carregar permissões individuais
  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string }>();

  return c.json({
    success: true,
    data: {
      ...user,
      permissoes: permissoes.results || [],
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios
// Criar novo usuário e disparar convite
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'criar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.create');

  const body = await c.req.json<{
    email?: string;
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    empresa_id?: number;
  }>();

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const nome = String(body?.nome || '').trim();
  const perfil = String(body?.perfil || 'ALUNO').toUpperCase();
  const funcionarioId = body?.funcionario_id ?? null;
  const targetEmpresaId = body?.empresa_id ?? empresaId;

  if (!email || !nome) {
    throw badRequest('email e nome são obrigatórios', 'MISSING_FIELDS');
  }

  // Gestor não pode criar ADMINISTRADOR
  if (perfil === 'ADMINISTRADOR' || perfil === 'ADMIN') {
    requireAdmin(callerRole, 'criar usuário ADMINISTRADOR');
  }

  // Validar e-mail básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('E-mail inválido', 'INVALID_EMAIL');
  }

  // Verificar se email já existe
  const existing = await db
    .prepare(`SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existing) {
    throw badRequest('E-mail já cadastrado no sistema', 'EMAIL_ALREADY_EXISTS');
  }

  // Criar usuário (sem senha — será definida via convite)
  const placeholderHash = `INVITE_PENDING_${Date.now()}`;

  const insertResult = await db
    .prepare(
      `INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, active)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .bind(email, placeholderHash, nome, perfil, funcionarioId)
    .run();

  const novoUsuarioId = insertResult.meta?.last_row_id as number;

  if (!novoUsuarioId) {
    throw new Error('Falha ao criar usuário');
  }

  // Vincular à empresa
  await db
    .prepare(
      `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role)
       VALUES (?, ?, 1, ?)`,
    )
    .bind(novoUsuarioId, targetEmpresaId, perfil)
    .run();

  // Gerar token de convite (48h)
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, novoUsuarioId, targetEmpresaId, email, perfil, callerId, expiresAt)
    .run();

  logger.info(`Usuário criado: id=${novoUsuarioId} email=${email} perfil=${perfil}`);

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email,
    nome,
    perfil,
    inviteLink,
  });

  return c.json(
    {
      success: true,
      data: {
        id: novoUsuarioId,
        email,
        nome,
        perfil,
        inviteToken,
        inviteLink,
        inviteExpiresAt: expiresAt,
        emailSent,
      },
      message: emailSent
        ? 'Usuário criado. E-mail de convite enviado.'
        : 'Usuário criado. Compartilhe o link de convite para que o usuário defina sua senha.',
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id
// Atualizar dados do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'editar usuário');
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    active?: boolean;
  }>();

  // Verificar que usuário pertence à empresa
  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Gestor não pode editar ADMINISTRADOR
  const targetPerfil = body?.perfil?.toUpperCase() || existente.perfil.toUpperCase();
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN' ||
      targetPerfil === 'ADMINISTRADOR' ||
      targetPerfil === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Apenas ADMINISTRADOR pode editar outros administradores', 'INSUFFICIENT_ROLE');
  }

  const updates: string[] = [];
  const binds: (string | number | null)[] = [];

  if (body?.nome) {
    updates.push('nome = ?');
    binds.push(body.nome.trim());
  }
  if (body?.perfil) {
    updates.push('perfil = ?');
    binds.push(body.perfil.toUpperCase());
    // Sincronizar role em usuarios_empresas
    await db
      .prepare(`UPDATE usuarios_empresas SET role = ? WHERE usuario_id = ? AND empresa_id = ?`)
      .bind(body.perfil.toUpperCase(), id, empresaId)
      .run();
  }
  if (body?.funcionario_id !== undefined) {
    updates.push('funcionario_id = ?');
    binds.push(body.funcionario_id);
  }
  if (body?.active !== undefined) {
    updates.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }

  if (updates.length === 0) {
    throw badRequest('Nenhum campo para atualizar', 'NO_FIELDS');
  }

  updates.push("updated_at = datetime('now')");
  binds.push(id);

  await db
    .prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  const atualizado = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil, u.active, u.funcionario_id, f.nome AS funcionario_nome,
              ue.empresa_id, e.nome AS empresa_nome, ue.is_primary, u.created_at, u.last_login
       FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId, id)
    .first();

  return c.json({ success: true, message: 'Usuário atualizado', data: atualizado });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/usuarios/:id  (soft delete / desativação)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.delete('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'desativar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  if (id === callerId) {
    throw badRequest('Você não pode desativar sua própria conta', 'SELF_DEACTIVATION');
  }

  const db = c.env.DB;

  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Gestor não pode deletar ADMINISTRADOR
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden(
      'Apenas ADMINISTRADOR pode desativar outros administradores',
      'INSUFFICIENT_ROLE',
    );
  }

  await db
    .prepare(`UPDATE usuarios SET active = 0, deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  return c.json({ success: true, message: 'Usuário desativado' });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios/:id/invite
// Reenviar convite (gera novo token, invalida anteriores)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/:id/invite', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'reenviar convite');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resendInvite');

  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; email: string; nome: string; perfil: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  // Invalidar convites anteriores
  await db
    .prepare(
      `UPDATE convites_usuarios SET used_at = datetime('now') WHERE usuario_id = ? AND empresa_id = ? AND used_at IS NULL`,
    )
    .bind(id, empresaId)
    .run();

  // Gerar novo convite
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, id, empresaId, user.email, user.perfil, callerId, expiresAt)
    .run();

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    inviteLink,
  });

  return c.json({
    success: true,
    data: {
      inviteToken,
      inviteLink,
      inviteExpiresAt: expiresAt,
      emailSent,
    },
    message: emailSent
      ? 'Novo convite gerado e enviado por e-mail.'
      : 'Novo convite gerado. Compartilhe o link para que o usuário defina sua senha.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id/permissoes
// Retorna permissões individuais do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver permissões');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  // Verificar acesso
  const exists = await db
    .prepare(
      `SELECT u.id FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first();

  if (!exists) throw notFound('Usuário não encontrado');

  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo, created_at FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string; created_at: string }>();

  return c.json({ success: true, data: permissoes.results || [] });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id/permissoes
// Atualizar permissões individuais (substituição completa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'atualizar permissões');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    permissoes?: Array<{ permissao: string; tipo: 'GRANT' | 'DENY' }>;
  }>();
  const permissoes = body?.permissoes || [];

  // Verificar acesso e role do target
  const targetUser = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; perfil: string }>();

  if (!targetUser) throw notFound('Usuário não encontrado');

  // Gestor não pode alterar permissões de ADMINISTRADOR
  if (
    (targetUser.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      targetUser.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Não é permitido alterar permissões de administrador', 'INSUFFICIENT_ROLE');
  }

  // Substituição completa: deletar todas e reinserir
  await db.prepare(`DELETE FROM usuario_permissoes WHERE usuario_id = ?`).bind(id).run();

  if (permissoes.length > 0) {
    for (const p of permissoes) {
      if (!p.permissao || !['GRANT', 'DENY'].includes(p.tipo)) continue;
      await db
        .prepare(
          `INSERT OR REPLACE INTO usuario_permissoes (usuario_id, permissao, tipo, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(id, p.permissao, p.tipo, callerId)
        .run();
    }
  }

  return c.json({ success: true, message: 'Permissões atualizadas' });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/usuarios/:id/reset-senha
// Admin redefine a senha de qualquer usuário sem precisar da senha atual
// ---------------------------------------------------------------------------
adminUsuariosRoutes.patch('/:id/reset-senha', async (c) => {
  requireAdmin(getCallerRole(c), 'redefinir senha de usuário');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resetSenha');

  const body = await c.req.json<{ nova_senha?: string }>();
  const novaSenha = String(body?.nova_senha || '').trim();

  if (!novaSenha || novaSenha.length < 8) {
    throw badRequest('A nova senha deve ter no mínimo 8 caracteres', 'PASSWORD_TOO_SHORT');
  }

  // Verificar que o usuário pertence à empresa (segurança multi-tenant)
  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(empresaId, id)
    .first<{ id: number; email: string; nome: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  const novoHash = await hashPassword(novaSenha);

  await db
    .prepare(
      `UPDATE usuarios
       SET password_hash = ?,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(novoHash, id)
    .run();

  // Audit log
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         VALUES (?, ?, 'ADMIN_RESET_SENHA', 'usuarios', ?, ?, datetime('now'))`,
      )
      .bind(
        empresaId,
        callerId,
        id,
        JSON.stringify({ target_email: user.email, target_nome: user.nome }),
      )
      .run();
  } catch {
    // Audit log é best-effort
    logger.warn(`Falha ao registrar audit log para reset de senha user_id=${id}`);
  }

  logger.info(`Admin id=${callerId} redefiniu senha do usuário id=${id} (${user.email})`);

  return c.json({ success: true, message: 'Senha redefinida com sucesso' });
});

export { adminUsuariosRoutes };

~~~

---
## FILE: worker-airtrust/src/routes/admin.ts
~~~typescript
/**
 * ADMIN ROUTES - Endpoints administrativos destrutivos
 *
 * ⚠️ DANGER ZONE ⚠️
 * Estes endpoints executam operações destrutivas irreversíveis.
 * Apenas usuários com role ADMIN podem acessar.
 *
 * Rotas disponíveis:
 * - DELETE /admin/reset/funcionarios
 * - DELETE /admin/reset/qualificacoes-tipos
 * - DELETE /admin/reset/qualificacoes-historico
 * - GET /admin/actions (auditoria)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import adminDomainEventsRoutes from './admin-domain-events';
import adminManualMigrationsRoutes from './admin-manual-migrations';
import { backfillSessionChecks } from '../services/backfill-session-checks';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ===== MIDDLEWARE: ADMIN ONLY =====

/**
 * Middleware que verifica se usuário é ADMIN
 * Bloqueia acesso se não for
 */
const adminOnly = () => {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: () => Promise<void>) => {
    const userId = c.get('userId') || null;
    const userEmail = c.get('userEmail') || null;
    const userRole = c.get('userRole') || null;

    console.log('[ADMIN] Verificando permissões:', {
      userId,
      userEmail,
      userRole,
      path: c.req.path,
    });

    if (!userId) {
      return c.json(
        {
          success: false,
          error: 'Usuário não autenticado',
        },
        401,
      );
    }

    // Verificar role ADMIN
    if (userRole !== 'ADMIN' && userRole !== 'admin') {
      console.warn('[ADMIN] Tentativa de acesso não autorizado:', {
        userId,
        email: userEmail,
        role: userRole,
        path: c.req.path,
      });

      return c.json(
        {
          success: false,
          error: 'Acesso negado. Apenas administradores podem executar esta ação.',
        },
        403,
      );
    }

    await next();
  };
};

// ===== HELPER: AUDIT LOG =====

async function registrarAcaoAdmin(
  db: D1Database,
  params: {
    userId?: number;
    userEmail?: string;
    action: string;
    module: string;
    deletedCount: number;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
) {
  try {
    await db
      .prepare(
        `
        INSERT INTO admin_actions (
          user_id, user_email, action, module, 
          deleted_count, success, error_message, 
          metadata_json, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
        params.userId || null,
        params.userEmail || null,
        params.action,
        params.module,
        params.deletedCount,
        params.success ? 1 : 0,
        params.errorMessage || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        params.ipAddress || null,
        params.userAgent || null,
      )
      .run();
  } catch (error) {
    console.error('[ADMIN] Erro ao registrar auditoria:', error);
    // Não falhar a operação se auditoria falhar, apenas logar
  }
}

// ===== ROTAS DE RESET =====

/**
 * DELETE /admin/reset/funcionarios
 *
 * ⚠️ APAGA TODOS OS FUNCIONÁRIOS DO SISTEMA
 *
 * Ordem de deleção (respeita FKs):
 * 1. qualificacoes_historico (FK: funcionario_id)
 * 2. funcionarios_habilitacoes (FK: funcionario_id)
 * 3. funcionarios (tabela principal)
 *
 * Retorna: { success, deletedCount, details }
 */
app.delete('/reset/funcionarios', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';

  try {
    console.log('[ADMIN] Iniciando reset de funcionários. User:', userEmail);

    let totalDeleted = 0;
    const details: Record<string, number> = {};

    // IMPORTANTE: Usar soft delete devido aos triggers de proteção

    // 1. Soft delete histórico de qualificações
    const histResult = await c.env.DB.prepare(
      "UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL",
    ).run();
    details.qualificacoes_historico = histResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_historico;

    // 2. Soft delete aeronaves associadas (se existir)
    try {
      const aeroResult = await c.env.DB.prepare(
        "UPDATE funcionarios_aeronaves SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL",
      ).run();
      details.funcionarios_aeronaves = aeroResult.meta.changes || 0;
      totalDeleted += details.funcionarios_aeronaves;
    } catch (e) {
      details.funcionarios_aeronaves = 0;
    }

    // 3. Soft delete documentos (se existir)
    try {
      const docResult = await c.env.DB.prepare(
        "UPDATE funcionario_documentos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL) AND deleted_at IS NULL",
      ).run();
      details.funcionario_documentos = docResult.meta.changes || 0;
      totalDeleted += details.funcionario_documentos;
    } catch (e) {
      details.funcionario_documentos = 0;
    }

    // 4. Finalmente, soft delete funcionários
    const funcResult = await c.env.DB.prepare(
      "UPDATE funcionarios SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deleted_at IS NULL",
    ).run();
    details.funcionarios = funcResult.meta.changes || 0;
    totalDeleted += details.funcionarios;

    const duration = Date.now() - startTime;

    // Registrar auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_FUNCIONARIOS',
      module: 'funcionarios',
      deletedCount: totalDeleted,
      success: true,
      metadata: { details, duration },
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de funcionários concluído:', { totalDeleted, details, duration });

    return c.json({
      success: true,
      deletedCount: totalDeleted,
      details,
      duration,
      message: `${totalDeleted} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar funcionários:', error);

    // Registrar erro na auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_FUNCIONARIOS',
      module: 'funcionarios',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar funcionários',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * DELETE /admin/reset/qualificacoes-tipos
 *
 * ⚠️ APAGA TODOS OS TIPOS DE QUALIFICAÇÃO
 *
 * Ordem de deleção:
 * 1. qualificacoes_historico (FK: qualificacao_tipo_id)
 * 2. qualificacoes_tipos (tabela principal)
 */
app.delete('/reset/qualificacoes-tipos', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';

  try {
    console.log('[ADMIN] Iniciando reset de tipos de qualificação. User:', userEmail);

    let totalDeleted = 0;
    const details: Record<string, number> = {};

    // Desabilitar triggers temporariamente para evitar conflitos de auditoria
    await c.env.DB.prepare('PRAGMA recursive_triggers = OFF').run();

    // 1. Soft delete histórico que referencia tipos
    const histResult = await c.env.DB.prepare(
      "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE deleted_at IS NULL) AND deleted_at IS NULL",
    ).run();
    details.qualificacoes_historico = histResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_historico;

    // 2. Soft delete tipos
    const tiposResult = await c.env.DB.prepare(
      "UPDATE qualificacoes_tipos SET deleted_at = datetime('now') WHERE deleted_at IS NULL",
    ).run();
    details.qualificacoes_tipos = tiposResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_tipos;

    // Reabilitar triggers
    await c.env.DB.prepare('PRAGMA recursive_triggers = ON').run();

    const duration = Date.now() - startTime;

    // Auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_TIPOS',
      module: 'qualificacoes_tipos',
      deletedCount: totalDeleted,
      success: true,
      metadata: { details, duration },
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de tipos concluído:', { totalDeleted, details, duration });

    return c.json({
      success: true,
      deletedCount: totalDeleted,
      details,
      duration,
      message: `${totalDeleted} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar tipos:', error);

    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_TIPOS',
      module: 'qualificacoes_tipos',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar tipos de qualificação',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * DELETE /admin/reset/qualificacoes-historico
 *
 * ⚠️ APAGA TODO O HISTÓRICO DE QUALIFICAÇÕES
 *
 * Mais seguro que os outros pois não tem dependentes.
 */
app.delete('/reset/qualificacoes-historico', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';

  try {
    console.log('[ADMIN] Iniciando reset de histórico de qualificações. User:', userEmail);

    // Desabilitar triggers temporariamente
    await c.env.DB.prepare('PRAGMA recursive_triggers = OFF').run();

    const result = await c.env.DB.prepare(
      "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE deleted_at IS NULL",
    ).run();
    const deletedCount = result.meta.changes || 0;

    // Reabilitar triggers
    await c.env.DB.prepare('PRAGMA recursive_triggers = ON').run();

    const duration = Date.now() - startTime;

    // Auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_HISTORICO',
      module: 'qualificacoes_historico',
      deletedCount,
      success: true,
      metadata: { duration },
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de histórico concluído:', { deletedCount, duration });

    return c.json({
      success: true,
      deletedCount,
      duration,
      message: `${deletedCount} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar histórico:', error);

    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_HISTORICO',
      module: 'qualificacoes_historico',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar histórico de qualificações',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * GET /admin/actions
 *
 * Lista histórico de ações administrativas
 * Query params:
 * - limit: número de registros (default: 50)
 * - offset: paginação (default: 0)
 */
app.get('/actions', auth(), adminOnly(), async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const actions = await c.env.DB.prepare(
      `
      SELECT * FROM v_admin_actions_audit
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
      .bind(limit, offset)
      .all();

    return c.json({
      success: true,
      data: actions.results,
      meta: {
        limit,
        offset,
        count: actions.results?.length || 0,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao listar ações:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao listar ações administrativas',
      },
      500,
    );
  }
});

app.route('/', adminDomainEventsRoutes);
app.route('/', adminManualMigrationsRoutes);

/**
 * POST /api/admin/backfill-session-checks
 *
 * Backfill de manutenção para fichas de sessão com problemas de dados:
 * 1. Popula modelos_sessao_checks a partir de sessoes_checks existentes
 * 2. Linka simulador_agendamentos sem template_id ao modelo pelo tipo_sessao
 * 3. Cria sessoes_checks_resultados aprovados para fichas APROVADAS sem resultado
 */
app.post('/backfill-session-checks', async (c) => {
  try {
    const resultado = await backfillSessionChecks(c.env.DB);
    return c.json({ success: true, data: resultado });
  } catch (error) {
    console.error('[ADMIN] Erro no backfill:', error);
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/aeronaves.ts
~~~typescript
import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { auth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { getEmpresaIdSafe } from './escalas-shared';
import { desalocarAeronaveInativa } from './escalas-alocacoes';

const aeronaves = new Hono<{ Bindings: Env }>();

// ===== GET /api/aeronaves =====
aeronaves.get('/', optionalAuth(), async (c) => {
  const db = c.env.DB;
  const somenteAtivas = ['1', 'true', 'sim'].includes(
    String(c.req.query('somente_ativas') || '')
      .trim()
      .toLowerCase(),
  );

  try {
    const filters = ['deleted_at IS NULL'];
    if (somenteAtivas) {
      filters.push("UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'");
    }

    const { results } = await db
      .prepare(
        `
        SELECT id, modelo, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at
        FROM aeronaves
        WHERE ${filters.join(' AND ')}
        ORDER BY modelo ASC
        `,
      )
      .all();

    return c.json({
      success: true,
      data: results || [],
    });
  } catch (error) {
    console.error('[AERONAVES] Erro ao listar:', error);
    throw new ApiError('Erro ao listar aeronaves', 500);
  }
});

// ===== GET /api/aeronaves/:id =====
aeronaves.get('/:id', optionalAuth(), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const { results } = await db
      .prepare(
        `
        SELECT id, modelo, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at
        FROM aeronaves
        WHERE id = ? AND deleted_at IS NULL
        `,
      )
      .bind(id)
      .all();

    if (!results || results.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    return c.json({
      success: true,
      data: results[0],
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[AERONAVES] Erro ao buscar:', error);
    throw new ApiError('Erro ao buscar aeronave', 500);
  }
});

// ===== POST /api/aeronaves =====
aeronaves.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json()) as {
    modelo: string;
    prefixo?: string;
    ano_fabricacao?: number;
    status?: string;
    observacoes?: string;
  };

  if (!body.modelo || body.modelo.trim().length === 0) {
    throw new ApiError('Modelo da aeronave é obrigatório', 400);
  }

  try {
    const result = await db
      .prepare(
        `
        INSERT INTO aeronaves (codigo, modelo, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
      )
      .bind(
        body.prefixo ? body.prefixo.trim().toUpperCase() : `${body.modelo.trim()}_${Date.now()}`,
        body.modelo.trim(),
        body.prefixo || null,
        body.ano_fabricacao || null,
        body.status || 'ATIVO',
        body.observacoes || null,
      )
      .run();

    const newId = result.meta.last_row_id;
    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'aeronaves',
      acao: 'INSERT',
      registro_id: newId,
      dados_novos: body,
      ...ua,
    });

    return c.json(
      {
        success: true,
        data: {
          id: newId,
          modelo: body.modelo.trim(),
          prefixo: body.prefixo || null,
          ano_fabricacao: body.ano_fabricacao || null,
          status: body.status || 'ATIVO',
          observacoes: body.observacoes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      201,
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[AERONAVES] Erro ao criar:', errorMsg, error);
    if (errorMsg.includes('UNIQUE constraint failed')) {
      throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }
    throw new ApiError(`Erro ao criar aeronave: ${errorMsg}`, 500);
  }
});

// ===== PUT /api/aeronaves/:id =====
aeronaves.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    modelo?: string;
    prefixo?: string;
    ano_fabricacao?: number;
    status?: string;
    observacoes?: string;
  };

  if (Object.keys(body).length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400);
  }

  try {
    // Verifica se existe
    const { results: existing } = await db
      .prepare(
        'SELECT id, status, prefixo, modelo FROM aeronaves WHERE id = ? AND deleted_at IS NULL',
      )
      .bind(id)
      .all<{ id: number; status: string | null; prefixo: string | null; modelo: string | null }>();

    if (!existing || existing.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    const aeronaveAtual = existing[0];
    const statusAnterior =
      String(aeronaveAtual.status || 'ATIVO')
        .trim()
        .toUpperCase() || 'ATIVO';

    // Monta query dinâmica
    const fields = [];
    const values = [];

    if (body.modelo !== undefined) {
      fields.push('modelo = ?');
      values.push(body.modelo ? body.modelo.trim() : null);
    }
    if (body.prefixo !== undefined) {
      fields.push('prefixo = ?');
      values.push(body.prefixo || null);
    }
    if (body.ano_fabricacao !== undefined) {
      fields.push('ano_fabricacao = ?');
      values.push(body.ano_fabricacao || null);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status);
    }
    if (body.observacoes !== undefined) {
      fields.push('observacoes = ?');
      values.push(body.observacoes || null);
    }

    fields.push('updated_at = datetime("now")');
    values.push(id);

    const query = `UPDATE aeronaves SET ${fields.join(', ')} WHERE id = ?`;

    await db
      .prepare(query)
      .bind(...values)
      .run();

    const statusNovo =
      body.status !== undefined
        ? String(body.status || '')
            .trim()
            .toUpperCase() || 'ATIVO'
        : statusAnterior;

    if (statusAnterior === 'ATIVO' && statusNovo !== 'ATIVO') {
      const empresaId = getEmpresaIdSafe(c);

      if (empresaId) {
        await desalocarAeronaveInativa(db, {
          empresaId,
          aeronaveId: Number(id),
          userId: String(c.get('userId' as never) || 'system'),
          motivo: `Aeronave ${aeronaveAtual.prefixo || aeronaveAtual.modelo || id} inativada`,
        });

        const aeronaveLabels = [aeronaveAtual.prefixo, aeronaveAtual.modelo]
          .filter(Boolean)
          .map((value) => String(value).trim().toUpperCase());

        for (const label of aeronaveLabels) {
          await db
            .prepare(
              `UPDATE escala_tripulacoes
                  SET pic_id = NULL,
                      sic_id = NULL,
                      aeronave = NULL,
                      observacoes = TRIM(COALESCE(observacoes || ' ', '') || '[Aeronave inativada]'),
                      updated_at = datetime('now')
                WHERE deleted_at IS NULL
                  AND escala_id IN (
                    SELECT id
                      FROM escalas_mensais
                     WHERE empresa_id = ?
                       AND status != 'arquivada'
                       AND deleted_at IS NULL
                  )
                  AND (
                    UPPER(TRIM(COALESCE(aeronave, ''))) = ?
                    OR UPPER(TRIM(COALESCE(aeronave, ''))) LIKE ?
                  )`,
            )
            .bind(empresaId, label, `${label}%`)
            .run();
        }
      }
    }

    // Busca o registro atualizado
    const { results: updated } = await db
      .prepare('SELECT * FROM aeronaves WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .all();

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'aeronaves',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: body,
      ...ua2,
    });

    return c.json({
      success: true,
      data: updated && updated.length > 0 ? updated[0] : null,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.message?.includes('UNIQUE constraint')) {
      throw new ApiError('Aeronave com esse prefixo já existe', 409);
    }
    console.error('[AERONAVES] Erro ao atualizar:', error);
    throw new ApiError('Erro ao atualizar aeronave', 500);
  }
});

// ===== DELETE /api/aeronaves/:id =====
aeronaves.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const { results: existing } = await db
      .prepare('SELECT id FROM aeronaves WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .all();

    if (!existing || existing.length === 0) {
      throw new ApiError('Aeronave não encontrada', 404);
    }

    // Soft delete
    await db
      .prepare('UPDATE aeronaves SET deleted_at = datetime("now") WHERE id = ?')
      .bind(id)
      .run();

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({ db, tabela: 'aeronaves', acao: 'DELETE', registro_id: id, ...ua3 });

    return c.json({
      success: true,
      message: 'Aeronave deletada com sucesso',
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[AERONAVES] Erro ao deletar:', error);
    throw new ApiError('Erro ao deletar aeronave', 500);
  }
});

export default aeronaves;

~~~

---
## FILE: worker-airtrust/src/routes/alertas.ts
~~~typescript
// ============================================================
// AIRTRUST - FASE 4: ALERTAS DE VENCIMENTO
// ============================================================
// Endpoint único para listar alertas de vencimento:
//  - Qualificações que vencem em <= X dias (padrão 60)
//  - Licenças que vencem em <= X dias (padrão 60)
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createLogger, toError } from '../utils/logger';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
  normalizeQualificacoesAlertaDias,
} from '../utils/qualificacoes-alerta-config';
import { getEmpresaId } from '../middleware/tenant';
import { normalizeWhatsAppPhone } from '../utils/whatsapp';
import {
  getTwilioWhatsAppDiagnosis,
  mapTwilioMessageStatus,
  verifyTwilioWebhookSignature,
} from '../utils/twilio';
import {
  getLocalWhatsAppTemplateRecord,
  listLocalWhatsAppTemplates,
  seedLocalWhatsAppTemplateCatalog,
  syncWhatsAppTemplatesToTwilio,
} from '../utils/alert-whatsapp-templates-store';
import {
  buildQualificacaoTemplateVariables,
  getAlertWhatsAppTemplateCatalog,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
  type AlertWhatsAppTemplateKey,
} from '../utils/whatsapp-templates';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';

const app = new Hono<{ Bindings: Env }>();
const TWILIO_STATUS_CALLBACK_PATH = '/api/alertas/whatsapp/status-callback';

export function buildAlertasVencimentosQualificacoesQuery(vencimentoExpr: string) {
  return `SELECT
          qh.id,
          qh.funcionario_id,
          qh.data_conclusao,
          ${vencimentoExpr} as data_vencimento,
          COALESCE(qt.nome, qh.qualificacao_codigo, 'Qualificação') AS nome_qualificacao,
          COALESCE(qh.qualificacao_codigo, qt.codigo) AS codigo_qualificacao,
          COALESCE(qh.categoria, qt.categoria, qt.nome, 'Sem categoria') AS categoria,
          p.nome,
          p.matricula,
          p.funcao,
          NULL as base
       FROM qualificacoes_historico qh
       JOIN funcionarios p ON qh.funcionario_id = p.id
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      WHERE qh.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.empresa_id = ?
        AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
        AND COALESCE(qh.renovada, 0) = 0
        AND UPPER(COALESCE(qh.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA')
        AND NOT EXISTS (
          SELECT 1
            FROM qualificacoes_historico qh_new
            LEFT JOIN qualificacoes_tipos qt_new
              ON qt_new.id = qh_new.qualificacao_id
             AND qt_new.deleted_at IS NULL
           WHERE qh_new.deleted_at IS NULL
             AND qh_new.funcionario_id = qh.funcionario_id
             AND qh_new.id <> qh.id
             AND COALESCE(qh_new.renovada, 0) = 0
             AND UPPER(COALESCE(qh_new.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA', 'PLANEJADA')
             AND UPPER(TRIM(COALESCE(qh_new.qualificacao_codigo, qt_new.codigo, ''))) =
                 UPPER(TRIM(COALESCE(qh.qualificacao_codigo, qt.codigo, '')))
             AND date(COALESCE(
               qh_new.data_vencimento,
               CASE
                 WHEN qh_new.data_conclusao IS NOT NULL
                   THEN date(qh_new.data_conclusao, '+' || COALESCE(qh_new.validade_meses, qt_new.validade, 12) || ' months')
                 ELSE NULL
               END
             )) > date(${vencimentoExpr})
        )
        AND ${vencimentoExpr} IS NOT NULL
        AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days')
      ORDER BY data_vencimento ASC`;
}

function buildWhatsAppManualLink(telefone: string, mensagem?: string): string {
  const normalized = normalizeWhatsAppPhone(telefone);
  const baseUrl = `https://wa.me/${normalized.e164.replace(/\D/g, '')}`;

  if (!mensagem?.trim()) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(mensagem)}`;
}

function alertasErrorResponse(
  c: Context<{ Bindings: Env }>,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
  error: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ success: false, error, code, ...extra }, status);
}

// Auth específico por rota (rotas montadas em /api não podem ter use('*') global)
app.use('/alertas/vencimentos', auth());
app.use('/alertas/ead-vencido/:id', auth());
app.use('/alertas/whatsapp/delivery/:sid', auth());
app.use('/alertas/whatsapp/templates', auth());
app.use('/alertas/whatsapp/templates/*', auth());

async function ensureWhatsAppDeliveryTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS alertas_whatsapp_delivery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER,
        qualificacao_historico_id INTEGER,
        funcionario_id INTEGER,
        provider TEXT NOT NULL,
        provider_message_id TEXT NOT NULL UNIQUE,
        telefone_destino TEXT,
        telefone_origem TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        payload_json TEXT,
        accepted_at TEXT,
        delivered_at TEXT,
        failed_at TEXT,
        last_event_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();

  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_empresa_status ON alertas_whatsapp_delivery (empresa_id, status, updated_at DESC)',
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_historico ON alertas_whatsapp_delivery (qualificacao_historico_id, updated_at DESC)',
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_delivery_funcionario ON alertas_whatsapp_delivery (funcionario_id, updated_at DESC)',
    )
    .run();
}

function formatDatePtBr(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

async function upsertWhatsAppDeliveryLog(
  db: D1Database,
  payload: {
    empresaId?: number | null;
    qualificacaoHistoricoId?: number | null;
    funcionarioId?: number | null;
    provider: string;
    providerMessageId: string;
    telefoneDestino?: string | null;
    telefoneOrigem?: string | null;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    rawPayload?: Record<string, unknown> | null;
  },
): Promise<void> {
  await ensureWhatsAppDeliveryTable(db);

  const status =
    String(payload.status || '')
      .trim()
      .toLowerCase() || 'unknown';
  const acceptedAt = ['accepted', 'queued', 'sent'].includes(status) ? "datetime('now')" : 'NULL';
  const deliveredAt = ['delivered', 'read'].includes(status) ? "datetime('now')" : 'NULL';
  const failedAt = ['failed', 'undelivered'].includes(status) ? "datetime('now')" : 'NULL';

  await db
    .prepare(
      `INSERT INTO alertas_whatsapp_delivery (
        empresa_id,
        qualificacao_historico_id,
        funcionario_id,
        provider,
        provider_message_id,
        telefone_destino,
        telefone_origem,
        status,
        error_code,
        error_message,
        payload_json,
        accepted_at,
        delivered_at,
        failed_at,
        last_event_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${acceptedAt}, ${deliveredAt}, ${failedAt}, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(provider_message_id) DO UPDATE SET
        empresa_id = COALESCE(excluded.empresa_id, alertas_whatsapp_delivery.empresa_id),
        qualificacao_historico_id = COALESCE(excluded.qualificacao_historico_id, alertas_whatsapp_delivery.qualificacao_historico_id),
        funcionario_id = COALESCE(excluded.funcionario_id, alertas_whatsapp_delivery.funcionario_id),
        provider = excluded.provider,
        telefone_destino = COALESCE(excluded.telefone_destino, alertas_whatsapp_delivery.telefone_destino),
        telefone_origem = COALESCE(excluded.telefone_origem, alertas_whatsapp_delivery.telefone_origem),
        status = excluded.status,
        error_code = COALESCE(excluded.error_code, alertas_whatsapp_delivery.error_code),
        error_message = COALESCE(excluded.error_message, alertas_whatsapp_delivery.error_message),
        payload_json = COALESCE(excluded.payload_json, alertas_whatsapp_delivery.payload_json),
        accepted_at = COALESCE(alertas_whatsapp_delivery.accepted_at, excluded.accepted_at),
        delivered_at = COALESCE(alertas_whatsapp_delivery.delivered_at, excluded.delivered_at),
        failed_at = COALESCE(alertas_whatsapp_delivery.failed_at, excluded.failed_at),
        last_event_at = datetime('now'),
        updated_at = datetime('now')`,
    )
    .bind(
      payload.empresaId ?? null,
      payload.qualificacaoHistoricoId ?? null,
      payload.funcionarioId ?? null,
      payload.provider,
      payload.providerMessageId,
      payload.telefoneDestino ?? null,
      payload.telefoneOrigem ?? null,
      status,
      payload.errorCode ?? null,
      payload.errorMessage ?? null,
      payload.rawPayload ? JSON.stringify(payload.rawPayload) : null,
    )
    .run();
}

async function fetchTwilioMessageStatus(env: Env, sid: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('WHATSAPP_NOT_CONFIGURED');
  }

  const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${sid}.json`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TWILIO_STATUS_ERROR: ${response.status} - ${errorText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return mapTwilioMessageStatus(payload);
}

async function enviarEmail(
  env: Env,
  destinatarios: string[],
  assunto: string,
  corpoTexto: string,
  corpoHtml: string,
): Promise<{ messageId: string | null; provider: 'brevo' }> {
  if (!env.BREVO_API_KEY) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        name: env.BREVO_FROM_NAME || 'Treinamento',
      },
      to: destinatarios.map((email) => ({ email })),
      subject: assunto,
      textContent: corpoTexto,
      htmlContent: corpoHtml,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BREVO_ERROR: ${response.status} - ${errorText}`);
  }

  const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: payload?.messageId || null, provider: 'brevo' };
}

app.get(
  '/alertas/whatsapp/templates',
  requireRole('admin'),
  async (c: Context<{ Bindings: Env }>) => {
    try {
      const catalog = getAlertWhatsAppTemplateCatalog();
      await seedLocalWhatsAppTemplateCatalog(c.env.DB);
      const localRows = await listLocalWhatsAppTemplates(c.env.DB);
      const localByKey = new Map(localRows.map((row) => [row.template_key, row]));

      return c.json({
        success: true,
        data: catalog.map((template) => ({
          ...template,
          local: localByKey.get(template.key) || null,
        })),
      });
    } catch (error) {
      return alertasErrorResponse(
        c,
        500,
        'Erro ao listar templates de WhatsApp',
        'WHATSAPP_TEMPLATES_LIST_ERROR',
        {
          details: error instanceof Error ? error.message : String(error),
        },
      );
    }
  },
);

app.post(
  '/alertas/whatsapp/templates/sync',
  requireRole('admin'),
  async (c: Context<{ Bindings: Env }>) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        templateKeys?: AlertWhatsAppTemplateKey[];
      };
      const validKeys = new Set(getAlertWhatsAppTemplateCatalog().map((template) => template.key));
      const templateKeys = (body.templateKeys || []).filter((key) => validKeys.has(key));
      const syncedTemplates = await syncWhatsAppTemplatesToTwilio(
        c.env,
        c.env.DB,
        templateKeys.length > 0 ? templateKeys : undefined,
      );

      return c.json({
        success: true,
        data: {
          synced: syncedTemplates,
          total: syncedTemplates.length,
        },
      });
    } catch (error) {
      return alertasErrorResponse(
        c,
        500,
        'Erro ao sincronizar templates de WhatsApp',
        'WHATSAPP_TEMPLATES_SYNC_ERROR',
        {
          details: error instanceof Error ? error.message : String(error),
        },
      );
    }
  },
);

app.post('/alertas/whatsapp/status-callback', async (c: Context<{ Bindings: Env }>) => {
  try {
    const form = await c.req.formData();
    const payload = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : '',
      ]),
    ) as Record<string, string>;
    const signature = c.req.header('X-Twilio-Signature');

    const signatureValid = await verifyTwilioWebhookSignature(
      c.env.TWILIO_AUTH_TOKEN || '',
      c.req.url,
      payload,
      signature,
    );

    if (!signatureValid) {
      return alertasErrorResponse(
        c,
        401,
        'Assinatura do callback Twilio invalida',
        'TWILIO_WEBHOOK_UNAUTHORIZED',
      );
    }

    const mappedStatus = mapTwilioMessageStatus(payload);
    if (!mappedStatus.sid) {
      return alertasErrorResponse(
        c,
        400,
        'Callback Twilio sem MessageSid',
        'TWILIO_WEBHOOK_INVALID_PAYLOAD',
      );
    }

    await upsertWhatsAppDeliveryLog(c.env.DB, {
      provider: 'twilio',
      providerMessageId: mappedStatus.sid,
      telefoneDestino: mappedStatus.to,
      telefoneOrigem: mappedStatus.from,
      status: mappedStatus.status || 'unknown',
      errorCode: mappedStatus.errorCode,
      errorMessage: mappedStatus.errorMessage,
      rawPayload: payload,
    });

    return c.json({
      success: true,
      data: {
        sid: mappedStatus.sid,
        status: mappedStatus.status,
      },
    });
  } catch (error) {
    return alertasErrorResponse(
      c,
      500,
      'Erro ao processar callback do Twilio',
      'TWILIO_WEBHOOK_ERROR',
      {
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
});

app.get('/alertas/whatsapp/delivery/:sid', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.whatsAppDelivery');
  try {
    const sid = String(c.req.param('sid') || '').trim();
    const empresaId = getEmpresaId(c as any);

    if (!sid) {
      return alertasErrorResponse(c, 400, 'SID invalido', 'TWILIO_STATUS_INVALID_SID');
    }

    await ensureWhatsAppDeliveryTable(c.env.DB);

    const localLog = await c.env.DB.prepare(
      `SELECT *
           FROM alertas_whatsapp_delivery
          WHERE provider_message_id = ?
            AND empresa_id = ?
          LIMIT 1`,
    )
      .bind(sid, empresaId)
      .first<Record<string, unknown>>();

    if (!localLog) {
      return alertasErrorResponse(
        c,
        404,
        'SID nao encontrado para sua empresa',
        'TWILIO_STATUS_NOT_FOUND',
      );
    }

    const twilioStatus = await fetchTwilioMessageStatus(c.env, sid);
    await upsertWhatsAppDeliveryLog(c.env.DB, {
      empresaId,
      qualificacaoHistoricoId: Number(localLog.qualificacao_historico_id || 0) || null,
      funcionarioId: Number(localLog.funcionario_id || 0) || null,
      provider: 'twilio',
      providerMessageId: sid,
      telefoneDestino: twilioStatus.to,
      telefoneOrigem: twilioStatus.from,
      status: twilioStatus.status || 'unknown',
      errorCode: twilioStatus.errorCode,
      errorMessage: twilioStatus.errorMessage,
      rawPayload: twilioStatus.raw,
    });

    return c.json({
      success: true,
      data: {
        sid,
        status: twilioStatus.status,
        errorCode: twilioStatus.errorCode,
        errorMessage: twilioStatus.errorMessage,
        to: twilioStatus.to,
        from: twilioStatus.from,
        diagnosis: getTwilioWhatsAppDiagnosis(
          twilioStatus.status,
          twilioStatus.errorCode,
          twilioStatus.errorMessage,
        ),
      },
    });
  } catch (error) {
    logger.error('Erro ao consultar status do WhatsApp', toError(error), {
      sid: c.req.param('sid'),
    });
    return alertasErrorResponse(
      c,
      500,
      'Erro ao consultar status do WhatsApp',
      'TWILIO_STATUS_ERROR',
      {
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
});

// ============================================================
// GET /api/alertas/vencimentos?dias=60
// ============================================================

app.get('/alertas/vencimentos', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.vencimentos');
  try {
    const empresaId = getEmpresaId(c as any);
    const diasConfigurados = await getQualificacoesAlertaDias(c.env.DB, empresaId);
    const diasStr = c.req.query('dias');
    const dias = diasStr ? normalizeQualificacoesAlertaDias(diasStr) : diasConfigurados;
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    console.log(`[Alertas] Buscando vencimentos para próximos ${dias} dias`);

    // 1. Qualificações a vencer
    const qualStmt = await c.env.DB.prepare(
      buildAlertasVencimentosQualificacoesQuery(vencimentoExpr),
    )
      .bind(empresaId, hojeSp, dias)
      .all();

    if (!qualStmt.success) {
      logger.error('[Alertas] Erro ao buscar qualificações', toError(qualStmt.error), { dias });
    }

    // 2. Licenças a vencer
    const licStmt = await c.env.DB.prepare(
      `SELECT
          l.id,
          l.funcionario_id,
          l.tipo,
          l.numero,
          l.data_emissao,
          l.data_vencimento,
          l.observacoes,
          p.nome,
          p.matricula,
          p.funcao,
          NULL as base
       FROM licencas l
       JOIN funcionarios p ON l.funcionario_id = p.id
      WHERE l.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.empresa_id = ?
        AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
          AND date(l.data_vencimento) <= date(?, '+' || ? || ' days')
      ORDER BY l.data_vencimento ASC`,
    )
      .bind(empresaId, hojeSp, dias)
      .all();

    if (!licStmt.success) {
      logger.error('[Alertas] Erro ao buscar licenças', toError(licStmt.error), { dias });
    }

    console.log(
      `[Alertas] Encontradas ${qualStmt.results?.length || 0} qualificações e ${
        licStmt.results?.length || 0
      } licenças a vencer`,
    );

    return c.json({
      success: true,
      data: {
        dias,
        qualificacoes: qualStmt.results || [],
        licencas: licStmt.results || [],
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar alertas de vencimento', toError(error));
    return alertasErrorResponse(
      c,
      500,
      'Erro ao buscar alertas de vencimento',
      'ALERTAS_VENCIMENTOS_ERROR',
      {
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
});

// ============================================================
// POST /api/alertas/ead-vencido/:id
// Envia alertas por email/WhatsApp para qualificação EAD vencida
// ============================================================

app.post('/alertas/ead-vencido/:id', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.eadVencido');
  try {
    const id = parseInt(c.req.param('id'), 10);
    const empresaId = getEmpresaId(c as any);

    console.log('[ALERTAS] Recebido ID:', id);

    if (isNaN(id)) {
      return alertasErrorResponse(c, 400, 'ID inválido', 'ALERTA_INVALID_ID');
    }

    // Ler body para pegar mensagem e opções de envio
    const body = await c.req.json().catch(() => ({}));
    const mensagemCustom = body.mensagem;
    const enviarEmailCanal = body.enviarEmail !== false; // default true
    const enviarWhatsApp = body.enviarWhatsApp !== false; // default true

    console.log('[ALERTAS] Opções:', { enviarEmailCanal, enviarWhatsApp });

    const db = c.env.DB;

    // Buscar qualificação com dados do funcionário (qualificacoes_historico)
    const query = `
      SELECT 
        qh.id,
        qh.funcionario_id,
        qh.qualificacao_id,
        qh.data_vencimento,
        qh.codigo as tipo_codigo,
        COALESCE(qh.categoria, qt.categoria) as categoria,
        qt.nome as tipo_nome,
        f.nome as funcionario_nome,
        f.email as funcionario_email,
        f.telefone as funcionario_telefone
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE qh.id = ?
        AND qh.deleted_at IS NULL
        AND f.empresa_id = ?
    `;

    const result = await db.prepare(query).bind(id, empresaId).first();

    console.log('[ALERTAS] Resultado query:', result ? 'encontrado' : 'não encontrado');
    console.log('[ALERTAS] Dados completos:', JSON.stringify(result, null, 2));

    if (!result) {
      return alertasErrorResponse(
        c,
        404,
        'Qualificação não encontrada no histórico',
        'ALERTA_QUALIFICACAO_NOT_FOUND',
      );
    }

    // Type-safe result
    const r = result as Record<string, string | null | number>;

    // Validações detalhadas
    const erros: string[] = [];

    if (!r.funcionario_nome) {
      erros.push('Funcionário não possui nome cadastrado');
    }

    if (!r.tipo_nome && !r.tipo_codigo) {
      erros.push('Qualificação não possui nome ou código cadastrado');
    }

    if (!r.data_vencimento) {
      erros.push('Qualificação não possui data de vencimento');
    }

    if (!r.categoria) {
      erros.push('Qualificação não possui categoria definida');
    }

    // Verificar canais de comunicação
    const temEmail = r.funcionario_email && (r.funcionario_email as string).trim() !== '';
    const temTelefone = r.funcionario_telefone && (r.funcionario_telefone as string).trim() !== '';

    if (enviarEmailCanal && !temEmail) {
      erros.push('Funcionário não possui e-mail cadastrado');
    }

    if (enviarWhatsApp && !temTelefone) {
      erros.push('Funcionário não possui telefone cadastrado');
    }

    if (!temEmail && !temTelefone) {
      erros.push('Funcionário não possui e-mail nem telefone cadastrado para envio');
    }

    if (erros.length > 0) {
      console.log('[ALERTAS] Erros de validação:', erros);
      return alertasErrorResponse(
        c,
        400,
        'Dados insuficientes para enviar alerta',
        'ALERTA_INVALID_CONTACT_DATA',
        {
          detalhes: erros,
        },
      );
    }

    // Verificar se é EAD ou CMA
    const categoria = (r.categoria as string)?.toUpperCase();
    const isEAD = categoria === 'EAD' || categoria === 'TREINAMENTO EAD';
    const isCMA = categoria === 'CMA' || categoria === 'EXAME';

    if (!isEAD && !isCMA) {
      return alertasErrorResponse(
        c,
        400,
        'Esta qualificação não é um treinamento EAD ou CMA',
        'ALERTA_INVALID_CATEGORY',
        {
          detalhes: [`Categoria atual: ${categoria}`],
        },
      );
    }

    // Verificar se está vencida ou vencendo
    const dataVencimento = new Date(r.data_vencimento as string);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataVencimento.setHours(0, 0, 0, 0);

    const diasDiferenca = Math.floor(
      (dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
    );

    let statusVencimento = '';
    if (diasDiferenca < 0) {
      statusVencimento = `Vencida há ${Math.abs(diasDiferenca)} dias`;
    } else if (diasDiferenca <= 30) {
      statusVencimento = `Vence em ${diasDiferenca} dias`;
    } else {
      return alertasErrorResponse(
        c,
        400,
        'Esta qualificação ainda não está próxima do vencimento',
        'ALERTA_TOO_EARLY',
        {
          detalhes: [
            `Vence em ${diasDiferenca} dias. Alertas são enviados apenas 30 dias antes do vencimento.`,
          ],
        },
      );
    }

    // Usar mensagem customizada ou padrão
    const tipoAlerta = isCMA ? 'CMA' : 'EAD';
    const mensagem =
      mensagemCustom ||
      `
🔔 *ALERTA - Treinamento ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}*

Funcionário: ${r.funcionario_nome}
Qualificação: ${r.tipo_nome || r.tipo_codigo}
Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}
${statusVencimento}

Por favor, providencie a renovação o quanto antes.
    `.trim();

    const alertas: Array<{
      tipo: 'email' | 'whatsapp';
      destino: string;
      status: 'enviado' | 'erro';
      mensagem?: string;
      erro?: string;
      provider?: string;
      providerStatus?: string;
      providerMessageId?: string;
      deliveryStatusPath?: string;
      manualFallbackUrl?: string;
      templateKey?: string;
      templateName?: string;
      templateApprovalStatus?: string | null;
      messageMode?: 'free-form' | 'template';
    }> = [];

    // Enviar email (se tiver e se opção marcada)
    if (enviarEmailCanal && temEmail) {
      try {
        const assunto = `🔔 ALERTA - ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}`;
        const corpoHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h2 style="color: #f59e0b; margin-top: 0;">🔔 ALERTA - ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}</h2>
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Funcionário:</strong> ${r.funcionario_nome}</p>
                <p style="margin: 5px 0;"><strong>Qualificação:</strong> ${r.tipo_nome || r.tipo_codigo}</p>
                <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${dataVencimento.toLocaleDateString('pt-BR')}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> ${statusVencimento}</p>
              </div>
              <p style="color: #dc2626; font-weight: bold;">Por favor, providencie a renovação o quanto antes.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Esta é uma notificação automática. Por favor, não responda este email.
              </p>
            </div>
          </div>
        `;

        const emailResult = await enviarEmail(
          c.env,
          [r.funcionario_email as string],
          assunto,
          mensagem,
          corpoHtml,
        );

        alertas.push({
          tipo: 'email',
          destino: r.funcionario_email as string,
          status: 'enviado',
          mensagem: `Email enviado para ${r.funcionario_nome}`,
          provider: emailResult.provider,
          providerStatus: 'accepted',
          providerMessageId: emailResult.messageId || undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alertas.push({
          tipo: 'email',
          destino: r.funcionario_email as string,
          status: 'erro',
          erro:
            msg === 'EMAIL_NOT_CONFIGURED'
              ? 'Envio de email não configurado (BREVO_API_KEY ausente)'
              : msg,
        });
      }
    }

    // Enviar WhatsApp (se tiver telefone e se opção marcada)
    if (enviarWhatsApp && temTelefone) {
      try {
        const statusCallbackUrl = new URL(TWILIO_STATUS_CALLBACK_PATH, c.req.url).toString();
        const templateKey = resolveQualificacaoAlertTemplateKey({
          isCma: isCMA,
          expired: diasDiferenca < 0,
        });
        const localTemplate = await getLocalWhatsAppTemplateRecord(db, templateKey);
        const templateDefinition = getAlertWhatsAppTemplateDefinition(templateKey);
        const templateVariables = buildQualificacaoTemplateVariables({
          funcionarioNome: String(r.funcionario_nome || '').trim(),
          qualificacaoNome: String(r.tipo_nome || r.tipo_codigo || '').trim(),
          dataVencimento: formatDatePtBr(String(r.data_vencimento || '')),
          statusVencimento,
        });
        const templateMessage =
          templateDefinition && localTemplate?.twilio_content_sid
            ? renderTemplateBody(templateDefinition.bodyText, templateVariables)
            : null;
        const whatsappResult = await sendWhatsAppMessage(
          c.env,
          r.funcionario_telefone as string,
          mensagem,
          statusCallbackUrl,
          localTemplate?.twilio_content_sid && templateDefinition
            ? {
                contentSid: localTemplate.twilio_content_sid,
                contentVariables: templateVariables,
                templateKey,
                templateName: localTemplate.template_name,
                approvalStatus: localTemplate.approval_status,
              }
            : undefined,
        );

        if (whatsappResult.provider === 'twilio' && whatsappResult.providerMessageId) {
          await upsertWhatsAppDeliveryLog(db, {
            empresaId,
            qualificacaoHistoricoId: Number(r.id),
            funcionarioId: Number(r.funcionario_id),
            provider: whatsappResult.provider,
            providerMessageId: whatsappResult.providerMessageId,
            telefoneDestino: whatsappResult.destination,
            telefoneOrigem: whatsappResult.source,
            status: whatsappResult.providerStatus || 'accepted',
            rawPayload: {
              callbackUrl: statusCallbackUrl,
              qualificacaoHistoricoId: r.id,
              templateKey: whatsappResult.templateKey || null,
              templateName: whatsappResult.templateName || null,
            },
          });
        }

        alertas.push({
          tipo: 'whatsapp',
          destino: whatsappResult.destination,
          status: 'enviado',
          mensagem:
            whatsappResult.provider === 'twilio' && whatsappResult.messageMode === 'template'
              ? `WhatsApp via template aprovado aceito pelo Twilio para ${r.funcionario_nome} (status: ${whatsappResult.providerStatus || 'accepted'})`
              : whatsappResult.provider === 'twilio'
                ? `WhatsApp aceito pelo Twilio para ${r.funcionario_nome} (status: ${whatsappResult.providerStatus || 'accepted'})`
                : `WhatsApp aceito pelo provedor para ${r.funcionario_nome}`,
          provider: whatsappResult.provider,
          providerStatus: whatsappResult.providerStatus,
          providerMessageId: whatsappResult.providerMessageId,
          deliveryStatusPath: whatsappResult.providerMessageId
            ? `/alertas/whatsapp/delivery/${whatsappResult.providerMessageId}`
            : undefined,
          manualFallbackUrl: buildWhatsAppManualLink(
            r.funcionario_telefone as string,
            templateMessage || mensagem,
          ),
          templateKey: whatsappResult.templateKey,
          templateName: whatsappResult.templateName,
          templateApprovalStatus: whatsappResult.templateApprovalStatus,
          messageMode: whatsappResult.messageMode,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alertas.push({
          tipo: 'whatsapp',
          destino: r.funcionario_telefone as string,
          status: 'erro',
          erro:
            msg === 'WHATSAPP_NOT_CONFIGURED'
              ? 'Envio de WhatsApp não configurado (WHATSAPP_API_URL/WHATSAPP_API_TOKEN ausentes)'
              : msg,
        });
      }
    }

    const hasSuccess = alertas.some((a) => a.status === 'enviado');

    if (!hasSuccess) {
      const errosEnvio = alertas
        .filter((a) => a.status === 'erro')
        .map((a) => `${a.tipo.toUpperCase()}: ${a.erro || 'Erro desconhecido'}`);
      return alertasErrorResponse(
        c,
        400,
        'Nenhum canal de envio foi realizado',
        'ALERTA_NO_CHANNEL_SENT',
        {
          detalhes: [
            !enviarEmailCanal ? 'E-mail não selecionado' : !temEmail ? 'E-mail não cadastrado' : '',
            !enviarWhatsApp
              ? 'WhatsApp não selecionado'
              : !temTelefone
                ? 'Telefone não cadastrado'
                : '',
            ...errosEnvio,
          ].filter(Boolean),
        },
      );
    }

    console.log('[ALERTAS] Alerta enviado com sucesso:', alertas.length, 'canais');

    return c.json({
      success: true,
      data: {
        mensagem,
        alertas,
        funcionario: r.funcionario_nome,
        qualificacao: r.tipo_nome || r.tipo_codigo,
        statusVencimento,
      },
    });
  } catch (error) {
    logger.error('[ALERTAS] Erro ao enviar alerta EAD', toError(error));
    const errorMessage = error instanceof Error ? error.message : String(error);
    return alertasErrorResponse(c, 500, 'Erro ao processar alerta', 'ALERTA_PROCESS_ERROR', {
      detalhes: [errorMessage],
    });
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/assets.ts
~~~typescript
import { Hono } from 'hono';
import type { Env } from '../types';

export const assetsRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/assets/*
 * Serve arquivos públicos do R2 com suporte a subpastas.
 * Ex: /api/assets/empresas/6/logo.png -> R2 key: empresas/6/logo.png
 */
assetsRouter.get('/*', async (c) => {
  const wildcardKey = c.req.param('*');
  const pathname = new URL(c.req.url).pathname;
  const prefix = '/api/assets/';
  const key = wildcardKey || (pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '');

  if (!key) {
    return c.json({ success: false, error: 'Caminho do asset não informado' }, 400);
  }

  if (!c.env.BUCKET) {
    return c.json({ success: false, error: 'Storage não configurado' }, 500);
  }

  try {
    const object = await c.env.BUCKET.get(key);

    if (!object) {
      return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
    }

    // Determinar Content-Type
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Cache control para assets (1 dia)
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(object.body, {
      headers,
    });
  } catch (error: any) {
    console.error(`Erro ao servir asset ${key}:`, error);
    return c.json({ success: false, error: 'Erro interno ao recuperar arquivo' }, 500);
  }
});

~~~

---
## FILE: worker-airtrust/src/routes/assistente.ts
~~~typescript
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import {
  getAtividadesRecentes,
  getComplianceScore,
  getDashboardAlerts,
  getDashboardMetrics,
} from '../services/dashboardService';

const app = new Hono<{ Bindings: Env }>();

type PapelFicha = 'ALUNO' | 'INSTRUTOR';

interface FichaPendenteResumo {
  id: number;
  papel: PapelFicha;
  data_sessao: string | null;
  hora_inicio: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface FichaConcluidaResumo {
  id: number;
  resultado_final: string | null;
  data_sessao: string | null;
  participante_nome: string;
  instrutor_nome: string;
  link: string;
}

interface HomeAssistantContext {
  funcionarioNome?: string;
  role: string;
  dashboard: {
    tripulantesAtivos: number;
    qualificacoesAVencer: number;
    qualificacoesVencidas: number;
    demandaFutura30Dias: number;
  };
  compliance: {
    scoreGeral: number;
    metaOrganizacional: number;
    qualificacoesValidas: number;
    totalQualificacoes: number;
  };
  alertasCriticos: Array<{
    criticidade: string;
    mensagem: string;
    urlAcao: string;
  }>;
  atividadesRecentes: Array<{
    tipo: string;
    descricao: string;
    tripulanteNome?: string;
    timestamp: string;
  }>;
  fichas: {
    pendentesAluno: number;
    pendentesInstrutor: number;
    pendentes: FichaPendenteResumo[];
    concluidasRecentes: FichaConcluidaResumo[];
  };
  consultaQualificacoes?: {
    alvoId: number;
    alvoNome: string;
    filtro: string | null;
    resultados: Array<{
      funcionarioId: number;
      funcionarioNome: string;
      qualificacaoCodigo: string | null;
      qualificacaoNome: string | null;
      dataConclusao: string | null;
      dataVencimento: string | null;
      status: string | null;
      diasParaVencer: number | null;
    }>;
  } | null;
}

function buildPromptContext(context: HomeAssistantContext) {
  return {
    funcionarioNome: context.funcionarioNome,
    role: context.role,
    dashboard: context.dashboard,
    compliance: context.compliance,
    alertasCriticos: context.alertasCriticos.map((alerta) => ({
      criticidade: alerta.criticidade,
      mensagem: alerta.mensagem,
      urlAcao: alerta.urlAcao,
    })),
    atividadesRecentes: context.atividadesRecentes.map((atividade) => ({
      tipo: atividade.tipo,
      descricao: atividade.descricao,
      tripulanteNome: atividade.tripulanteNome,
      timestamp: atividade.timestamp,
    })),
    fichas: {
      pendentesAluno: context.fichas.pendentesAluno,
      pendentesInstrutor: context.fichas.pendentesInstrutor,
      pendentes: context.fichas.pendentes.map((item) => ({
        papel: item.papel,
        data_sessao: item.data_sessao,
        hora_inicio: item.hora_inicio,
        participante_nome: item.participante_nome,
        instrutor_nome: item.instrutor_nome,
      })),
      concluidasRecentes: context.fichas.concluidasRecentes.map((item) => ({
        resultado_final: item.resultado_final,
        data_sessao: item.data_sessao,
        participante_nome: item.participante_nome,
        instrutor_nome: item.instrutor_nome,
      })),
    },
    consultaQualificacoes: context.consultaQualificacoes,
  };
}

const STOPWORDS_FUNCIONARIO = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'minha',
  'minhas',
  'meu',
  'meus',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'para',
  'por',
  'qual',
  'quais',
  'ultimo',
  'ultima',
  'ultimas',
  'ultimos',
  'venc',
  'vencimento',
  'vence',
  'crm',
  'cma',
  'certificado',
  'certificados',
  'qualificacao',
  'qualificacoes',
]);

function normalizarRole(role: string): string {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'ALUNO' || normalized === 'USUARIO') return 'ALUNO';
  if (normalized === 'INSTRUTOR') return 'INSTRUTOR';
  return normalized || 'USUARIO';
}

async function getFuncionarioContext(
  db: D1Database,
  userId: string,
  empresaId: string,
): Promise<{ funcionarioId: string; nome: string } | null> {
  const row = await db
    .prepare(
      `SELECT f.id as funcionario_id, f.nome
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
       WHERE u.id = ?
         AND f.empresa_id = ?
         AND u.deleted_at IS NULL
         AND f.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(userId, empresaId)
    .first<{ funcionario_id: number; nome: string }>();

  if (!row) return null;
  return { funcionarioId: String(row.funcionario_id), nome: row.nome };
}

async function carregarResumoFichas(
  db: D1Database,
  empresaId: string,
  funcionarioId: string,
): Promise<HomeAssistantContext['fichas']> {
  const pendentesResult = await db
    .prepare(
      `SELECT
         f.id,
         COALESCE(sa.data, f.data_sessao) as data_sessao,
         COALESCE(sa.hora_inicio, '') as hora_inicio,
         COALESCE(aluno.nome, 'Aluno') as participante_nome,
         COALESCE(instrutor.nome, 'Instrutor') as instrutor_nome,
         CASE
           WHEN f.colaborador_id_aluno = ?
             AND f.assinatura_aluno_timestamp IS NULL
             AND f.assinatura_instrutor_timestamp IS NULL
           THEN 'ALUNO'
           WHEN f.instrutor_id = ?
             AND f.assinatura_aluno_timestamp IS NOT NULL
             AND f.assinatura_instrutor_timestamp IS NULL
           THEN 'INSTRUTOR'
           ELSE NULL
         END as papel
       FROM fichas_sessao f
       LEFT JOIN simulador_agendamentos sa ON sa.id = f.agendamento_slot_id
       LEFT JOIN funcionarios aluno ON aluno.id = f.colaborador_id_aluno
       LEFT JOIN funcionarios instrutor ON instrutor.id = f.instrutor_id
       WHERE f.deleted_at IS NULL
         AND aluno.empresa_id = ?
         AND (
           (f.colaborador_id_aluno = ?
             AND f.assinatura_aluno_timestamp IS NULL
             AND f.assinatura_instrutor_timestamp IS NULL)
           OR
           (f.instrutor_id = ?
             AND f.assinatura_aluno_timestamp IS NOT NULL
             AND f.assinatura_instrutor_timestamp IS NULL)
         )
       ORDER BY COALESCE(sa.data, f.data_sessao) ASC, COALESCE(sa.hora_inicio, '23:59') ASC
       LIMIT 5`,
    )
    .bind(funcionarioId, funcionarioId, empresaId, funcionarioId, funcionarioId)
    .all<{
      id: number;
      data_sessao: string | null;
      hora_inicio: string | null;
      participante_nome: string;
      instrutor_nome: string;
      papel: PapelFicha | null;
    }>();

  const concluidasResult = await db
    .prepare(
      `SELECT
         f.id,
         f.resultado_final,
         COALESCE(sa.data, f.data_sessao) as data_sessao,
         COALESCE(aluno.nome, 'Aluno') as participante_nome,
         COALESCE(instrutor.nome, 'Instrutor') as instrutor_nome
       FROM fichas_sessao f
       LEFT JOIN simulador_agendamentos sa ON sa.id = f.agendamento_slot_id
       LEFT JOIN funcionarios aluno ON aluno.id = f.colaborador_id_aluno
       LEFT JOIN funcionarios instrutor ON instrutor.id = f.instrutor_id
       WHERE f.deleted_at IS NULL
         AND aluno.empresa_id = ?
         AND (f.colaborador_id_aluno = ? OR f.instrutor_id = ?)
         AND f.assinatura_instrutor_timestamp IS NOT NULL
       ORDER BY COALESCE(f.updated_at, f.created_at) DESC
       LIMIT 3`,
    )
    .bind(empresaId, funcionarioId, funcionarioId)
    .all<{
      id: number;
      resultado_final: string | null;
      data_sessao: string | null;
      participante_nome: string;
      instrutor_nome: string;
    }>();

  const pendentes = (pendentesResult.results || [])
    .filter((item) => item.papel)
    .map((item) => ({
      id: item.id,
      papel: item.papel as PapelFicha,
      data_sessao: item.data_sessao,
      hora_inicio: item.hora_inicio,
      participante_nome: item.participante_nome,
      instrutor_nome: item.instrutor_nome,
      link: `/simuladores/fichas/${item.id}?mode=sign&papel=${item.papel === 'INSTRUTOR' ? 'INSTRUTOR' : 'TRIPULANTE'}`,
    }));

  const concluidasRecentes = (concluidasResult.results || []).map((item) => ({
    id: item.id,
    resultado_final: item.resultado_final,
    data_sessao: item.data_sessao,
    participante_nome: item.participante_nome,
    instrutor_nome: item.instrutor_nome,
    link: `/simuladores/fichas/${item.id}`,
  }));

  return {
    pendentesAluno: pendentes.filter((item) => item.papel === 'ALUNO').length,
    pendentesInstrutor: pendentes.filter((item) => item.papel === 'INSTRUTOR').length,
    pendentes,
    concluidasRecentes,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function shouldConsultarQualificacoes(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return [
    'qualific',
    'venc',
    'vence',
    'vencimento',
    'crm',
    'cma',
    'certificado',
    'licenca',
    'licenca',
  ].some((keyword) => normalized.includes(keyword));
}

function detectarFiltroQualificacao(message: string): string | null {
  const normalized = normalizeSearchText(message);
  if (normalized.includes('crm')) return 'crm';
  if (normalized.includes('cma')) return 'cma';

  const sigla = normalized.match(/\b(pp|pla|ifr|mlte|cht)\b/i);
  return sigla ? sigla[1].toLowerCase() : null;
}

async function resolverFuncionarioConsulta(
  db: D1Database,
  empresaId: string,
  message: string,
  funcionarioAtual?: { funcionarioId: string; nome: string } | null,
): Promise<{ id: number; nome: string } | null> {
  const normalized = normalizeSearchText(message);

  if (funcionarioAtual && /\b(meu|minha|meus|minhas|eu)\b/.test(normalized)) {
    return { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome };
  }

  const fullNameMatch = await db
    .prepare(
      `SELECT id, nome
       FROM funcionarios
       WHERE empresa_id = ?
         AND deleted_at IS NULL
         AND instr(LOWER(?), LOWER(nome)) > 0
       ORDER BY LENGTH(nome) DESC
       LIMIT 1`,
    )
    .bind(empresaId, message)
    .first<{ id: number; nome: string }>();

  if (fullNameMatch) {
    return fullNameMatch;
  }

  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS_FUNCIONARIO.has(token));

  if (tokens.length === 0) {
    return funcionarioAtual
      ? { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome }
      : null;
  }

  const scoreExpr = tokens.map(() => `CASE WHEN LOWER(nome) LIKE ? THEN 1 ELSE 0 END`).join(' + ');
  const candidate = await db
    .prepare(
      `SELECT id, nome, ${scoreExpr} as score
       FROM funcionarios
       WHERE empresa_id = ?
         AND deleted_at IS NULL
       ORDER BY score DESC, LENGTH(nome) ASC
       LIMIT 1`,
    )
    .bind(...tokens.map((token) => `%${token}%`), empresaId)
    .first<{ id: number; nome: string; score: number }>();

  const minScore = tokens.length > 1 ? 2 : 1;
  if (candidate && candidate.score >= minScore) {
    return { id: candidate.id, nome: candidate.nome };
  }

  return funcionarioAtual
    ? { id: Number(funcionarioAtual.funcionarioId), nome: funcionarioAtual.nome }
    : null;
}

async function consultarQualificacoesRelacionadas(
  db: D1Database,
  empresaId: string,
  message: string,
  funcionarioAtual?: { funcionarioId: string; nome: string } | null,
): Promise<HomeAssistantContext['consultaQualificacoes']> {
  if (!shouldConsultarQualificacoes(message)) {
    return null;
  }

  const alvo = await resolverFuncionarioConsulta(db, empresaId, message, funcionarioAtual);
  if (!alvo) {
    return null;
  }

  const filtro = detectarFiltroQualificacao(message);
  const filtrosSql = filtro
    ? `
      AND (
        LOWER(COALESCE(qt.nome, '')) LIKE ?
        OR LOWER(COALESCE(qh.qualificacao_codigo, '')) LIKE ?
        OR LOWER(COALESCE(qh.tipo, '')) LIKE ?
        OR LOWER(COALESCE(qh.codigo, '')) LIKE ?
      )`
    : '';
  const filtroArgs = filtro ? Array.from({ length: 4 }, () => `%${filtro}%`) : [];

  const resultado = await db
    .prepare(
      `SELECT
         f.nome as funcionario_nome,
         qh.qualificacao_codigo,
         COALESCE(qt.nome, qh.tipo, qh.qualificacao_codigo, qh.codigo) as qualificacao_nome,
         qh.data_conclusao,
         qh.data_vencimento,
         qh.status
       FROM qualificacoes_historico qh
       INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND qh.deleted_at IS NULL
         AND qh.funcionario_id = ?
         ${filtrosSql}
       ORDER BY COALESCE(qh.data_vencimento, '9999-12-31') DESC,
                COALESCE(qh.data_conclusao, '0001-01-01') DESC,
                qh.id DESC
       LIMIT 5`,
    )
    .bind(empresaId, alvo.id, ...filtroArgs)
    .all<{
      funcionario_nome: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      data_conclusao: string | null;
      data_vencimento: string | null;
      status: string | null;
    }>();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return {
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    filtro,
    resultados: (resultado.results || []).map((item) => {
      const dataVencimento = item.data_vencimento ? new Date(item.data_vencimento) : null;
      const diasParaVencer = dataVencimento
        ? Math.round((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        funcionarioId: alvo.id,
        funcionarioNome: item.funcionario_nome,
        qualificacaoCodigo: item.qualificacao_codigo,
        qualificacaoNome: item.qualificacao_nome,
        dataConclusao: item.data_conclusao,
        dataVencimento: item.data_vencimento,
        status: item.status,
        diasParaVencer,
      };
    }),
  };
}

function formatarDataPtBr(data: string | null | undefined): string {
  if (!data) return 'sem data informada';
  const parsed = new Date(data);
  if (Number.isNaN(parsed.getTime())) return data;
  return parsed.toLocaleDateString('pt-BR');
}

function descreverValidade(
  item: NonNullable<HomeAssistantContext['consultaQualificacoes']>['resultados'][number],
): string {
  if (!item.dataVencimento) {
    return 'não possui vencimento informado';
  }

  if (item.diasParaVencer === null) {
    return `vence em ${formatarDataPtBr(item.dataVencimento)}`;
  }

  if (item.diasParaVencer < 0) {
    return `venceu em ${formatarDataPtBr(item.dataVencimento)} (${Math.abs(item.diasParaVencer)} dias atrás)`;
  }

  if (item.diasParaVencer === 0) {
    return `vence hoje (${formatarDataPtBr(item.dataVencimento)})`;
  }

  return `vence em ${formatarDataPtBr(item.dataVencimento)} (${item.diasParaVencer} dias)`;
}

function buildFallbackAnswer(message: string, context: HomeAssistantContext): string {
  const normalized = message.toLowerCase();
  const totalPendentes = context.fichas.pendentesAluno + context.fichas.pendentesInstrutor;

  if (context.consultaQualificacoes) {
    const { alvoNome, filtro, resultados } = context.consultaQualificacoes;
    if (resultados.length === 0) {
      return filtro
        ? `Não encontrei registros de ${filtro.toUpperCase()} para ${alvoNome} na base atual da empresa.`
        : `Não encontrei qualificações registradas para ${alvoNome} na base atual da empresa.`;
    }

    const ultima = resultados[0];
    const descricaoTipo =
      ultima.qualificacaoNome ||
      ultima.qualificacaoCodigo ||
      filtro?.toUpperCase() ||
      'qualificação';
    const conclusao = ultima.dataConclusao
      ? ` A conclusão mais recente foi em ${formatarDataPtBr(ultima.dataConclusao)}.`
      : '';
    const status = ultima.status ? ` Status atual: ${ultima.status}.` : '';

    if (
      normalized.includes('ultimo') ||
      normalized.includes('último') ||
      normalized.includes('venc') ||
      normalized.includes('crm') ||
      normalized.includes('cma')
    ) {
      return `O último registro de ${descricaoTipo} para ${alvoNome} ${descreverValidade(ultima)}.${conclusao}${status}`;
    }

    const resumo = resultados
      .slice(0, 3)
      .map(
        (item) =>
          `${item.qualificacaoNome || item.qualificacaoCodigo || 'Qualificação'}: ${descreverValidade(item)}`,
      )
      .join('; ');

    return `Resumo de qualificações para ${alvoNome}: ${resumo}.`;
  }

  if (
    normalized.includes('compliance') ||
    normalized.includes('conformidade') ||
    normalized.includes('qualifica')
  ) {
    const percentualValido =
      context.compliance.totalQualificacoes > 0
        ? Math.round(
            (context.compliance.qualificacoesValidas / context.compliance.totalQualificacoes) * 100,
          )
        : 100;

    return `A conformidade geral está em ${context.compliance.scoreGeral}%, com meta de ${context.compliance.metaOrganizacional}%. Hoje existem ${context.dashboard.qualificacoesVencidas} qualificações vencidas, ${context.dashboard.qualificacoesAVencer} a vencer e ${percentualValido}% do estoque atual está válido.`;
  }

  if (
    normalized.includes('alerta') ||
    normalized.includes('urgente') ||
    normalized.includes('critico')
  ) {
    if (context.alertasCriticos.length === 0) {
      return 'Não encontrei alertas críticos abertos no momento.';
    }

    const topAlertas = context.alertasCriticos
      .slice(0, 3)
      .map((alerta) => `${alerta.criticidade}: ${alerta.mensagem}`)
      .join('; ');

    return `Há ${context.alertasCriticos.length} alerta(s) crítico(s) ou prioritário(s) no painel. Principais itens: ${topAlertas}.`;
  }

  if (
    normalized.includes('atividade') ||
    normalized.includes('recent') ||
    normalized.includes('ultimas') ||
    normalized.includes('últimas')
  ) {
    if (context.atividadesRecentes.length === 0) {
      return 'Não encontrei atividades recentes relevantes para mostrar agora.';
    }

    const recentes = context.atividadesRecentes
      .slice(0, 3)
      .map((atividade) => atividade.descricao)
      .join('; ');

    return `Atividades recentes: ${recentes}.`;
  }

  if (
    normalized.includes('pend') ||
    normalized.includes('assinar') ||
    normalized.includes('assinatura') ||
    normalized.includes('ficha')
  ) {
    if (totalPendentes === 0) {
      return 'Não há fichas pendentes de assinatura no momento para o seu contexto atual.';
    }

    const detalhes = context.fichas.pendentes
      .map((item) => {
        const prefixo = item.papel === 'INSTRUTOR' ? 'Como instrutor' : 'Como aluno';
        const data = item.data_sessao ? ` em ${item.data_sessao}` : '';
        return `${prefixo}, a ficha #${item.id}${data} está aguardando sua ação.`;
      })
      .join(' ');

    return `Você tem ${totalPendentes} ficha(s) pendente(s). ${detalhes}`;
  }

  if (
    normalized.includes('conclu') ||
    normalized.includes('resultado') ||
    normalized.includes('aprov')
  ) {
    if (context.fichas.concluidasRecentes.length === 0) {
      return 'Não encontrei fichas concluídas recentes para você.';
    }

    const recentes = context.fichas.concluidasRecentes
      .map((item) => `Ficha #${item.id} com resultado ${item.resultado_final || 'PENDENTE'}`)
      .join('; ');

    return `As fichas concluídas mais recentes são: ${recentes}.`;
  }

  if (
    normalized.includes('treinamento') ||
    normalized.includes('demanda') ||
    normalized.includes('agenda')
  ) {
    return `A demanda operacional mostra ${context.dashboard.demandaFutura30Dias} sessão(ões) previstas para os próximos 30 dias. Posso detalhar risco, fichas pendentes ou pressão de qualificações.`;
  }

  return `Resumo operacional: conformidade em ${context.compliance.scoreGeral}%, ${context.dashboard.qualificacoesVencidas} qualificações vencidas, ${context.dashboard.qualificacoesAVencer} a vencer, ${context.dashboard.demandaFutura30Dias} sessões nos próximos 30 dias e ${totalPendentes} ficha(s) pendente(s) para assinatura.`;
}

async function gerarRespostaAssistente(
  env: Env,
  message: string,
  context: HomeAssistantContext,
): Promise<{ text: string; provider: string; model: string }> {
  const fallbackText = buildFallbackAnswer(message, context);
  const promptContext = buildPromptContext(context);

  if (!env.AI) {
    return {
      text: fallbackText,
      provider: 'rule-engine',
      model: 'operational-home-v2',
    };
  }

  try {
    const systemPrompt =
      'Você é o Assistente AirTrust da tela inicial. Responda em português do Brasil, com objetividade, usando SOMENTE os dados fornecidos. ' +
      'Nunca invente informações, nunca mencione outras empresas, nunca exponha dados fora do contexto do usuário autenticado. ' +
      'Você pode responder sobre operação, compliance, qualificações, alertas, atividades recentes, fichas e consultas de vencimento de qualificação por colaborador quando esses dados estiverem presentes. Se não houver dado, diga isso claramente.';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Pergunta do usuário: ${message}\n\nContexto disponível:\n${JSON.stringify(promptContext)}`,
        },
      ],
      max_tokens: 220,
    })) as { response?: string };

    if (result?.response?.trim()) {
      return {
        text: result.response.trim(),
        provider: 'cloudflare-workers-ai',
        model: '@cf/meta/llama-3.1-8b-instruct',
      };
    }
  } catch {
    // fallback abaixo
  }

  return {
    text: fallbackText,
    provider: 'rule-engine',
    model: 'operational-home-v1',
  };
}

app.post('/home-perfil/chat', async (c) => {
  const schema = z.object({
    message: z.string().trim().min(2).max(400),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Mensagem inválida', code: 'INVALID_ASSISTANT_INPUT' },
      400,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = String((c as any).get('userId') || '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empresaId = String((c as any).get('empresaId') || '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = String((c as any).get('userRole') || '');

  const roleNormalizado = normalizarRole(userRole);
  const funcionario = await getFuncionarioContext(c.env.DB, userId, empresaId);
  const [metrics, compliance, alertas, atividades, resumoFichas, consultaQualificacoes] =
    await Promise.all([
      getDashboardMetrics(c.env.DB, Number(empresaId)),
      getComplianceScore(c.env.DB, Number(empresaId)),
      getDashboardAlerts(c.env.DB, Number(empresaId)),
      getAtividadesRecentes(c.env.DB, Number(empresaId)),
      funcionario
        ? carregarResumoFichas(c.env.DB, empresaId, funcionario.funcionarioId)
        : Promise.resolve({
            pendentesAluno: 0,
            pendentesInstrutor: 0,
            pendentes: [],
            concluidasRecentes: [],
          }),
      consultarQualificacoesRelacionadas(c.env.DB, empresaId, parsed.data.message, funcionario),
    ]);

  const context: HomeAssistantContext = {
    funcionarioNome: funcionario?.nome,
    role: roleNormalizado,
    dashboard: {
      tripulantesAtivos: metrics.tripulantesAtivos,
      qualificacoesAVencer: metrics.qualificacoesAVencer,
      qualificacoesVencidas: metrics.qualificacoesVencidas,
      demandaFutura30Dias: metrics.demandaFutura30Dias,
    },
    compliance: {
      scoreGeral: compliance.scoreGeral,
      metaOrganizacional: compliance.metaOrganizacional,
      qualificacoesValidas: compliance.qualificacoesValidas ?? 0,
      totalQualificacoes: compliance.totalQualificacoes ?? 0,
    },
    alertasCriticos: alertas.slice(0, 5).map((alerta) => ({
      criticidade: alerta.criticidade,
      mensagem: alerta.mensagem,
      urlAcao: alerta.urlAcao,
    })),
    atividadesRecentes: atividades.slice(0, 5).map((atividade) => ({
      tipo: atividade.tipo,
      descricao: atividade.descricao,
      tripulanteNome: atividade.tripulanteNome,
      timestamp: atividade.timestamp,
    })),
    fichas: resumoFichas,
    consultaQualificacoes,
  };

  const answer = await gerarRespostaAssistente(c.env, parsed.data.message, context);

  return c.json({
    success: true,
    data: {
      message: answer.text,
      provider: answer.provider,
      model: answer.model,
      suggestions: [
        'Qual é o resumo operacional de hoje?',
        'Há alertas críticos ou qualificações vencidas?',
        'O que está pendente nas minhas fichas?',
        'Qual foi o vencimento do último CRM de um colaborador?',
      ],
      context: {
        role: context.role,
        tripulantesAtivos: context.dashboard.tripulantesAtivos,
        qualificacoesAVencer: context.dashboard.qualificacoesAVencer,
        qualificacoesVencidas: context.dashboard.qualificacoesVencidas,
        demandaFutura30Dias: context.dashboard.demandaFutura30Dias,
        pendentesAluno: context.fichas.pendentesAluno,
        pendentesInstrutor: context.fichas.pendentesInstrutor,
        alertasCriticos: context.alertasCriticos.length,
        atividadesRecentes: context.atividadesRecentes.length,
        consultaQualificacoes: context.consultaQualificacoes?.resultados.length || 0,
      },
      alertas: alertas.slice(0, 4).map((alerta) => ({
        criticidade: alerta.criticidade,
        mensagem: alerta.mensagem,
        tripulanteNome: alerta.tripulanteNome,
        qualificacaoNome: alerta.qualificacaoNome,
        diasRestantes: alerta.diasRestantes,
        dataVencimento: alerta.dataVencimento,
        urlAcao: alerta.urlAcao,
      })),
      atividades: atividades.slice(0, 4).map((atividade) => ({
        tipo: atividade.tipo,
        descricao: atividade.descricao,
        tripulanteNome: atividade.tripulanteNome,
        timestamp: atividade.timestamp,
      })),
      fichasPendentes: context.fichas.pendentes.slice(0, 4),
      fichasRecentes: context.fichas.concluidasRecentes.slice(0, 3),
      consultaQualificacoes: context.consultaQualificacoes,
    },
  });
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/auditoria-detalhada.ts
~~~typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

/**
 * GET /api/qualificacoes-historico/auditoria-detalhada
 * Retorna detalhes completos das discrepâncias com nomes de funcionários e qualificações
 */
app.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const schemaInfo = await db.prepare("PRAGMA table_info('qualificacoes_historico')").all();
    const schemaColumns = new Set(
      (schemaInfo.results || []).map((row) => String((row as { name?: string }).name || '')),
    );
    const hasRenovacaoDe = schemaColumns.has('renovacao_de');
    const hasRenovada = schemaColumns.has('renovada');
    const vinculoExpr = hasRenovacaoDe
      ? 'qh.renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(qh.renovada, 0) = 1'
        : '0 = 1';

    // 1. DUPLICATAS - Com nomes completos
    const duplicatasQuery = `
      WITH duplicatas_grouped AS (
        SELECT 
          f.cpf,
          f.nome as funcionario_nome,
          q.codigo,
          q.nome as qualificacao_nome,
          qh.data_vencimento,
          COUNT(*) as total
        FROM qualificacoes_historico qh
        JOIN funcionarios f ON f.id = qh.funcionario_id
        JOIN qualificacoes q ON q.id = qh.qualificacao_id
        WHERE qh.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND q.deleted_at IS NULL
        GROUP BY f.cpf, f.nome, q.codigo, q.nome, qh.data_vencimento
        HAVING COUNT(*) > 1
      )
      SELECT 
        cpf as funcionario_cpf,
        funcionario_nome,
        codigo as qualificacao_codigo,
        qualificacao_nome,
        data_vencimento,
        total as total_duplicatas
      FROM duplicatas_grouped
      ORDER BY funcionario_cpf, qualificacao_codigo;
    `;

    // 2. VENCIDOS - Com nomes completos
    const vencidosQuery = `
      SELECT 
        f.cpf as funcionario_cpf,
        f.nome as funcionario_nome,
        q.codigo as qualificacao_codigo,
        q.nome as qualificacao_nome,
        qh.data_vencimento,
        qh.data_conclusao,
        julianday('now') - julianday(qh.data_vencimento) as dias_vencido
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      JOIN qualificacoes q ON q.id = qh.qualificacao_id
      WHERE qh.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND q.deleted_at IS NULL
        AND qh.data_vencimento < date('now')
      ORDER BY dias_vencido DESC;
    `;

    // 3. CANDIDATOS RENOVAÇÃO - Com nomes completos
    const candidatosQuery = `
      WITH registros_por_qualif AS (
        SELECT 
          f.cpf,
          f.nome as funcionario_nome,
          q.codigo,
          q.nome as qualificacao_nome,
          COUNT(*) as total_registros,
          SUM(CASE WHEN ${vinculoExpr} THEN 1 ELSE 0 END) as registros_com_vinculo
        FROM qualificacoes_historico qh
        JOIN funcionarios f ON f.id = qh.funcionario_id
        JOIN qualificacoes q ON q.id = qh.qualificacao_id
        WHERE qh.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND q.deleted_at IS NULL
        GROUP BY f.cpf, f.nome, q.codigo, q.nome
        HAVING COUNT(*) > 1
      )
      SELECT 
        cpf as funcionario_cpf,
        funcionario_nome,
        codigo as qualificacao_codigo,
        qualificacao_nome,
        total_registros,
        registros_com_vinculo
      FROM registros_por_qualif
      WHERE registros_com_vinculo = 0
      ORDER BY funcionario_cpf, qualificacao_codigo;
    `;

    const [duplicatas, vencidos, candidatos] = await Promise.all([
      db.prepare(duplicatasQuery).all(),
      db.prepare(vencidosQuery).all(),
      db.prepare(candidatosQuery).all(),
    ]);

    return c.json({
      success: true,
      data: {
        duplicatas: {
          total: duplicatas.results?.length || 0,
          registros: duplicatas.results || [],
        },
        vencidos: {
          total: vencidos.results?.length || 0,
          registros: vencidos.results || [],
        },
        candidatos_renovacao: {
          total: candidatos.results?.length || 0,
          registros: candidatos.results || [],
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Erro na auditoria detalhada:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao executar auditoria detalhada',
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/auditoria.ts
~~~typescript
/**
 * ========================================
 * ENDPOINT: AUDITORIA PRÉ-CORREÇÃO
 * GET /api/qualificacoes-historico/auditoria
 * ========================================
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

/**
 * GET /auditoria
 * Executa auditoria completa dos dados antes de correções
 */
app.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const schemaInfo = await db.prepare("PRAGMA table_info('qualificacoes_historico')").all();
    const schemaColumns = new Set(
      (schemaInfo.results || []).map((row) => String((row as { name?: string }).name || '')),
    );
    const hasRenovacaoDe = schemaColumns.has('renovacao_de');
    const hasRenovada = schemaColumns.has('renovada');
    const vinculoExpr = hasRenovacaoDe
      ? 'h.renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(h.renovada, 0) = 1'
        : '0 = 1';
    const vinculoExprSemAlias = hasRenovacaoDe
      ? 'renovacao_de IS NOT NULL'
      : hasRenovada
        ? 'COALESCE(renovada, 0) = 1'
        : '0 = 1';

    const cpfsQuery = c.req.query('cpfs') || '';
    const cpfsFormatados = cpfsQuery
      .split(',')
      .map((cpf) => cpf.trim())
      .filter(Boolean);

    if (cpfsFormatados.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Informe o parâmetro cpfs com lista separada por vírgula',
          code: 'CPFS_REQUIRED',
        },
        400,
      );
    }

    // Remover formatação (só números)
    const cpfsSemFormatacao = cpfsFormatados.map((cpf) => cpf.replace(/[.-]/g, ''));

    // Tentar ambos os formatos
    const cpfs = [...cpfsFormatados, ...cpfsSemFormatacao];

    // Lista de códigos de qualificação do CSV
    const codigos = [
      'B',
      'C',
      'CMA',
      'D1',
      'D2',
      'D3',
      'D4',
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'F1',
      'F2',
      'FAP05.2',
      'FAP06',
      'FAP06SEM',
      'FAP14',
      'G1',
      'G2',
      'H',
      'CHTIFR',
      'IFR',
      'LOFT',
      'NOT',
      'OFEXCRED',
      'OPC',
      'ASO.P',
      'SAEFAP06',
      'SAEFAP14',
      'TIPO',
    ];

    // 1. VERIFICAR FUNCIONÁRIOS
    const { results: funcionarios } = await db
      .prepare(
        `
      SELECT 
        f.cpf,
        f.nome,
        f.codigo_anac,
        CASE 
          WHEN f.deleted_at IS NOT NULL THEN 'DELETADO'
          ELSE 'OK'
        END AS status
      FROM funcionarios f
      WHERE f.cpf IN (${cpfs.map(() => '?').join(',')})
      ORDER BY status DESC, f.cpf
    `,
      )
      .bind(...cpfs)
      .all();

    const cpfsNaoEncontrados = cpfsFormatados.filter((cpf) => {
      const cpfSemFormatacao = cpf.replace(/[.-]/g, '');
      return !funcionarios.find(
        (f) =>
          (f as { cpf: string }).cpf === cpf || (f as { cpf: string }).cpf === cpfSemFormatacao,
      );
    });

    // 2. VERIFICAR QUALIFICAÇÕES
    const { results: qualificacoes } = await db
      .prepare(
        `
      SELECT 
        qt.codigo,
        qt.descricao,
        CASE 
          WHEN qt.deleted_at IS NOT NULL THEN 'DELETADO'
          ELSE 'OK'
        END AS status
      FROM qualificacoes_tipos qt
      WHERE qt.codigo IN (${codigos.map(() => '?').join(',')})
      ORDER BY status DESC, qt.codigo
    `,
      )
      .bind(...codigos)
      .all();

    const codigosNaoEncontrados = codigos.filter(
      (cod) => !qualificacoes.find((q) => (q as { codigo: string }).codigo === cod),
    );

    // 3. VERIFICAR DUPLICATAS
    const { results: duplicatas } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        h.data_vencimento,
        COUNT(*) AS total_duplicatas
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      GROUP BY h.funcionario_cpf, h.qualificacao_codigo, h.data_vencimento
      HAVING COUNT(*) > 1
      ORDER BY total_duplicatas DESC
      LIMIT 50
    `,
      )
      .bind(...cpfs)
      .all();

    // 4. VERIFICAR REGISTROS VENCIDOS
    const { results: vencidos } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        h.data_vencimento,
        CAST((julianday('now') - julianday(h.data_vencimento)) AS INTEGER) AS dias_vencido
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.data_vencimento < date('now')
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      ORDER BY dias_vencido DESC
      LIMIT 30
    `,
      )
      .bind(...cpfs)
      .all();

    // 5. CANDIDATOS A RENOVAÇÃO
    const { results: candidatosRenovacao } = await db
      .prepare(
        `
      SELECT 
        h.funcionario_cpf,
        h.qualificacao_codigo,
        COUNT(*) AS total_registros,
        SUM(CASE WHEN ${vinculoExpr} THEN 1 ELSE 0 END) AS registros_com_vinculo
      FROM qualificacoes_historico h
      WHERE h.deleted_at IS NULL
        AND h.funcionario_cpf IN (${cpfs.map(() => '?').join(',')})
      GROUP BY h.funcionario_cpf, h.qualificacao_codigo
      HAVING total_registros > 1
      ORDER BY total_registros DESC
      LIMIT 50
    `,
      )
      .bind(...cpfs)
      .all();

    // 6. RESUMO GERAL
    const resumoQuery = await db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1) AS total_funcionarios,
        (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) AS total_qualificacoes,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) AS total_historico,
        (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL AND ${vinculoExprSemAlias}) AS historico_com_vinculo
    `,
      )
      .first();

    const resumo = resumoQuery || {
      total_funcionarios: 0,
      total_qualificacoes: 0,
      total_historico: 0,
      historico_com_vinculo: 0,
    };

    return c.json({
      success: true,
      data: {
        funcionarios: {
          total_csv: cpfsFormatados.length,
          encontrados: funcionarios,
          nao_encontrados: cpfsNaoEncontrados,
          total_encontrados: funcionarios.length,
          total_nao_encontrados: cpfsNaoEncontrados.length,
        },
        qualificacoes: {
          total_csv: codigos.length,
          encontrados: qualificacoes,
          nao_encontrados: codigosNaoEncontrados,
          total_encontrados: qualificacoes.length,
          total_nao_encontrados: codigosNaoEncontrados.length,
        },
        duplicatas: {
          total: duplicatas.length,
          registros: duplicatas,
        },
        vencidos: {
          total: vencidos.length,
          registros: vencidos,
        },
        candidatos_renovacao: {
          total: candidatosRenovacao.length,
          registros: candidatosRenovacao,
        },
        resumo_geral: resumo,
      },
    });
  } catch (error) {
    console.error('[AUDITORIA] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao executar auditoria',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;

~~~

---
## FILE: worker-airtrust/src/routes/auth.ts
~~~typescript
/**
 * AUTH ROUTES - Login, Refresh, Logout
 * Atualizado para usar tabela usuarios + refresh tokens
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateJWT,
  verifyPassword,
  hashPassword,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from '../utils/security';
import { badRequest, internalError, unauthorized } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rate-limit';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { createLogger, toError } from '../utils/logger';
import { hasUsuariosEmpresasTable, getUsuariosSchema } from '../utils/db-schema';
import { logAudit } from '../utils/db'; // SECURITY: Import audit logging
import { enviarEmailAlert } from '../cron/notificacoes';

// Tipar variáveis adicionadas ao contexto pelo middleware auth()
type AuthVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
  empresas?: number[];
};

const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// Tabela convites_usuarios criada via migration 0290 — não mais DDL em runtime.

async function resolveUserEmpresaId(db: D1Database, userId: number): Promise<number> {
  if (!(await hasUsuariosEmpresasTable(db))) {
    const funcionarioEmpresa = await db
      .prepare(
        `
          SELECT f.empresa_id
          FROM usuarios u
          INNER JOIN funcionarios f ON f.id = u.funcionario_id
          WHERE u.id = ?
            AND u.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.empresa_id IS NOT NULL
          LIMIT 1
        `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (funcionarioEmpresa?.empresa_id) {
      return funcionarioEmpresa.empresa_id;
    }

    const activeEmpresas = await db
      .prepare(
        `
          SELECT e.id
          FROM empresas e
          WHERE e.deleted_at IS NULL
            AND e.ativo = 1
          ORDER BY
            CASE
              WHEN e.codigo = 'airtrust' THEN 0
              ELSE 1
            END,
            e.id ASC
          LIMIT 2
        `,
      )
      .all<{ id: number }>();

    if ((activeEmpresas.results || []).length === 1) {
      return activeEmpresas.results[0].id;
    }

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  const empresa = await db
    .prepare(
      `
        SELECT ue.empresa_id
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE
            WHEN ue.is_primary = 1 THEN 0
            WHEN e.codigo = 'airtrust' THEN 1
            ELSE 2
          END,
          ue.empresa_id ASC
        LIMIT 1
      `,
    )
    .bind(userId)
    .first<{ empresa_id: number }>();

  if (!empresa?.empresa_id) {
    if (userId === 1) {
      const fallbackEmpresaAtiva = await db
        .prepare(
          `
            SELECT e.id AS empresa_id
            FROM empresas e
            WHERE e.deleted_at IS NULL
              AND e.ativo = 1
            ORDER BY
              CASE
                WHEN e.codigo = 'airtrust' THEN 0
                ELSE 1
              END,
              e.id ASC
            LIMIT 1
          `,
        )
        .first<{ empresa_id: number }>();

      const fallbackEmpresa =
        fallbackEmpresaAtiva ||
        (await db
          .prepare(
            `
              SELECT e.id AS empresa_id
              FROM empresas e
              WHERE e.deleted_at IS NULL
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
          )
          .first<{ empresa_id: number }>());

      if (fallbackEmpresa?.empresa_id) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
             VALUES (?, ?, 'admin', 1, datetime('now'))`,
          )
          .bind(userId, fallbackEmpresa.empresa_id)
          .run()
          .catch(() => null);

        return fallbackEmpresa.empresa_id;
      }
    }

    // FALLBACK: tentar resolver pelo domínio do e-mail
    const emailDomainResolved = await resolveEmpresaByEmailDomain(db, userId);
    if (emailDomainResolved) return emailDomainResolved;

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  return empresa.empresa_id;
}

/**
 * Resolve a empresa pelo domínio do e-mail do usuário.
 * Extrai o domínio após '@' e procura em empresas.dominio.
 * Se encontrar, cria automaticamente o vínculo em usuarios_empresas.
 */
async function resolveEmpresaByEmailDomain(db: D1Database, userId: number): Promise<number | null> {
  const usuario = await db
    .prepare(`SELECT id, email FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(userId)
    .first<{ id: number; email: string }>();

  if (!usuario?.email) return null;

  const atIndex = usuario.email.indexOf('@');
  if (atIndex === -1) return null;
  const domain = usuario.email.slice(atIndex + 1).toLowerCase();

  const empresa = await db
    .prepare(
      `SELECT id FROM empresas
       WHERE LOWER(dominio) = ?
         AND ativo = 1
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(domain)
    .first<{ id: number }>();

  if (!empresa?.id) return null;

  // Auto-criar vínculo para que próximos logins sejam resolvidos diretamente
  await db
    .prepare(
      `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
       VALUES (?, ?, 'member', 1, datetime('now'))`,
    )
    .bind(userId, empresa.id)
    .run();

  return empresa.id;
}

async function issueAccessTokenForEmpresa(
  c: { env: Env },
  payload: { userId: number; email: string; role: string; nome: string; empresaId: number },
): Promise<{ token: string; jti: string }> {
  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
  return generateJWT(
    {
      sub: payload.userId,
      empresa_id: payload.empresaId,
      email: payload.email,
      role: payload.role.toLowerCase(),
      nome: payload.nome,
    },
    jwtSecret,
    3600,
  );
}

// Handler OPTIONS para todas as rotas de auth (preflight CORS)
authRoutes.options('/*', (c) => {
  const origin = c.req.header('Origin');
  c.header('Access-Control-Allow-Origin', resolveAllowedOrigin(origin, c.env.CORS_ORIGINS));
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  );
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');
  c.status(204);
  return c.body(null);
});

/**
 * GET /api/auth/invite/validate?token=...
 * Valida token de convite para criação de senha
 */
authRoutes.get('/invite/validate', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT
        cu.id,
        cu.email,
        cu.expires_at,
        cu.used_at,
        u.nome,
        e.nome AS empresa_nome
      FROM convites_usuarios cu
      INNER JOIN usuarios u ON u.id = cu.usuario_id
      INNER JOIN empresas e ON e.id = cu.empresa_id
      WHERE cu.token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{
      id: number;
      email: string;
      expires_at: string;
      used_at: string | null;
      nome: string;
      empresa_nome: string;
    }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  return c.json({
    success: true,
    data: {
      email: convite.email,
      nome: convite.nome,
      empresaNome: convite.empresa_nome,
      expiresAt: convite.expires_at,
    },
  });
});

/** Valida força mínima da senha — reutilizar em todo endpoint que define senha */
function validatePassword(senha: string): void {
  if (!senha || senha.length < 8) {
    throw badRequest('Senha deve ter no mínimo 8 caracteres', 'INVALID_PASSWORD');
  }
}

function normalizeEmail(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildResetPasswordUrl(frontendUrl: string | undefined, token: string): string {
  const base = (frontendUrl || 'https://airtrust.online').replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

async function issuePasswordResetToken(
  db: D1Database,
  userId: number,
  email: string,
): Promise<string> {
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(rawToken);

  await db
    .prepare(
      `UPDATE password_reset_tokens
       SET consumed_at = COALESCE(consumed_at, datetime('now')),
           updated_at = datetime('now')
       WHERE user_id = ?
         AND consumed_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .bind(userId)
    .run();

  await db
    .prepare(
      `INSERT INTO password_reset_tokens
        (id, user_id, email, token_hash, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', '+60 minutes'), datetime('now'), datetime('now'))`,
    )
    .bind(crypto.randomUUID(), userId, email, tokenHash)
    .run();

  return rawToken;
}

/**
 * POST /api/auth/invite/accept
 * Define senha inicial a partir de token de convite
 */
authRoutes.post('/invite/accept', async (c) => {
  const body = await c.req.json<{ token?: string; senha?: string; password?: string }>();
  const token = String(body?.token || '').trim();
  const senha = String(body?.senha || body?.password || '');

  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  validatePassword(senha);

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT id, usuario_id, expires_at, used_at
      FROM convites_usuarios
      WHERE token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{ id: number; usuario_id: number; expires_at: string; used_at: string | null }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  const passwordHash = await hashPassword(senha);

  const { hasActive, hasAtivo } = await getUsuariosSchema(db);

  const updateUserSql = hasActive
    ? `UPDATE usuarios SET password_hash = ?, active = 1, updated_at = datetime('now') WHERE id = ?`
    : hasAtivo
      ? `UPDATE usuarios SET password_hash = ?, ativo = 1, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`;

  await db.prepare(updateUserSql).bind(passwordHash, convite.usuario_id).run();

  await db
    .prepare(`UPDATE convites_usuarios SET used_at = datetime('now') WHERE id = ?`)
    .bind(convite.id)
    .run();

  return c.json({
    success: true,
    message: 'Senha criada com sucesso. Faça login para continuar.',
  });
});

/**
 * POST /api/auth/forgot-password
 * Sempre retorna sucesso para evitar enumeração de usuários.
 */
authRoutes.post(
  '/forgot-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-forgot-password' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.forgotPassword');

    const body = await c.req
      .json<{
        email?: string;
      }>()
      .catch(() => ({}));

    const email = normalizeEmail(body?.email);

    if (!email || !email.includes('@')) {
      return c.json({ success: true });
    }

    try {
      const db = c.env.DB;
      const { activeWhere } = await getUsuariosSchema(db);

      const user = await db
        .prepare(
          `SELECT id, email
           FROM usuarios
           WHERE email = ?
             AND deleted_at IS NULL
             ${activeWhere}
           LIMIT 1`,
        )
        .bind(email)
        .first<{ id: number; email: string }>();

      if (user && c.env.BREVO_API_KEY) {
        const token = await issuePasswordResetToken(db, user.id, user.email);
        const resetUrl = buildResetPasswordUrl(c.env.FRONTEND_URL, token);
        const assunto = '[AirTrust] Recuperação de senha';
        const corpo = `Recebemos uma solicitação para redefinir sua senha no AirTrust.\n\nUse o link abaixo para criar uma nova senha (válido por 60 minutos):\n${resetUrl}\n\nSe você não solicitou esta alteração, ignore este e-mail.`;
        await enviarEmailAlert(c.env, [user.email], assunto, corpo);
      }
    } catch (error) {
      logger.warn('[AUTH] forgot-password: falha controlada', toError(error));
    }

    return c.json({ success: true });
  },
);

/**
 * POST /api/auth/reset-password
 */
authRoutes.post(
  '/reset-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-reset-password' }),
  async (c) => {
    const body = await c.req.json<{
      token?: string;
      senha?: string;
      password?: string;
      confirmarSenha?: string;
      confirmPassword?: string;
    }>();

    const token = String(body?.token || '').trim();
    const senha = String(body?.senha || body?.password || '');
    const confirmacao = String(body?.confirmarSenha || body?.confirmPassword || '');

    if (!token) {
      throw badRequest('Token é obrigatório', 'MISSING_RESET_TOKEN');
    }

    validatePassword(senha);
    if (confirmacao && confirmacao !== senha) {
      throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
    }

    const db = c.env.DB;
    const tokenHash = await sha256Hex(token);

    const tokenRow = await db
      .prepare(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = ?
           AND consumed_at IS NULL
           AND expires_at > datetime('now')
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tokenHash)
      .first<{ id: string; user_id: number }>();

    if (!tokenRow?.id) {
      throw unauthorized('Token inválido ou expirado', 'INVALID_RESET_TOKEN');
    }

    const { activeWhere } = await getUsuariosSchema(db);
    const user = await db
      .prepare(
        `SELECT id, password_hash
         FROM usuarios
         WHERE id = ?
           AND deleted_at IS NULL
           ${activeWhere}
         LIMIT 1`,
      )
      .bind(tokenRow.user_id)
      .first<{ id: number; password_hash: string }>();

    if (!user?.id) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    const passwordHash = await hashPassword(senha);

    await db
      .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(passwordHash, user.id)
      .run();

    await db
      .prepare(
        `UPDATE password_reset_tokens
         SET consumed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(tokenRow.id)
      .run();

    // Revoga refresh tokens para forçar novo login em todos os dispositivos.
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = datetime('now')
         WHERE user_id = ?
           AND revoked_at IS NULL`,
      )
      .bind(user.id)
      .run();

    return c.json({
      success: true,
      message: 'Senha redefinida com sucesso.',
    });
  },
);

/**
 * POST /api/auth/login
 *
 * Autentica usuário com email/senha e retorna access + refresh tokens
 *
 * Body:
 * {
 *   "email": "admin@airtrust.com",
 *   "senha": "<senha-do-usuario>"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "a1b2c3d4...",
 *     "user": {
 *       "id": 1,
 *       "email": "admin@airtrust.com",
 *       "role": "admin",
 *       "nome": "Administrador AirTrust"
 *     }
 *   }
 * }
 */
authRoutes.post(
  '/login',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'auth-login' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.login');
    try {
      const body = await c.req.json();
      // Aceita tanto 'password' quanto 'senha' para compatibilidade
      const { email, senha, password } = body;
      const passwordToUse = senha || password;

      // Validação básica
      if (!email || !passwordToUse) {
        throw badRequest('Email e senha são obrigatórios', 'MISSING_CREDENTIALS');
      }

      const devEnv = c.env.ENVIRONMENT ?? 'production';
      const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';

      // Buscar usuário no D1
      const db = c.env.DB;
      const { hasActive, hasAtivo, activeWhere } = await getUsuariosSchema(db);

      type DbUser = {
        id: number;
        email: string;
        perfil: string;
        password_hash: string;
        nome: string;
      } | null;

      let user = await db
        .prepare(
          `
        SELECT id, email, nome, perfil, password_hash
        FROM usuarios
        WHERE email = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
        )
        .bind(email.toLowerCase())
        .first<DbUser>();

      if (!user) {
        if (devBypassEnabled) {
          // Dev bypass: auto-provisionar qualquer email que não exista no banco local
          const nomeDev = email.toLowerCase().split('@')[0];
          await db
            .prepare(
              `INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, ${
                hasActive ? 'active' : hasAtivo ? 'ativo' : 'created_at'
              })
             VALUES (?, ?, ?, ?, ${hasActive || hasAtivo ? '1' : "datetime('now')"})`,
            )
            .bind(email.toLowerCase(), 'dev-local-bypass', nomeDev, 'ADMIN')
            .run();

          const created = await db
            .prepare(
              `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
            )
            .bind(email.toLowerCase())
            .first<DbUser>();
          if (created) {
            user = created;
            // Vincular à primeira empresa ativa se ainda não tiver vínculo
            const primeiraEmpresa = await db
              .prepare(
                `SELECT id FROM empresas WHERE deleted_at IS NULL AND ativo = 1 ORDER BY id ASC LIMIT 1`,
              )
              .first<{ id: number }>();
            if (primeiraEmpresa?.id) {
              await db
                .prepare(
                  `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role) VALUES (?, ?, 1, 'admin')`,
                )
                .bind((created as NonNullable<DbUser>).id, primeiraEmpresa.id)
                .run();
            }
          } else {
            throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
          }
        } else {
          throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
        }
      }

      // Verificar senha — em dev com bypass, aceitar qualquer senha para utilizadores auto-provisionados
      let isValidPassword = false;
      try {
        if (devBypassEnabled) {
          isValidPassword = true;
        } else {
          isValidPassword = await verifyPassword(
            passwordToUse,
            (user as NonNullable<DbUser>).password_hash,
          );
        }
      } catch (e) {
        logger.error('[AUTH] Erro ao verificar senha (bcrypt)', toError(e));
      }

      if (!isValidPassword) {
        throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
      }

      // Gerar JWT access token (1 hora)
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
      const empresaId = await resolveUserEmpresaId(db, (user as NonNullable<DbUser>).id);

      // Carregar permissões individuais do usuário
      const permissoesRows = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind((user as NonNullable<DbUser>).id)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));

      const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

      // Carregar funcionario_id se existir
      const userFull = await db
        .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
        .bind((user as NonNullable<DbUser>).id)
        .first<{ funcionario_id: number | null }>()
        .catch(() => null);

      const { token: accessToken, jti } = await generateJWT(
        {
          sub: (user as NonNullable<DbUser>).id,
          empresa_id: empresaId,
          email: (user as NonNullable<DbUser>).email,
          role: (user as NonNullable<DbUser>).perfil.toUpperCase(),
          nome: (user as NonNullable<DbUser>).nome,
          permissions: permissions.length > 0 ? permissions : undefined,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
        jwtSecret,
        3600,
      );

      // Gerar refresh token (7 dias)
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry(7);

      // Salvar refresh token com jti associado para blocklist no logout
      await db
        .prepare(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, access_token_jti) VALUES (?, ?, ?, ?)',
        )
        .bind((user as NonNullable<DbUser>).id, refreshToken, expiresAt, jti)
        .run()
        .catch(() =>
          // fallback: tabela pode não ter a coluna jti ainda (migration pendente)
          db
            .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
            .bind((user as NonNullable<DbUser>).id, refreshToken, expiresAt)
            .run(),
        );

      // Retornar tokens e dados do usuário
      return c.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            role: (user as NonNullable<DbUser>).perfil.toUpperCase(),
            nome: user.nome,
            permissions,
            funcionario_id: userFull?.funcionario_id ?? null,
          },
        },
      });
    } catch (error) {
      // Preserve ApiError to allow specific codes/messages from helpers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.name === 'ApiError') throw error as never;
      logger.error('[AUTH] Login error', toError(error));
      throw internalError('Erro ao processar login', 'LOGIN_ERROR');
    }
  },
);

/**
 * POST /api/auth/refresh
 *
 * Renova access token usando refresh token válido
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "e5f6g7h8..." (opcional: novo refresh token)
 *   }
 * }
 */
authRoutes.post(
  '/refresh',
  rateLimiter({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'auth-refresh' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.refresh');
    try {
      const body = await c.req.json();
      const { refreshToken } = body;

      if (!refreshToken) {
        throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
      }

      // Buscar refresh token no D1
      const db = c.env.DB;
      const { activeWhere: activeWhereU } = await getUsuariosSchema(db);
      const activeWhere = activeWhereU.replace('AND ', 'AND u.'); // prefix coluna com alias

      type TokenRecord = {
        user_id: number;
        email: string;
        perfil: string;
        nome: string;
        funcionario_id: number | null;
      } | null;
      const tokenRecord = await db
        .prepare(
          `
        SELECT rt.user_id, u.email, u.perfil, u.nome, u.funcionario_id
        FROM refresh_tokens rt
        INNER JOIN usuarios u ON rt.user_id = u.id
        WHERE rt.token = ?
          AND rt.revoked_at IS NULL
          AND rt.expires_at > datetime('now')
          AND u.deleted_at IS NULL
          ${activeWhere}
      `,
        )
        .bind(refreshToken)
        .first<TokenRecord>();

      if (!tokenRecord) {
        throw unauthorized('Refresh token inválido ou expirado', 'INVALID_REFRESH_TOKEN');
      }

      // Gerar novo access token
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
      const empresaId = await resolveUserEmpresaId(
        db,
        (tokenRecord as NonNullable<TokenRecord>).user_id,
      );

      // Recarregar permissões individuais (overrides GRANT/DENY)
      const userId = (tokenRecord as NonNullable<TokenRecord>).user_id;
      const permissoesRefresh = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind(userId)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
      const permissionsRefresh = (permissoesRefresh.results || []).map(
        (p) => `${p.tipo}:${p.permissao}`,
      );

      const { token: newAccessToken, jti: newJti } = await generateJWT(
        {
          sub: userId,
          empresa_id: empresaId,
          email: tokenRecord.email,
          role: tokenRecord.perfil.toUpperCase(),
          nome: tokenRecord.nome,
          permissions: permissionsRefresh,
          funcionario_id: (tokenRecord as NonNullable<TokenRecord>).funcionario_id ?? null,
        },
        jwtSecret,
        3600,
      );

      // Rotação de refresh token
      const newRefreshToken = generateRefreshToken();
      const newExpiresAt = getRefreshTokenExpiry(7);

      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run();

      await db
        .prepare(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, access_token_jti) VALUES (?, ?, ?, ?)',
        )
        .bind(
          (tokenRecord as NonNullable<TokenRecord>).user_id,
          newRefreshToken,
          newExpiresAt,
          newJti,
        )
        .run()
        .catch(() =>
          db
            .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
            .bind((tokenRecord as NonNullable<TokenRecord>).user_id, newRefreshToken, newExpiresAt)
            .run(),
        );

      return c.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.name === 'ApiError') throw error as never;
      logger.error('[AUTH] Refresh error', toError(error));
      throw internalError('Erro ao renovar token', 'REFRESH_ERROR');
    }
  },
);

/**
 * POST /api/auth/logout
 *
 * Invalida refresh token (revoga)
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout realizado com sucesso"
 * }
 */
authRoutes.post('/logout', async (c) => {
  const logger = createLogger(c, 'AuthRoutes.logout');
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
    }

    const db = c.env.DB;

    // Buscar jti associado ao refresh token para invalidar o access token
    const tokenRow = await db
      .prepare('SELECT access_token_jti FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL')
      .bind(refreshToken)
      .first<{ access_token_jti: string | null }>()
      .catch(() => null);

    // Revogar refresh token
    await db
      .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
      .bind(refreshToken)
      .run();

    // Adicionar jti à blocklist (access token passa a ser rejeitado até expirar)
    if (tokenRow?.access_token_jti) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
           VALUES (?, datetime('now', '+1 hour'))`,
        )
        .bind(tokenRow.access_token_jti)
        .run()
        .catch(() => {}); // best-effort — não falhar logout por causa disso
    }

    return c.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] Logout error', toError(error));
    throw internalError('Erro ao fazer logout', 'LOGOUT_ERROR');
  }
});

/**
 * GET /api/auth/me
 *
 * Retorna dados do usuário autenticado
 * Requer: Authorization: Bearer <accessToken>
 */
authRoutes.get('/me', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.me');
  try {
    // c.get is tipado via Variables, mas pode retornar string
    const userIdRaw = c.get('userId');
    const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

    // Buscar dados do usuário no D1
    const db = c.env.DB;

    const { activeWhere } = await getUsuariosSchema(db);

    type MeRow = { id: number; email: string; perfil: string; nome: string } | null;
    const user = await db
      .prepare(
        `
        SELECT id, email, nome, perfil
        FROM usuarios
        WHERE id = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
      )
      .bind(userId)
      .first<MeRow>();

    if (!user) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    return c.json({
      success: true,
      data: {
        id: (user as NonNullable<MeRow>).id,
        email: (user as NonNullable<MeRow>).email,
        role: (user as NonNullable<MeRow>).perfil.toUpperCase(),
        nome: (user as NonNullable<MeRow>).nome,
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] /me error', toError(error));
    throw internalError('Erro ao buscar dados do usuário', 'ME_ERROR');
  }
});

authRoutes.post('/change-password', auth(), async (c) => {
  const body = await c.req.json<{
    senhaAtual?: string;
    currentPassword?: string;
    novaSenha?: string;
    newPassword?: string;
    confirmarSenha?: string;
    confirmPassword?: string;
  }>();

  const senhaAtual = String(body?.senhaAtual || body?.currentPassword || '');
  const novaSenha = String(body?.novaSenha || body?.newPassword || '');
  const confirmarSenha = String(body?.confirmarSenha || body?.confirmPassword || '');

  if (!senhaAtual) {
    throw badRequest('Senha atual é obrigatória', 'MISSING_CURRENT_PASSWORD');
  }

  validatePassword(novaSenha);

  if (confirmarSenha && confirmarSenha !== novaSenha) {
    throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const { activeWhere } = await getUsuariosSchema(db);

  const user = await db
    .prepare(
      `SELECT id, password_hash
       FROM usuarios
       WHERE id = ?
         AND deleted_at IS NULL
         ${activeWhere}
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: number; password_hash: string } | null>();

  if (!user?.password_hash) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const devEnv = c.env.ENVIRONMENT ?? 'production';
  const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';
  const senhaAtualValida =
    devBypassEnabled && user.password_hash === 'dev-local-bypass'
      ? true
      : await verifyPassword(senhaAtual, user.password_hash);

  if (!senhaAtualValida) {
    throw unauthorized('Senha atual inválida', 'INVALID_CURRENT_PASSWORD');
  }

  if (!(devBypassEnabled && user.password_hash === 'dev-local-bypass')) {
    const isSamePassword = await verifyPassword(novaSenha, user.password_hash);
    if (isSamePassword) {
      throw badRequest('A nova senha deve ser diferente da atual', 'PASSWORD_UNCHANGED');
    }
  }

  const passwordHash = await hashPassword(novaSenha);
  await db
    .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(passwordHash, userId)
    .run();

  return c.json({
    success: true,
    message: 'Senha alterada com sucesso.',
  });
});

/**
 * GET /api/auth/empresas
 * Lista empresas vinculadas ao usuário autenticado
 */
authRoutes.get('/empresas', auth(), async (c) => {
  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

  const db = c.env.DB;
  const empresaIdAtual = await resolveUserEmpresaId(db, userId);
  const isPlatformAdmin = userId === 1;

  const empresas = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        'admin' AS role,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM empresas e
      WHERE e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN e.codigo = 'airtrust' THEN 0 ELSE 1 END,
        e.nome ASC
    `
        : `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        ue.role,
        ue.is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
        e.nome ASC
    `,
    )
    .bind(
      ...(isPlatformAdmin
        ? [empresaIdAtual, empresaIdAtual, empresaIdAtual]
        : [empresaIdAtual, userId, empresaIdAtual]),
    )
    .all<{
      id: number;
      nome: string;
      codigo: string;
      logo_url: string | null;
      role: string;
      is_primary: number;
      is_current: number;
    }>();

  return c.json({
    success: true,
    data: {
      empresaAtualId: empresaIdAtual,
      empresas: empresas.results || [],
    },
  });
});

/**
 * POST /api/auth/select-empresa
 * Alterna empresa ativa do usuário e retorna novo access token
 */
authRoutes.post('/select-empresa', auth(), async (c) => {
  const body = await c.req.json<{ empresaId?: number }>();
  const targetEmpresaId = Number(body?.empresaId || 0);

  if (!targetEmpresaId || !Number.isFinite(targetEmpresaId)) {
    throw badRequest('empresaId é obrigatório', 'MISSING_EMPRESA_ID');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const isPlatformAdmin = userId === 1;

  const vinculo = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT 'admin' AS role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM empresas e
      WHERE e.id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `
        : `
      SELECT ue.role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND ue.empresa_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `,
    )
    .bind(...(isPlatformAdmin ? [targetEmpresaId] : [userId, targetEmpresaId]))
    .first<{ role: string; empresa_id: number; empresa_nome: string; empresa_codigo: string }>();

  if (!vinculo) {
    throw unauthorized('Usuário não possui acesso à empresa selecionada', 'TENANT_ACCESS_DENIED');
  }

  if (isPlatformAdmin) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
         VALUES (?, ?, 'admin', 1, datetime('now'))`,
      )
      .bind(userId, targetEmpresaId)
      .run()
      .catch(() => null);
  }

  await db
    .prepare(
      `
      UPDATE usuarios_empresas
      SET is_primary = CASE WHEN empresa_id = ? THEN 1 ELSE 0 END
      WHERE usuario_id = ?
    `,
    )
    .bind(targetEmpresaId, userId)
    .run();

  type UserRow = { id: number; email: string; perfil: string; nome: string } | null;
  const user = await db
    .prepare(
      `
      SELECT id, email, perfil, nome
      FROM usuarios
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(userId)
    .first<UserRow>();

  if (!user) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const { token: accessToken } = await issueAccessTokenForEmpresa(c, {
    userId,
    email: user.email,
    role: user.perfil,
    nome: user.nome,
    empresaId: targetEmpresaId,
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      empresa: {
        id: vinculo.empresa_id,
        nome: vinculo.empresa_nome,
        codigo: vinculo.empresa_codigo,
      },
    },
  });
});

/**
 * POST /api/auth/impersonate
 *
 * Permite que um ADMIN faça login como outro usuário para fins de teste.
 *
 * Body: { "userId": 42 }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "user": { "id": 42, "email": "...", "nome": "...", "role": "..." }
 *   }
 * }
 */
authRoutes.post('/impersonate', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.impersonate');
  try {
    // SECURITY: Normalize role to uppercase to prevent case-sensitivity bypass
    const callerRole = (c.get('userRole') as string | undefined)?.toUpperCase() ?? '';
    if (callerRole !== 'ADMIN') {
      throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
    }

    const callerId = c.get('userId') as number | string;
    const body = await c.req.json<{ userId: number }>();
    const targetUserId = Number(body?.userId);
    if (!targetUserId || isNaN(targetUserId)) {
      throw badRequest('userId inválido', 'INVALID_USER_ID');
    }

    if (Number(callerId) === targetUserId) {
      throw badRequest('Não é possível impersonar a si mesmo', 'SELF_IMPERSONATE');
    }

    const db = c.env.DB;
    type TargetUser = { id: number; email: string; perfil: string; nome: string };
    const target = await db
      .prepare(
        `SELECT id, email, perfil, nome FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(targetUserId)
      .first<TargetUser>();

    if (!target) {
      throw unauthorized('Usuário alvo não encontrado', 'USER_NOT_FOUND');
    }

    const empresaId = await resolveUserEmpresaId(db, target.id);

    const permissoesRows = await db
      .prepare(
        `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
      )
      .bind(target.id)
      .all<{ permissao: string; tipo: string }>()
      .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
    const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

    const userFull = await db
      .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
      .bind(target.id)
      .first<{ funcionario_id: number | null }>()
      .catch(() => null);

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET não configurado');

    const { token: accessToken } = await generateJWT(
      {
        sub: target.id,
        empresa_id: empresaId,
        email: target.email,
        role: target.perfil.toUpperCase(),
        nome: target.nome,
        permissions: permissions.length > 0 ? permissions : undefined,
        funcionario_id: userFull?.funcionario_id ?? null,
        impersonated_by: Number(callerId),
      },
      jwtSecret,
      3600,
    );

    logger.info(
      `[IMPERSONATE] Admin ${callerId} impersonando usuário ${target.id} (${target.email})`,
    );

    // SECURITY: Log impersonation action for compliance/audit trail
    await logAudit(db, {
      userId: Number(callerId),
      action: 'IMPERSONATE',
      entityType: 'usuario',
      entityId: targetUserId,
      newValues: {
        target_id: targetUserId,
        target_email: target.email,
        target_nome: target.nome,
        impersonation_duration: '3600 segundos',
      },
    }).catch((err) => {
      logger.warn('[IMPERSONATE] Falha ao registrar auditoria', toError(err));
      // Don't throw - audit failure shouldn't block login
    });

    return c.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: target.id,
          email: target.email,
          nome: target.nome,
          role: target.perfil.toUpperCase(),
          permissions,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[IMPERSONATE] Erro', toError(error));
    throw internalError('Erro ao processar impersonação', 'IMPERSONATE_ERROR');
  }
});

export { authRoutes };

~~~

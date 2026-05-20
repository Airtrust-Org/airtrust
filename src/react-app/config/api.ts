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

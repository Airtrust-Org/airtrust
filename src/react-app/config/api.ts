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
import { sanitizeLmsAuthenticatedErrorResponse } from '@/react-app/lib/lms-safe-error-response';
import { resolveApiBase } from './api-environment';

export {
  ApiEnvironmentConfigurationError,
  PRODUCTION_API_BASE_URL,
  STAGING_API_BASE_URL,
  resolveApiBase,
} from './api-environment';

export const API_BASE_URL = resolveApiBase();
export const AUTH_TOKEN_CHANGED_EVENT = 'airtrust:token-changed';
export const AUTH_PERSIST_LOGIN_KEY = 'airtrust_persist_login';
// Session-only by default — a shared/public device left logged in shouldn't
// silently persist a token to localStorage until the user opts in via the
// "remember me" checkbox (LoginSimple.tsx). Only the default flips here; once
// setPersistLogin() has ever been called, the stored preference wins.
const DEFAULT_PERSIST_LOGIN = false;

// ===== TOKEN STORAGE (Memory-based for security) =====
let cachedToken: string | null = null;
let cachedRefreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

function safeLocalStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function safeSessionStorageGet(key: string): string | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeSessionStorageRemove(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function readPersistLoginPreference(): boolean {
  const stored = safeLocalStorageGet(AUTH_PERSIST_LOGIN_KEY);
  if (stored === null) {
    return DEFAULT_PERSIST_LOGIN;
  }
  return stored === '1';
}

let _persistLogin = readPersistLoginPreference();
export function setPersistLogin(val: boolean) {
  _persistLogin = val;
  safeLocalStorageSet(AUTH_PERSIST_LOGIN_KEY, val ? '1' : '0');
}
export function getPersistLogin() {
  _persistLogin = readPersistLoginPreference();
  return _persistLogin;
}

export function readAuthStorageValue(key: string): string | null {
  const localValue = safeLocalStorageGet(key);
  if (localValue) return localValue;
  return safeSessionStorageGet(key);
}

export function writeAuthStorageValue(
  key: string,
  value: string,
  persist: boolean = getPersistLogin(),
): void {
  if (persist) {
    if (!safeLocalStorageSet(key, value)) {
      safeSessionStorageSet(key, value);
    }
    safeSessionStorageRemove(key);
    return;
  }

  if (!safeSessionStorageSet(key, value)) {
    safeLocalStorageSet(key, value);
  }
  safeLocalStorageRemove(key);
}

export function removeAuthStorageValue(key: string): void {
  safeLocalStorageRemove(key);
  safeSessionStorageRemove(key);
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  cachedToken = accessToken;
  if (refreshToken) {
    cachedRefreshToken = refreshToken;
  }
  const persist = getPersistLogin();
  writeAuthStorageValue('airtrust_token', accessToken, persist);
  if (refreshToken) {
    writeAuthStorageValue('airtrust_refresh_token', refreshToken, persist);
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
  removeAuthStorageValue('airtrust_token');
  removeAuthStorageValue('airtrust_refresh_token');
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
  const stored = readAuthStorageValue('airtrust_token');
  if (stored && isValidToken(stored)) {
    cachedToken = stored;
    return cachedToken;
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

  const stored = readAuthStorageValue('airtrust_refresh_token');
  if (stored) {
    cachedRefreshToken = stored;
    return cachedRefreshToken;
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

export function getTokenExpiryTimeMs(token: string | null): number | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class AuthRefreshError extends Error {
  terminal: boolean;
  status?: number;
  code?: string;

  constructor(message: string, options?: { terminal?: boolean; status?: number; code?: string }) {
    super(message);
    this.name = 'AuthRefreshError';
    this.terminal = options?.terminal ?? false;
    this.status = options?.status;
    this.code = options?.code;
  }
}

export function isTerminalAuthRefreshError(error: unknown): boolean {
  return error instanceof AuthRefreshError && error.terminal;
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
    // Try to refresh. getRefreshToken() (not the raw cachedRefreshToken
    // variable) so a cold start — module state reset, persisted session
    // still valid in storage — restores the session via refresh instead
    // of logging the user out on the very first authenticated call.
    if (!retry && getRefreshToken()) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch (error) {
        if (isTerminalAuthRefreshError(error)) clearTokens();
        throw error;
      }
    }

    // If no refresh possible, clear tokens
    clearTokens();
    throw new Error('Authentication required');
  }

  const config: RequestInit = {
    ...options,
    credentials: options.credentials ?? fetchConfig.credentials,
    headers: {
      ...(isFormDataBody ? {} : fetchConfig.headers),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  };

  const response = await apiFetch(url, config);

  // ===== HANDLE 401 UNAUTHORIZED =====
  if (response.status === 401 && !retry) {
    // Token expired or invalid, try refresh — same cold-start fix as above.
    if (getRefreshToken()) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch (error) {
        if (isTerminalAuthRefreshError(error)) clearTokens();
        throw error;
      }
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return sanitizeLmsAuthenticatedErrorResponse(response, url);
}

/**
 * Refresh access token using refresh token
 */
async function performRefreshAccessToken(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    throw new AuthRefreshError('No refresh token available', { terminal: true });
  }

  try {
    const response = await apiFetch(API_ENDPOINTS.REFRESH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const responseJson = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      const code = responseJson.code;
      const terminal =
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        code === 'INVALID_REFRESH_TOKEN' ||
        code === 'REFRESH_TOKEN_REVOKED' ||
        code === 'REFRESH_TOKEN_EXPIRED' ||
        code === 'USER_INACTIVE';

      // Outra aba pode ter rotacionado o token enquanto esta requisição estava em voo.
      const currentRefreshToken = readAuthStorageValue('airtrust_refresh_token');
      if (currentRefreshToken && currentRefreshToken !== refreshToken) {
        cachedRefreshToken = currentRefreshToken;
        cachedToken = readAuthStorageValue('airtrust_token');
        return;
      }

      if (terminal) clearTokens();
      throw new AuthRefreshError(responseJson.error || 'Refresh token failed', {
        terminal,
        status: response.status,
        code,
      });
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

    type RefreshTokenPayload = {
      accessToken?: string;
      refreshToken?: string;
      access_token?: string;
      refresh_token?: string;
    };
    const payload = (responseJson.data ?? responseJson) as RefreshTokenPayload;
    const newAccessToken = payload.accessToken ?? payload.access_token;
    const newRefreshToken = payload.refreshToken ?? payload.refresh_token;
    if (!newAccessToken) throw new AuthRefreshError('No token in refresh response');

    // Não sobrescrever um par mais novo que tenha sido gravado por outra aba.
    const currentRefreshToken = readAuthStorageValue('airtrust_refresh_token');
    if (currentRefreshToken && currentRefreshToken !== refreshToken) {
      cachedRefreshToken = currentRefreshToken;
      cachedToken = readAuthStorageValue('airtrust_token');
      return;
    }

    setTokens(newAccessToken, newRefreshToken);
  } catch (error) {
    if (error instanceof AuthRefreshError) throw error;
    throw new AuthRefreshError(error instanceof Error ? error.message : 'Refresh token failed', {
      terminal: false,
    });
  }
}

export function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  const operation = performRefreshAccessToken();
  const tracked = operation.finally(() => {
    if (refreshPromise === tracked) refreshPromise = null;
  });
  refreshPromise = tracked;
  return tracked;
}

/**
 * Perform logout
 */
export async function logout(): Promise<void> {
  try {
    const token = getAccessToken();
    const refreshToken = getRefreshToken();
    if (token || refreshToken) {
      await apiFetch(API_ENDPOINTS.LOGOUT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    }
  } catch (error) {
    console.warn('Logout request failed', error);
  } finally {
    clearTokens();
  }
}

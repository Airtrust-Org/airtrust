/**
 * HTTP Client Unificado - AirTrust
 *
 * Consolida funcionalidades de:
 * - api.ts (CSRF + JWT)
 * - apiClient.ts (Retry logic + Generic response)
 *
 * Features:
 * - CSRF token injection automático
 * - JWT Bearer token
 * - Retry logic com exponential backoff
 * - Generic response type
 * - Error handling padronizado
 * - Request monitoring integration
 */

import { API_BASE_URL, getAccessToken, refreshAccessToken } from '../config/api';
import { safeFrontendApiErrorMessage } from '../lib/api-contract';
import { apiFetch } from '../lib/apiFetch';
import { requestController } from '../utils/request-control';
import { logger } from '../utils/logger';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string | number;
  details?: unknown;
  meta?: unknown;
}

export interface HttpClientOptions extends RequestInit {
  retry?: number;
  retryDelayMs?: number;
  skipRequestControl?: boolean;
}

export function safeHttpClientErrorMessage(
  message: string | undefined,
  status?: number | string,
): string {
  if (status === 'NETWORK_ERROR') {
    return 'Falha de rede. Verifique sua conexão e tente novamente.';
  }
  if (status === 401) {
    return safeFrontendApiErrorMessage(message, 'Sua sessão expirou. Entre novamente.');
  }
  if (status === 403) {
    return safeFrontendApiErrorMessage(
      message,
      'Você não tem permissão para executar esta ação.',
    );
  }
  if (typeof status === 'number' && status >= 500) {
    return safeFrontendApiErrorMessage(
      message,
      'O servidor não conseguiu concluir a operação.',
    );
  }
  return safeFrontendApiErrorMessage(message);
}

class HttpClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) return endpoint;

    const normalizedBase = this.baseURL.replace(/\/+$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (normalizedBase.endsWith('/api') && normalizedEndpoint === '/api') {
      return normalizedBase;
    }

    if (normalizedBase.endsWith('/api') && normalizedEndpoint.startsWith('/api/')) {
      return `${normalizedBase}${normalizedEndpoint.slice(4)}`;
    }

    return `${normalizedBase}${normalizedEndpoint}`;
  }

  private async executeRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    fetchOptions: RequestInit,
    allowRefreshRetry: boolean,
  ): Promise<Response> {
    const response = await apiFetch(url, {
      ...fetchOptions,
      method,
      headers,
    });

    if (response.status !== 401 || !allowRefreshRetry) {
      return response;
    }

    try {
      await refreshAccessToken();
      const refreshedToken = getAccessToken();
      const retryHeaders = { ...headers };
      if (refreshedToken) {
        retryHeaders['Authorization'] = `Bearer ${refreshedToken}`;
      }

      return apiFetch(url, {
        ...fetchOptions,
        method,
        headers: retryHeaders,
      });
    } catch (error) {
      logger.warn('[HttpClient] Refresh token failed during 401 retry', error);
      return response;
    }
  }

  /**
   * Request interno com todas as features
   */
  private async request<T>(
    endpoint: string,
    options: HttpClientOptions = {},
  ): Promise<ApiResponse<T>> {
    const { retry = 3, retryDelayMs = 1000, skipRequestControl = false, ...fetchOptions } = options;

    // Check request limits (can be skipped for internal requests)
    if (!skipRequestControl && !requestController.canMakeRequest()) {
      throw new Error('Request limit exceeded. Please try again later.');
    }

    const url = this.buildUrl(endpoint);
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const token = getAccessToken();
    const csrfToken = localStorage.getItem('csrf_token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (method === 'GET') {
      headers['Cache-Control'] = headers['Cache-Control'] || 'no-cache, no-store, max-age=0';
      headers.Pragma = headers.Pragma || 'no-cache';
      headers['X-AirTrust-Bypass-Cache'] = headers['X-AirTrust-Bypass-Cache'] || '1';
    }

    // JWT token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // CSRF token para mutations
    const requiresCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    if (requiresCsrf && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retry) {
      try {
        if (!skipRequestControl) {
          requestController.recordRequest();
        }

        const response = await this.executeRequest(
          url,
          method,
          headers,
          fetchOptions,
          Boolean(token),
        );

        // Parse response
        const contentType = response.headers.get('content-type');
        let responseData: unknown;

        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        // Success
        if (response.ok) {
          return {
            success: true,
            data: responseData as T,
          };
        }

        // HTTP error
        const responseObj =
          responseData && typeof responseData === 'object'
            ? (responseData as { error?: string; message?: string })
            : {};
        const errorMessage = safeHttpClientErrorMessage(
          responseObj.error || responseObj.message || response.statusText,
          response.status,
        );
        return {
          success: false,
          error: errorMessage,
          code: response.status,
          details: responseData,
        };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt <= retry) {
          const delay = retryDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`[HttpClient] Retry ${attempt}/${retry} after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logger.error('[HttpClient] All retries failed:', lastError);
    return {
      success: false,
      error: safeHttpClientErrorMessage(lastError?.message, 'NETWORK_ERROR'),
      code: 'NETWORK_ERROR',
    };
  }

  /**
   * Métodos públicos
   */
  async get<T>(endpoint: string, options?: HttpClientOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    options?: HttpClientOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    options?: HttpClientOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: HttpClientOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    options?: HttpClientOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Export singleton
export const httpClient = new HttpClient(API_BASE_URL);

// Export default para compatibilidade
export default httpClient;

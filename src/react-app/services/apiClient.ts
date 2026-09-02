/**
 * API Client - Compatibilidade retroativa
 *
 * @deprecated Use httpClient diretamente para novos códigos.
 * Este arquivo preserva tanto a API moderna por métodos quanto a assinatura
 * legada chamável ainda usada por algumas telas.
 */

export type { ApiResponse, HttpClientOptions as ApiClientOptions } from './http-client';

import { API_BASE_URL, fetchWithAuth } from '../config/api';
import { httpClient } from './http-client';
import type { ApiResponse, HttpClientOptions } from './http-client';

type ApiClientCompat = {
  <T = unknown>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  get<T>(endpoint: string, options?: HttpClientOptions): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, data?: unknown, options?: HttpClientOptions): Promise<ApiResponse<T>>;
  put<T>(endpoint: string, data?: unknown, options?: HttpClientOptions): Promise<ApiResponse<T>>;
  delete<T>(endpoint: string, options?: HttpClientOptions): Promise<ApiResponse<T>>;
  patch<T>(endpoint: string, data?: unknown, options?: HttpClientOptions): Promise<ApiResponse<T>>;
};

function resolveLegacyUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const base = API_BASE_URL.replace(/\/+$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (base.endsWith('/api') && normalizedEndpoint === '/api') return base;
  if (base.endsWith('/api') && normalizedEndpoint.startsWith('/api/')) {
    return `${base}${normalizedEndpoint.slice(4)}`;
  }

  return `${base}${normalizedEndpoint}`;
}

async function legacyRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetchWithAuth(resolveLegacyUrl(endpoint), options);
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (payload && typeof payload === 'object') {
      return payload as ApiResponse<T>;
    }
  } else {
    const text = await response.text();
    if (response.ok) {
      return { success: true, data: text as T };
    }
    return { success: false, error: text || response.statusText, code: response.status };
  }

  return {
    success: response.ok,
    error: response.ok ? undefined : response.statusText || 'Falha na requisição',
    code: response.ok ? undefined : response.status,
  };
}

// Mantém os consumidores modernos por método sem mudar a semântica do httpClient.
export const apiClient = Object.assign(legacyRequest, {
  get: <T>(endpoint: string, options?: HttpClientOptions) => httpClient.get<T>(endpoint, options),
  post: <T>(endpoint: string, data?: unknown, options?: HttpClientOptions) =>
    httpClient.post<T>(endpoint, data, options),
  put: <T>(endpoint: string, data?: unknown, options?: HttpClientOptions) =>
    httpClient.put<T>(endpoint, data, options),
  delete: <T>(endpoint: string, options?: HttpClientOptions) =>
    httpClient.delete<T>(endpoint, options),
  patch: <T>(endpoint: string, data?: unknown, options?: HttpClientOptions) =>
    httpClient.patch<T>(endpoint, data, options),
}) as ApiClientCompat;

export default apiClient;

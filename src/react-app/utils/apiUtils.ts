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

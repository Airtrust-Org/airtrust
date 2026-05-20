/**
 * Centralized API endpoints configuration
 * Avoid hardcoding URLs throughout the application
 *
 * Usage:
 * const res = await fetch(API_ENDPOINTS.qualificacoes.list);
 * const res = await fetch(API_ENDPOINTS.habilitacoes.get(5));
 */

import { API_BASE_URL } from '@/react-app/config/api';

function buildApiPath(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export const API_ENDPOINTS = {
  // Qualificações - Master-level certification/training types (immutable)
  qualificacoes: {
    list: buildApiPath('/qualificacoes'),
    create: buildApiPath('/qualificacoes'),
    get: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
    update: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
    delete: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
  },

  // Habilitações - Employee-level compliance records (instances)
  habilitacoes: {
    list: buildApiPath('/habilitacoes'),
    create: buildApiPath('/habilitacoes'),
    get: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
    update: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
    delete: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
  },

  // Certificados - Training certificates
  certificados: {
    list: buildApiPath('/certificados'),
    create: buildApiPath('/certificados'),
    get: (id: string | number) => buildApiPath(`/certificados/${id}`),
    update: (id: string | number) => buildApiPath(`/certificados/${id}`),
    delete: (id: string | number) => buildApiPath(`/certificados/${id}`),
  },

  // System health check
  system: {
    health: buildApiPath('/sistema/health'),
    status: buildApiPath('/sistema/status'),
  },
};

/**
 * Helper function to build query parameters
 * Usage: buildQueryParams({ page: 1, limit: 10, search: 'test' })
 */
export function buildQueryParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Build full endpoint URL with query parameters
 * Usage: buildEndpoint(API_ENDPOINTS.qualificacoes.list, { page: 1, limit: 10 })
 */
export function buildEndpoint(endpoint: string, params?: Record<string, any>): string {
  if (!params) return endpoint;
  return endpoint + buildQueryParams(params);
}

/**
 * Default fetch options with error handling
 */
export const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Standardized error response type
 */
export interface ApiError {
  error: string;
  details?: any;
  statusCode?: number;
}

/**
 * Standardized success response type
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

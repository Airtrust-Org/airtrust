import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

// ============================================================================
// Query Keys Pattern
// ============================================================================

export const certificadosKeys = {
  all: ['certificados'] as const,
  lists: () => [...certificadosKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...certificadosKeys.lists(), { filters, pagination }] as const,
  details: () => [...certificadosKeys.all, 'detail'] as const,
  detail: (id: string) => [...certificadosKeys.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook para listar certificados com suporte a filtros e paginação
 */
export function useCertificados(
  filters?: Record<string, any>,
  pagination?: Record<string, any>,
  options?: UseQueryOptions,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFn: any = async () => {
    const params = new URLSearchParams();
    if (filters) Object.entries(filters).forEach(([k, v]) => v && params.append(k, String(v)));
    if (pagination)
      Object.entries(pagination).forEach(([k, v]) => v && params.append(k, String(v)));
    return api.get(`/certificados?${params.toString()}`);
  };

  return useQuery({
    queryKey: certificadosKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

/**
 * Hook para buscar um certificado específico por ID
 */
export function useCertificado(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: certificadosKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/certificados/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

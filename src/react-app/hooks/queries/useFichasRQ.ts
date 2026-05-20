import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

// ============================================================================
// Query Keys Pattern
// ============================================================================

export const fichasKeys = {
  all: ['fichas'] as const,
  lists: () => [...fichasKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...fichasKeys.lists(), { filters, pagination }] as const,
  details: () => [...fichasKeys.all, 'detail'] as const,
  detail: (id: string) => [...fichasKeys.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook para listar fichas de avaliação com suporte a filtros e paginação
 */
export function useFichas(
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
    return api.get(`/fichas?${params.toString()}`);
  };

  return useQuery({
    queryKey: fichasKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

/**
 * Hook para buscar uma ficha específica por ID
 */
export function useFicha(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: fichasKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/fichas/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

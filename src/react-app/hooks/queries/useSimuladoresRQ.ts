import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { simuladoresService } from '@/services/simuladores.service';

// ============================================================================
// Query Keys Pattern
// ============================================================================

export const simuladoresKeys = {
  all: ['simuladores'] as const,
  lists: () => [...simuladoresKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...simuladoresKeys.lists(), { filters, pagination }] as const,
  details: () => [...simuladoresKeys.all, 'detail'] as const,
  detail: (id: string) => [...simuladoresKeys.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook para listar simuladores com suporte a filtros e paginação
 */
export function useSimuladores(
  filters?: Record<string, any>,
  pagination?: Record<string, any>,
  options?: UseQueryOptions,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFn: any = () => simuladoresService.listar(filters, pagination);

  return useQuery({
    queryKey: simuladoresKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

/**
 * Hook para buscar um simulador específico por ID
 */
export function useSimulador(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: simuladoresKeys.detail(id || ''),
    queryFn: () => (id ? simuladoresService.buscarPorId(id) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

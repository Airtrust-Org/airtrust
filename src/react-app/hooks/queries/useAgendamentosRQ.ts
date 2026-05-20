import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { agendamentosService } from '@/services/agendamentos.service';

// ============================================================================
// Query Keys Pattern
// ============================================================================

export const agendamentosKeys = {
  all: ['agendamentos'] as const,
  lists: () => [...agendamentosKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...agendamentosKeys.lists(), { filters, pagination }] as const,
  details: () => [...agendamentosKeys.all, 'detail'] as const,
  detail: (id: string) => [...agendamentosKeys.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook para listar agendamentos com suporte a filtros e paginação
 */
export function useAgendamentos(
  filters?: Record<string, any>,
  pagination?: Record<string, any>,
  options?: UseQueryOptions,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFn: any = () => agendamentosService.listar(filters, pagination);

  return useQuery({
    queryKey: agendamentosKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

/**
 * Hook para buscar um agendamento específico por ID
 */
export function useAgendamento(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: agendamentosKeys.detail(id || ''),
    queryFn: () => (id ? agendamentosService.buscarPorId(id) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { qualificacoesService } from '@/services/qualificacoes.service';

// ============================================================================
// Query Keys Pattern
// ============================================================================

export const qualificacoesKeys = {
  all: ['qualificacoes'] as const,
  lists: () => [...qualificacoesKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...qualificacoesKeys.lists(), { filters, pagination }] as const,
  details: () => [...qualificacoesKeys.all, 'detail'] as const,
  detail: (id: string) => [...qualificacoesKeys.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook para listar qualificações com suporte a filtros e paginação
 */
export function useQualificacoes(
  filters?: Record<string, any>,
  pagination?: Record<string, any>,
  options?: UseQueryOptions,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFn: any = () => qualificacoesService.listar(filters, pagination);

  return useQuery({
    queryKey: qualificacoesKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

/**
 * Hook para buscar uma qualificação específica por ID
 */
export function useQualificacao(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: qualificacoesKeys.detail(id || ''),
    queryFn: () => (id ? qualificacoesService.buscarPorId(id) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

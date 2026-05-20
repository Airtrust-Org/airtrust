import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { funcionariosService } from '@/services/funcionarios.service';
import { Funcionario, FiltrosFuncionarios, PaginacaoParams } from '@/types';

/**
 * React Query Keys for Funcionários queries
 * Used for caching, invalidation, and deduplication
 */
export const funcionariosKeys = {
  all: ['funcionarios'] as const,
  lists: () => [...funcionariosKeys.all, 'list'] as const,
  list: (filters: FiltrosFuncionarios = {}, pagination: PaginacaoParams = {}) =>
    [...funcionariosKeys.lists(), { filters, pagination }] as const,
  details: () => [...funcionariosKeys.all, 'detail'] as const,
  detail: (id: string) => [...funcionariosKeys.details(), id] as const,
};

type ListResponse = { data: Funcionario[]; total: number; page: number };

/**
 * Hook para listar funcionários com React Query
 *
 * Features:
 * - Automatic caching (5-10 min)
 * - Automatic refetching on window focus
 * - Error handling
 * - Loading states
 */
export function useFuncionarios(
  filters: FiltrosFuncionarios = {},
  pagination: PaginacaoParams = {},
  options?: Omit<UseQueryOptions<ListResponse>, 'queryKey' | 'queryFn'>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryFn: any = () => funcionariosService.listar(filters, pagination);

  return useQuery<ListResponse>({
    queryKey: funcionariosKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

/**
 * Hook para buscar um funcionário específico
 *
 * @example
 * const { data: funcionario } = useFuncionario('123');
 */
export function useFuncionario(id: string, options?: UseQueryOptions<Funcionario>) {
  return useQuery({
    queryKey: funcionariosKeys.detail(id),
    queryFn: () => funcionariosService.buscarPorId(id),
    enabled: !!id, // Só executa se id existir
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

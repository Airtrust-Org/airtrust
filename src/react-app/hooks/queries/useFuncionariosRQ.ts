import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { funcionariosService } from '@/services/funcionarios.service';
import { Funcionario, FiltrosFuncionarios, PaginacaoParams } from '@/types';
import { useAuth } from '@/react-app/hooks/useAuth';
import { tenantQueryKey } from '@/react-app/lib/query-client';

export const funcionariosKeys = {
  all: (empresaId?: number | null) => tenantQueryKey(empresaId, 'funcionarios'),
  lists: (empresaId?: number | null) => [...funcionariosKeys.all(empresaId), 'list'] as const,
  list: (
    filters: FiltrosFuncionarios = {},
    pagination: PaginacaoParams = {},
    empresaId?: number | null,
  ) => [...funcionariosKeys.lists(empresaId), { filters, pagination }] as const,
  details: (empresaId?: number | null) => [...funcionariosKeys.all(empresaId), 'detail'] as const,
  detail: (id: string, empresaId?: number | null) =>
    [...funcionariosKeys.details(empresaId), id] as const,
};

type ListResponse = { data: Funcionario[]; total: number; page: number };

export function useFuncionarios(
  filters: FiltrosFuncionarios = {},
  pagination: PaginacaoParams = {},
  options?: Omit<UseQueryOptions<ListResponse>, 'queryKey' | 'queryFn'>,
) {
  const { empresaAtualId } = useAuth();
  return useQuery<ListResponse>({
    queryKey: funcionariosKeys.list(filters, pagination, empresaAtualId),
    queryFn: () => funcionariosService.listar(filters, pagination),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
    enabled: Boolean(empresaAtualId) && (options?.enabled ?? true),
  });
}

export function useFuncionario(id: string, options?: UseQueryOptions<Funcionario>) {
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: funcionariosKeys.detail(id, empresaAtualId),
    queryFn: () => funcionariosService.buscarPorId(id),
    staleTime: 5 * 60 * 1000,
    ...options,
    enabled: Boolean(id && empresaAtualId) && (options?.enabled ?? true),
  });
}

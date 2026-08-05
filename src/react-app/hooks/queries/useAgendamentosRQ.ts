import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { agendamentosService } from '@/services/agendamentos.service';
import { useAuth } from '@/react-app/hooks/useAuth';
import { tenantQueryKey } from '@/react-app/lib/query-client';

export const agendamentosKeys = {
  all: (empresaId?: number | null) => tenantQueryKey(empresaId, 'agendamentos'),
  lists: (empresaId?: number | null) => [...agendamentosKeys.all(empresaId), 'list'] as const,
  list: (
    filters?: Record<string, unknown>,
    pagination?: Record<string, unknown>,
    empresaId?: number | null,
  ) => [...agendamentosKeys.lists(empresaId), { filters, pagination }] as const,
  details: (empresaId?: number | null) => [...agendamentosKeys.all(empresaId), 'detail'] as const,
  detail: (id: string, empresaId?: number | null) =>
    [...agendamentosKeys.details(empresaId), id] as const,
};

export function useAgendamentos(
  filters?: Record<string, unknown>,
  pagination?: Record<string, unknown>,
  options?: UseQueryOptions,
) {
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: agendamentosKeys.list(filters, pagination, empresaAtualId),
    queryFn: () => agendamentosService.listar(filters, pagination),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
    enabled: Boolean(empresaAtualId) && (options?.enabled ?? true),
  });
}

export function useAgendamento(id?: string, options?: UseQueryOptions) {
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: agendamentosKeys.detail(id || '', empresaAtualId),
    queryFn: () => (id ? agendamentosService.buscarPorId(id) : Promise.reject()),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
    enabled: Boolean(id && empresaAtualId) && (options?.enabled ?? true),
  });
}

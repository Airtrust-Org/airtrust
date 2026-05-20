import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

export const treinamentosKeys = {
  all: ['treinamentos'] as const,
  lists: () => [...treinamentosKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...treinamentosKeys.lists(), { filters, pagination }] as const,
  details: () => [...treinamentosKeys.all, 'detail'] as const,
  detail: (id: string) => [...treinamentosKeys.details(), id] as const,
};

export function useTreinamentos(
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
    return api.get(`/treinamentos?${params.toString()}`);
  };

  return useQuery({
    queryKey: treinamentosKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

export function useTreinamento(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: treinamentosKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/treinamentos/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

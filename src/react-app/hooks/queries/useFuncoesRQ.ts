import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

export const funcoesKeys = {
  all: ['funcoes'] as const,
  lists: () => [...funcoesKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...funcoesKeys.lists(), { filters, pagination }] as const,
  details: () => [...funcoesKeys.all, 'detail'] as const,
  detail: (id: string) => [...funcoesKeys.details(), id] as const,
};

export function useFuncoes(
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
    return api.get(`/funcoes?${params.toString()}`);
  };

  return useQuery({
    queryKey: funcoesKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

export function useFuncao(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: funcoesKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/funcoes/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

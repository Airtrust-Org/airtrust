import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

export const empresasKeys = {
  all: ['empresas'] as const,
  lists: () => [...empresasKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...empresasKeys.lists(), { filters, pagination }] as const,
  details: () => [...empresasKeys.all, 'detail'] as const,
  detail: (id: string) => [...empresasKeys.details(), id] as const,
};

export function useEmpresas(
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
    return api.get(`/empresas?${params.toString()}`);
  };

  return useQuery({
    queryKey: empresasKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

export function useEmpresa(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: empresasKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/empresas/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

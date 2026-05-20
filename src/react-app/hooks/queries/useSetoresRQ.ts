import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

export const setoresKeys = {
  all: ['setores'] as const,
  lists: () => [...setoresKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...setoresKeys.lists(), { filters, pagination }] as const,
  details: () => [...setoresKeys.all, 'detail'] as const,
  detail: (id: string) => [...setoresKeys.details(), id] as const,
};

export function useSetores(
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
    return api.get(`/setores?${params.toString()}`);
  };

  return useQuery({
    queryKey: setoresKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

export function useSetor(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: setoresKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/setores/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

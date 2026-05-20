import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';

export const aeronavesKeys = {
  all: ['aeronaves'] as const,
  lists: () => [...aeronavesKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>, pagination?: Record<string, any>) =>
    [...aeronavesKeys.lists(), { filters, pagination }] as const,
  details: () => [...aeronavesKeys.all, 'detail'] as const,
  detail: (id: string) => [...aeronavesKeys.details(), id] as const,
};

export function useAeronaves(
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
    return api.get(`/aeronaves?${params.toString()}`);
  };

  return useQuery({
    queryKey: aeronavesKeys.list(filters, pagination),
    queryFn,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
    ...options,
  });
}

export function useAeronave(id?: string, options?: UseQueryOptions) {
  return useQuery({
    queryKey: aeronavesKeys.detail(id || ''),
    queryFn: () => (id ? api.get(`/aeronaves/${id}`) : Promise.reject()),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    ...options,
  });
}

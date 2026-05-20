import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { empresasKeys } from '../queries/useEmpresasRQ';

export function useCreateEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/empresas', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: empresasKeys.lists() });
    },
  });
}

export function useUpdateEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/empresas/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: empresasKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: empresasKeys.lists() });
    },
  });
}

export function useDeleteEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/empresas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: empresasKeys.lists() });
    },
  });
}

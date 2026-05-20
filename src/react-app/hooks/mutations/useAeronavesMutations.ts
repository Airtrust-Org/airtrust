import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { aeronavesKeys } from '../queries/useAeronavesRQ';

export function useCreateAeronave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/aeronaves', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aeronavesKeys.lists() });
    },
  });
}

export function useUpdateAeronave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/aeronaves/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aeronavesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: aeronavesKeys.lists() });
    },
  });
}

export function useDeleteAeronave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/aeronaves/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aeronavesKeys.lists() });
    },
  });
}

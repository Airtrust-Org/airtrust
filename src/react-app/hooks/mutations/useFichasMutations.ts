import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { fichasKeys } from '../queries/useFichasRQ';

export function useCreateFicha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/fichas', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fichasKeys.lists() });
    },
  });
}

export function useUpdateFicha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/fichas/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: fichasKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: fichasKeys.lists() });
    },
  });
}

export function useDeleteFicha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/fichas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fichasKeys.lists() });
    },
  });
}

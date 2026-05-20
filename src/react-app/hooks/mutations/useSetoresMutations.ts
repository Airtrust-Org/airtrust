import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { setoresKeys } from '../queries/useSetoresRQ';

export function useCreateSetor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/setores', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setoresKeys.lists() });
    },
  });
}

export function useUpdateSetor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/setores/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: setoresKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: setoresKeys.lists() });
    },
  });
}

export function useDeleteSetor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/setores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setoresKeys.lists() });
    },
  });
}

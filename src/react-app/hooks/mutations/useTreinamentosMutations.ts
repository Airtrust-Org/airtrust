import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { treinamentosKeys } from '../queries/useTreinamentosRQ';

export function useCreateTreinamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/treinamentos', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treinamentosKeys.lists() });
    },
  });
}

export function useUpdateTreinamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/treinamentos/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: treinamentosKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: treinamentosKeys.lists() });
    },
  });
}

export function useDeleteTreinamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/treinamentos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treinamentosKeys.lists() });
    },
  });
}

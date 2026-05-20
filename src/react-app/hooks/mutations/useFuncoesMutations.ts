import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/react-app/services/apiClient';
import { funcoesKeys } from '../queries/useFuncoesRQ';

export function useCreateFuncao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/funcoes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: funcoesKeys.lists() });
    },
  });
}

export function useUpdateFuncao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/funcoes/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: funcoesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: funcoesKeys.lists() });
    },
  });
}

export function useDeleteFuncao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/funcoes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: funcoesKeys.lists() });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qualificacoesService } from '@/services/qualificacoes.service';
import { qualificacoesKeys } from '../queries/useQualificacoesRQ';

export function useCreateQualificacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => qualificacoesService.criar(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qualificacoesKeys.lists() });
    },
  });
}

export function useUpdateQualificacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => qualificacoesService.atualizar(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: qualificacoesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: qualificacoesKeys.lists() });
    },
  });
}

export function useDeleteQualificacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => qualificacoesService.excluir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qualificacoesKeys.lists() });
    },
  });
}

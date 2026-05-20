import { useMutation, useQueryClient } from '@tanstack/react-query';
import { simuladoresService } from '@/services/simuladores.service';
import { simuladoresKeys } from '../queries/useSimuladoresRQ';

export function useCreateSimulador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => simuladoresService.criar(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simuladoresKeys.lists() });
    },
  });
}

export function useUpdateSimulador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => simuladoresService.atualizar(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: simuladoresKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: simuladoresKeys.lists() });
    },
  });
}

export function useDeleteSimulador() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => simuladoresService.excluir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simuladoresKeys.lists() });
    },
  });
}

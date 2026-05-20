import { useMutation, useQueryClient } from '@tanstack/react-query';
import { agendamentosService } from '@/services/agendamentos.service';
import { agendamentosKeys } from '../queries/useAgendamentosRQ';

export function useCreateAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => agendamentosService.criar(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agendamentosKeys.lists() });
    },
  });
}

export function useUpdateAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: any) => agendamentosService.atualizar(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: agendamentosKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: agendamentosKeys.lists() });
    },
  });
}

export function useDeleteAgendamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agendamentosService.excluir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agendamentosKeys.lists() });
    },
  });
}

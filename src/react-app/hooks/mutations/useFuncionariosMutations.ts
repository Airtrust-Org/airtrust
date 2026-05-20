import { useMutation, useQueryClient } from '@tanstack/react-query';
import { funcionariosService } from '@/services/funcionarios.service';
import { Funcionario, FuncionarioCreate, FuncionarioUpdate } from '@/types';
import { funcionariosKeys } from '../queries/useFuncionariosRQ';

/**
 * Hook to create a new Funcionário
 * Automatically invalidates lists after success
 */
export function useCreateFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FuncionarioCreate) => funcionariosService.criar(data),
    onSuccess: () => {
      // Invalidate all funcionarios lists to force refetch
      queryClient.invalidateQueries({ queryKey: funcionariosKeys.lists() });
    },
  });
}

/**
 * Hook to update a Funcionário
 * Automatically invalidates relevant cached data
 */
export function useUpdateFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FuncionarioUpdate }) =>
      funcionariosService.atualizar(id, data),
    onSuccess: (data: Funcionario) => {
      // Invalidate detail and lists
      queryClient.invalidateQueries({ queryKey: funcionariosKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: funcionariosKeys.lists() });
    },
  });
}

/**
 * Hook to delete a Funcionário
 * Automatically invalidates lists
 */
export function useDeleteFuncionario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => funcionariosService.excluir(id),
    onSuccess: () => {
      // Invalidate lists (detail is already deleted)
      queryClient.invalidateQueries({ queryKey: funcionariosKeys.lists() });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { listarFuncionariosAtivos } from '@/react-app/services/qualificacoesService';

export function useFuncionariosAtivos(enabled = true) {
  return useQuery({
    queryKey: ['funcionarios-ativos'],
    queryFn: async () => {
      const res = await listarFuncionariosAtivos();
      if (!res.success) throw new Error(res.error || 'Falha ao carregar funcionários');
      return res.data || [];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

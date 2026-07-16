import { useQuery } from '@tanstack/react-query';
import { listarTiposQualificacao } from '@/react-app/services/qualificacoesService';

export function useTiposQualificacao() {
  return useQuery({
    queryKey: ['tipos-qualificacao'],
    queryFn: async () => {
      const res = await listarTiposQualificacao();
      return res || [];
    },
    staleTime: 1000 * 60 * 10, // 10min — static reference data
  });
}

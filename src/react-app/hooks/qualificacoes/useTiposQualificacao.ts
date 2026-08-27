import { useQuery } from '@tanstack/react-query';
import { listarTiposQualificacao } from '@/react-app/services/qualificacoesService';

export function useTiposQualificacao(categoriaId?: number | null) {
  const normalizedCategoriaId =
    categoriaId && Number.isFinite(categoriaId) && categoriaId > 0 ? categoriaId : undefined;

  return useQuery({
    queryKey: ['tipos-qualificacao', normalizedCategoriaId ?? 'all'],
    queryFn: async () => {
      const res = await listarTiposQualificacao(1000, normalizedCategoriaId);
      if (!res.success) throw new Error(res.error || 'Falha ao carregar tipos');
      return res.data || [];
    },
    staleTime: 1000 * 60 * 10, // 10min — static reference data
  });
}

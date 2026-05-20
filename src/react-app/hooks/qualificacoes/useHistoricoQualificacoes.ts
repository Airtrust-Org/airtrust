import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  listarHistoricoQualificacoes,
  HistoricoFiltros,
} from '@/react-app/services/qualificacoesService';

export interface UseHistoricoOptions extends HistoricoFiltros {
  enabled?: boolean;
}

export function useHistoricoQualificacoes(filtros: UseHistoricoOptions = {}) {
  const { enabled = true, ...queryFiltros } = filtros;
  return useQuery({
    queryKey: ['historico-qualificacoes', queryFiltros],
    queryFn: async () => {
      const res = await listarHistoricoQualificacoes(queryFiltros);
      if (!res.success) throw new Error(res.error || 'Falha ao carregar histórico');
      return res;
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
}

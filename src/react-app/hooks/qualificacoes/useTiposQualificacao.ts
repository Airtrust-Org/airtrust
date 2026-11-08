import { useQuery } from '@tanstack/react-query';
import {
  buscarTipoQualificacaoPorId,
  listarTiposQualificacao,
} from '@/react-app/services/qualificacoesService';

/**
 * Para editar uma qualificação, resolve primeiro o modelo pelo ID canônico,
 * em vez de depender da primeira página (máximo 500) do catálogo inteiro.
 */
export function useTiposQualificacao(
  categoriaId?: number | null,
  enabled = true,
  tipoIdEdicao?: string | number | null,
) {
  const normalizedCategoriaId =
    categoriaId && Number.isFinite(categoriaId) && categoriaId > 0 ? categoriaId : undefined;
  const selectedId = tipoIdEdicao == null ? '' : String(tipoIdEdicao).trim();

  return useQuery({
    queryKey: ['tipos-qualificacao', normalizedCategoriaId ?? 'all', selectedId || 'none'],
    queryFn: async () => {
      // Em edição, buscar o modelo exato; não usar GET /tipos sem categoria,
      // que trunca em 500 linhas e impede resolver categoria/validade.
      if (!normalizedCategoriaId && selectedId) {
        const res = await buscarTipoQualificacaoPorId(selectedId);
        if (!res?.success || !res.data) {
          throw new Error(res?.error || 'Modelo vinculado não encontrado.');
        }
        return [res.data];
      }

      const res = await listarTiposQualificacao(500, normalizedCategoriaId);
      if (!res?.success) throw new Error(res?.error || 'Falha ao carregar tipos');
      const tipos = res.data || [];
      if (!selectedId || tipos.some((tipo) => String(tipo.id) === selectedId)) {
        return tipos;
      }

      // Mesmo com mais de 500 modelos na categoria, preservar a edição
      // do registro associado sem permitir seleção de modelos de outra categoria.
      const selecionado = await buscarTipoQualificacaoPorId(selectedId);
      if (!selecionado?.success || !selecionado.data) {
        throw new Error(selecionado?.error || 'Modelo vinculado não encontrado.');
      }
      return Number(selecionado.data.categoria_id) === normalizedCategoriaId
        ? [selecionado.data, ...tipos]
        : tipos;
    },
    enabled,
    staleTime: selectedId ? 0 : 1000 * 60 * 10,
  });
}

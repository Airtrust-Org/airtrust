import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/react-app/hooks/useAuth';
import { httpClient } from '@/react-app/services/http-client';

export interface CategoriaQualificacaoCanonica {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  ativo: boolean;
  ordem: number;
}

/** Canonical category catalogue. Never derive form options from qualification types. */
export function useCategoriasQualificacao() {
  const { empresaAtualId } = useAuth();

  return useQuery({
    queryKey: ['qualificacoes-categorias-canonicas', empresaAtualId],
    queryFn: async () => {
      const response = await httpClient.get<CategoriaQualificacaoCanonica[]>('/categorias?ativo=1');
      if (!response.success) throw new Error(response.error || 'Falha ao carregar categorias');
      return response.data || [];
    },
    enabled: Boolean(empresaAtualId),
    staleTime: 1000 * 60 * 10,
  });
}

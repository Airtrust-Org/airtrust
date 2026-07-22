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

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * O httpClient encapsula o corpo HTTP em ApiResponse<T>, enquanto os endpoints
 * legados do Worker já retornam { success, data }. Este normalizador aceita os
 * dois formatos e falha fechado para contratos inesperados.
 */
export function normalizeCategoriasQualificacaoResponse(
  payload: unknown,
): CategoriaQualificacaoCanonica[] {
  if (Array.isArray(payload)) {
    return payload as CategoriaQualificacaoCanonica[];
  }

  if (!isRecord(payload)) {
    throw new Error('Resposta inválida ao carregar categorias de qualificações');
  }

  const envelope = payload as ApiEnvelope;
  if (envelope.success === false) {
    throw new Error(envelope.error || 'Falha ao carregar categorias');
  }

  if (!Array.isArray(envelope.data)) {
    throw new Error('Resposta inválida ao carregar categorias de qualificações');
  }

  return envelope.data as CategoriaQualificacaoCanonica[];
}

/** Canonical category catalogue. Never derive form options from qualification types. */
export function useCategoriasQualificacao() {
  const { empresaAtualId } = useAuth();

  return useQuery({
    queryKey: ['qualificacoes-categorias-canonicas', empresaAtualId],
    queryFn: async () => {
      const response = await httpClient.get<unknown>('/categorias?ativo=1');
      if (!response.success) throw new Error(response.error || 'Falha ao carregar categorias');
      return normalizeCategoriasQualificacaoResponse(response.data);
    },
    enabled: Boolean(empresaAtualId),
    staleTime: 1000 * 60 * 10,
  });
}

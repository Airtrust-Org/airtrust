/**
 * Hook para sessões de simulador (Módulo 3)
 * Endpoint: /api/sessoes
 */

import { useApi } from './useApi';

export interface Sessao {
  id: string;
  nome: string;
  descricao: string;
  data_sessao: string;
  duracao: number;
  tipo_simulador: string;
  status: string;
  instrutor_id: number;
  instrutor_nome?: string;
  funcionarios_nomes?: string;
  total_participantes: number;
  created_at: string;
}

export interface SessaoDetalhada extends Sessao {
  participantes: Array<{
    id: number;
    funcionario_id: number;
    funcao: string;
    status: string;
    funcionario_nome: string;
    funcionario_matricula: string;
  }>;
}

export interface Manobra {
  id: number;
  sessao_id: string;
  tipo_manobra: string;
  nota: number;
  observacoes?: string;
  created_at: string;
}

/**
 * Hook para listar sessões
 * @param limit Quantidade máxima de resultados (padrão: 50)
 */
export function useSessoes(limit = 50) {
  const { data, loading, error, refetch } = useApi<Sessao[]>(`/api/sessoes?limit=${limit}`, {
    enabled: true,
  });

  return {
    sessoes: data || [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook para buscar sessão específica com participantes
 * @param id ID da sessão
 * @param enabled Se deve executar a busca (padrão: true se id fornecido)
 */
export function useSessao(id?: string) {
  const { data, loading, error, refetch } = useApi<SessaoDetalhada>(
    id ? `/api/sessoes/${id}` : '',
    { enabled: !!id },
  );

  return {
    sessao: data,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook para listar manobras de uma sessão
 * @param sessaoId ID da sessão
 * @param enabled Se deve executar a busca (padrão: true se sessaoId fornecido)
 */
export function useManobrasSessao(sessaoId?: string) {
  const { data, loading, error, refetch } = useApi<Manobra[]>(
    sessaoId ? `/api/sessoes/${sessaoId}/manobras` : '',
    { enabled: !!sessaoId },
  );

  return {
    manobras: data || [],
    loading,
    error,
    refetch,
  };
}

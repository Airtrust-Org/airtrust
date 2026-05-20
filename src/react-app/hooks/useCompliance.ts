/**
 * Hook para compliance (Módulo 7)
 * Endpoint: /api/compliance
 */

import { useApi } from './useApi';

export interface Compliance {
  id: number;
  funcionario_id: number;
  treinamento_id: number;
  status: 'EM_DIA' | 'VENCENDO' | 'VENCIDO' | 'PENDENTE';
  data_ultima_certificacao: string;
  data_vencimento: string;
  dias_para_vencimento: number;
  funcionario_nome: string;
  funcao: string;
  base: string;
  treinamento_codigo: string;
  treinamento_nome: string;
  treinamento_categoria: string;
}

export interface ComplianceStats {
  total_registros: number;
  em_dia: number;
  vencendo: number;
  vencido: number;
  pendente: number;
}

export interface ComplianceResponse {
  data: Compliance[];
  stats: ComplianceStats;
}

/**
 * Hook para listar registros de compliance
 * @param funcionarioId Filtro opcional por funcionário
 * @param status Filtro opcional por status
 * @param limit Quantidade máxima de resultados (padrão: 100)
 */
export function useCompliance(
  funcionarioId?: number,
  status?: 'EM_DIA' | 'VENCENDO' | 'VENCIDO' | 'PENDENTE',
  limit = 100,
) {
  let endpoint = `/api/compliance?limit=${limit}`;

  if (funcionarioId) {
    endpoint += `&funcionario_id=${funcionarioId}`;
  }

  if (status) {
    endpoint += `&status=${status}`;
  }

  const { data, loading, error, refetch } = useApi<ComplianceResponse>(endpoint, { enabled: true });

  return {
    compliance: data?.data || [],
    stats: data?.stats || {
      total_registros: 0,
      em_dia: 0,
      vencendo: 0,
      vencido: 0,
      pendente: 0,
    },
    loading,
    error,
    refetch,
  };
}

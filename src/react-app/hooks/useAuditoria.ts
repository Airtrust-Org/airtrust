/**
 * Hook para auditoria (Módulo 8)
 * Endpoint: /api/auditoria-logs
 */

import { useApi } from './useApi';

export interface LogAuditoria {
  id: number;
  usuario_id: number;
  acao: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  tabela: string;
  registro_id: string;
  timestamp: string;
  ip_address: string;
  detalhes?: string;
}

export interface AuditoriaStats {
  total_logs: number;
  total_tabelas: number;
  total_acoes: number;
  total_usuarios: number;
  ultimo_log: string;
}

export interface TopAcao {
  acao: string;
  quantidade: number;
}

export interface TopTabela {
  tabela: string;
  quantidade: number;
}

export interface AuditoriaStatsResponse {
  stats: AuditoriaStats;
  topAcoes: TopAcao[];
  topTabelas: TopTabela[];
}

/**
 * Hook para listar logs de auditoria
 * @param tabela Filtro opcional por tabela
 * @param acao Filtro opcional por ação
 * @param limit Quantidade máxima de resultados (padrão: 100)
 */
export function useAuditoria(
  tabela?: string,
  acao?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE',
  limit = 100,
) {
  let endpoint = `/api/auditoria-logs?limit=${limit}`;

  if (tabela) {
    endpoint += `&tabela=${tabela}`;
  }

  if (acao) {
    endpoint += `&acao=${acao}`;
  }

  const { data, loading, error, refetch } = useApi<LogAuditoria[]>(endpoint, { enabled: true });

  return {
    logs: data || [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook para buscar estatísticas de auditoria
 */
export function useAuditoriaStats() {
  const { data, loading, error, refetch } = useApi<AuditoriaStatsResponse>(
    `/api/auditoria-logs/stats`,
    { enabled: true },
  );

  return {
    stats: data?.stats || {
      total_logs: 0,
      total_tabelas: 0,
      total_acoes: 0,
      total_usuarios: 0,
      ultimo_log: '',
    },
    topAcoes: data?.topAcoes || [],
    topTabelas: data?.topTabelas || [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook para buscar um log específico
 * @param id ID do log
 * @param enabled Se deve executar a busca (padrão: true se id fornecido)
 */
export function useLogAuditoria(id?: number) {
  const { data, loading, error, refetch } = useApi<LogAuditoria>(
    id ? `/api/auditoria-logs/${id}` : '',
    { enabled: !!id },
  );

  return {
    log: data,
    loading,
    error,
    refetch,
  };
}

import { useQuery, UseQueryResult } from '@tanstack/react-query';
// Delegar implementação principal de tipos para versão consolidada em react-app/hooks
export { useQualificacoes } from '../../react-app/hooks/useQualificacoes';

// OBS: Mantemos demais hooks (useQualificacaoById, useQualificacoesCompletas, etc.) aqui.

// ============================================
// Types
// ============================================
interface Qualificacao {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
}

interface QualificacaoCompleta extends Qualificacao {
  alertas_vencimento?: number;
  dashboard_stats?: {
    total_funcionarios: number;
    vencidas: number;
    proximas_vencer: number;
  };
}

interface Historico {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  qualificacao_id: number;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  data_conclusao: string;
  data_vencimento: string;
  resultado: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

interface Categoria {
  id: number;
  nome: string;
  descricao?: string;
  codigo?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  total?: number;
  error?: string;
  details?: string;
}

// ============================================
// Helper: Fetch wrapper com tratamento de erro
// ============================================
const fetchAPI = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
};

// ============================================
// useQualificacoes - Lista simples (dropdowns)
// ============================================
export const useQualificacoes = (): UseQueryResult<Qualificacao[], Error> => {
  return useQuery({
    queryKey: ['qualificacoes-list'],
    queryFn: async () => {
      const response = await fetchAPI<ApiResponse<Qualificacao[]>>('/api/qualificacoes-list');
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 10, // 10 minutos (formerly cacheTime)
  });
};

// ============================================
// useQualificacaoById - Busca individual
// ============================================
export const useQualificacaoById = (id: number | null): UseQueryResult<Qualificacao, Error> => {
  return useQuery({
    queryKey: ['qualificacoes-list', id],
    queryFn: async () => {
      if (!id) throw new Error('ID is required');
      const response = await fetchAPI<ApiResponse<Qualificacao>>(`/api/qualificacoes-list/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10, // 10 minutos
    gcTime: 1000 * 60 * 20, // 20 minutos
  });
};

// ============================================
// useQualificacoesCompletas - Com alerts e stats
// ============================================
export const useQualificacoesCompletas = (): UseQueryResult<QualificacaoCompleta[], Error> => {
  return useQuery({
    queryKey: ['qualificacoes-completas'],
    queryFn: async () => {
      const response = await fetchAPI<ApiResponse<QualificacaoCompleta[]>>('/api/qualificacoes');
      return response.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutos (complexidade maior)
    gcTime: 1000 * 60 * 5, // 5 minutos
  });
};

// ============================================
// useHistorico - Histórico de qualificações
// ============================================
interface HistoricoQueryParams {
  funcionario_id?: number;
  qualificacao_id?: number;
  limit?: number;
  offset?: number;
}

export const useHistorico = (params?: HistoricoQueryParams): UseQueryResult<Historico[], Error> => {
  return useQuery({
    queryKey: ['historico', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.funcionario_id)
        queryParams.append('funcionario_id', params.funcionario_id.toString());
      if (params?.qualificacao_id)
        queryParams.append('qualificacao_id', params.qualificacao_id.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());

      const url = `/api/historico${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const response = await fetchAPI<ApiResponse<Historico[]>>(url);
      return response.data;
    },
    staleTime: 1000 * 60 * 3, // 3 minutos
    gcTime: 1000 * 60 * 10, // 10 minutos
  });
};

// ============================================
// useHistoricoById - Busca individual
// ============================================
export const useHistoricoById = (id: number | null): UseQueryResult<Historico, Error> => {
  return useQuery({
    queryKey: ['historico', id],
    queryFn: async () => {
      if (!id) throw new Error('ID is required');
      const response = await fetchAPI<ApiResponse<Historico>>(`/api/historico/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10, // 10 minutos
    gcTime: 1000 * 60 * 20, // 20 minutos
  });
};

// ============================================
// useHistoricoPorFuncionario - Por funcionário
// ============================================
export const useHistoricoPorFuncionario = (
  funcionarioId: number | null,
): UseQueryResult<Historico[], Error> => {
  return useQuery({
    queryKey: ['historico', 'funcionario', funcionarioId],
    queryFn: async () => {
      if (!funcionarioId) throw new Error('Funcionário ID is required');
      const response = await fetchAPI<ApiResponse<Historico[]>>(
        `/api/historico?funcionario_id=${funcionarioId}`,
      );
      return response.data;
    },
    enabled: !!funcionarioId,
    staleTime: 1000 * 60 * 3, // 3 minutos
    gcTime: 1000 * 60 * 10, // 10 minutos
  });
};

// ============================================
// useCategorias - Categorias de qualificações
// ============================================
export const useCategorias = (): UseQueryResult<Categoria[], Error> => {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const response = await fetchAPI<ApiResponse<Categoria[]>>('/api/categorias');
      return response.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutos (muda raramente)
    gcTime: 1000 * 60 * 60, // 1 hora
  });
};

// ============================================
// useCategoriaById - Busca individual
// ============================================
export const useCategoriaById = (id: number | null): UseQueryResult<Categoria, Error> => {
  return useQuery({
    queryKey: ['categorias', id],
    queryFn: async () => {
      if (!id) throw new Error('ID is required');
      const response = await fetchAPI<ApiResponse<Categoria>>(`/api/categorias/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 30, // 30 minutos
    gcTime: 1000 * 60 * 60, // 1 hora
  });
};

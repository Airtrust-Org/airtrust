/**
 * Service de Qualificações - Unificado
 *
 * Consolida:
 * - qualificacoesService.ts (CRUD)
 * - qualificacoes.service.ts (Histórico)
 *
 * Organização modular para escalabilidade
 */

import { httpClient } from '../http-client';
import type { ApiResponse } from '../http-client';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FuncionarioResumo {
  id: number;
  nome: string;
  matricula?: string;
  cpf?: string;
  is_instrutor?: number | boolean;
}

export interface TipoQualificacaoResumo {
  id: number;
  tipo?: string | null;
  nome: string;
  codigo: string;
  categoria: string;
  categoria_id?: number | null;
  descricao?: string | null;
  conteudo_programatico?: string | null;
  carga_horaria?: number | null;
  carga_horaria_inicial?: number | null;
  carga_horaria_recorrente?: number | null;
  validade: number | null;
  observacoes?: string | null;
  vencimento_fim_mes?: number | null;
  is_check?: number | boolean | null;
  ativo?: number | boolean | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface HistoricoQualificacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  status?: string;
  validade?: string | number;
  data_registro: string;
  funcionario_nome: string;
  funcionario_guerra?: string;
  funcionario_matricula?: string;
  funcionario_codigo_anac?: string;
  funcionario_cargo?: string;
  funcionario_funcao?: string;
  funcionario_setor?: string;
  funcionario_base?: string;
  funcionario_aeronave?: string;
  funcionario_admissao?: string;
  funcionario_is_instrutor?: number | boolean;
  funcionario_is_checador?: number | boolean;
  funcionario_status?: string;
  funcionario_ativo?: number | boolean;
  qualificacao_desc: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  qualificacao_categoria?: string;
  qualificacao_validade?: number;
  categoria?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  observacoes?: string;
  certificado_url?: string;
  certificado_numero?: string;
  tipo_treinamento?: string;
}

export interface HistoricoFiltros {
  funcionario_id?: number;
  qualificacao_id?: number;
  status?: string;
  limit?: number;
}

export interface HistoricoQualificacaoInput {
  funcionario_id?: number;
  qualificacao_id?: number;
  funcionario_cpf?: string;
  qualificacao_codigo?: string;
  tipo_treinamento?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  instrutor_id?: number; // SECURITY: Foreign key to funcionarios table
  observacoes?: string;
  certificado_url?: string;
  certificado_numero?: string;
}

export interface Qualificacao {
  id: number;
  nome: string;
  codigo: string;
  categoria: string;
  validade?: number;
  observacoes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QualificacaoCreate {
  nome: string;
  codigo: string;
  categoria: string;
  validade?: number;
  observacoes?: string;
}

export interface QualificacaoUpdate extends Partial<QualificacaoCreate> {}

export interface FiltrosQualificacoes {
  search?: string;
  tipo_qualificacao?: string;
  status?: string;
}

export interface PaginacaoParams {
  page?: number;
  limit?: number;
}

export interface DashboardStats {
  total: number;
  validas: number;
  vencidas: number;
  vencendo: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════

export const qualificacoesService = {
  // ─────────────────────────────────────────────────────────────
  // CRUD PRINCIPAL
  // ─────────────────────────────────────────────────────────────

  async listar(
    filtros?: FiltrosQualificacoes,
    paginacao?: PaginacaoParams,
  ): Promise<ApiResponse<Qualificacao[]>> {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.tipo_qualificacao) params.append('tipo_qualificacao', filtros.tipo_qualificacao);
    if (filtros?.status) params.append('status', filtros.status);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) params.append('limit', paginacao.limit.toString());

    const queryString = params.toString();
    return httpClient.get<Qualificacao[]>(`/qualificacoes${queryString ? `?${queryString}` : ''}`);
  },

  async buscarPorId(id: string | number): Promise<ApiResponse<Qualificacao>> {
    return httpClient.get<Qualificacao>(`/qualificacoes/${id}`);
  },

  async criar(data: QualificacaoCreate): Promise<ApiResponse<Qualificacao>> {
    return httpClient.post<Qualificacao>('/qualificacoes', data);
  },

  async atualizar(
    id: string | number,
    data: QualificacaoUpdate,
  ): Promise<ApiResponse<Qualificacao>> {
    return httpClient.put<Qualificacao>(`/qualificacoes/historico/${id}`, data);
  },

  async excluir(id: string | number): Promise<ApiResponse<void>> {
    return httpClient.delete<void>(`/qualificacoes/historico/${id}`);
  },

  // ─────────────────────────────────────────────────────────────
  // HISTÓRICO
  // ─────────────────────────────────────────────────────────────

  historico: {
    async listar(filtros: HistoricoFiltros = {}): Promise<ApiResponse<HistoricoQualificacao[]>> {
      const params = new URLSearchParams();
      if (filtros.funcionario_id) params.append('funcionario_id', String(filtros.funcionario_id));
      if (filtros.qualificacao_id)
        params.append('qualificacao_id', String(filtros.qualificacao_id));
      if (filtros.status) params.append('status', filtros.status);
      if (filtros.limit) params.append('limit', String(filtros.limit));

      const queryString = params.toString();
      return httpClient.get<HistoricoQualificacao[]>(
        `/qualificacoes/historico${queryString ? `?${queryString}` : ''}`,
      );
    },

    async criar(input: HistoricoQualificacaoInput): Promise<ApiResponse<HistoricoQualificacao>> {
      return httpClient.post<HistoricoQualificacao>('/qualificacoes/historico', input, {
        skipRequestControl: true,
      });
    },

    async atualizar(
      id: number,
      input: Partial<HistoricoQualificacaoInput>,
    ): Promise<ApiResponse<HistoricoQualificacao>> {
      return httpClient.put<HistoricoQualificacao>(`/qualificacoes/historico/${id}`, input, {
        skipRequestControl: true,
      });
    },

    async deletar(id: number): Promise<ApiResponse<void>> {
      return httpClient.delete<void>(`/qualificacoes/historico/${id}`, {
        skipRequestControl: true,
      });
    },

    async renovar(
      id: number,
      novaDataVencimento: string,
    ): Promise<ApiResponse<HistoricoQualificacao>> {
      return httpClient.post<HistoricoQualificacao>(
        `/qualificacoes/historico/${id}/renovar`,
        {
          data_vencimento: novaDataVencimento,
        },
        {
          skipRequestControl: true,
        },
      );
    },
  },

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD & ANALYTICS
  // ─────────────────────────────────────────────────────────────

  async dashboard(): Promise<ApiResponse<DashboardStats>> {
    return httpClient.get<DashboardStats>('/dashboard/qualificacoes');
  },

  // ─────────────────────────────────────────────────────────────
  // IMPORT/EXPORT
  // ─────────────────────────────────────────────────────────────

  async importar(data: any[]): Promise<ApiResponse<ImportResult>> {
    return httpClient.post<ImportResult>('/qualificacoes/import', { qualificacoes: data });
  },

  async exportar(): Promise<Blob> {
    // Exportação retorna Blob, não ApiResponse
    const response = await fetch(`${API_BASE_URL}/qualificacoes/export`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });
    return response.blob();
  },

  // ─────────────────────────────────────────────────────────────
  // LOOKUPS (Dados auxiliares)
  // ─────────────────────────────────────────────────────────────

  lookups: {
    async funcionariosAtivos(limit = 1000): Promise<ApiResponse<FuncionarioResumo[]>> {
      return httpClient.get<FuncionarioResumo[]>(
        `/funcionarios?status=ativos&orderBy=nome&order=ASC&limit=${limit}`,
      );
    },

    async tiposQualificacao(limit = 1000): Promise<ApiResponse<TipoQualificacaoResumo[]>> {
      return httpClient.get<TipoQualificacaoResumo[]>(`/qualificacoes/tipos?limit=${limit}`);
    },
  },
};

// Export default para compatibilidade
export default qualificacoesService;

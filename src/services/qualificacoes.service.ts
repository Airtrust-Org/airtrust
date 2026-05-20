import api from './api';
import {
  Qualificacao,
  QualificacaoCreate,
  QualificacaoUpdate,
  ImportResult,
  FiltrosQualificacoes,
  PaginacaoParams,
  DashboardStats,
} from '@/types';

export const qualificacoesService = {
  listar: async (
    filtros?: FiltrosQualificacoes,
    paginacao?: PaginacaoParams,
  ): Promise<Qualificacao[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.tipo_qualificacao) params.append('tipo', filtros.tipo_qualificacao);
    if (filtros?.status) params.append('status', filtros.status);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      // Endpoint aplica limite máximo interno (~100); evitar 500 usando um limite alto porém seguro
      params.append('limit', '100');
      params.append('page', '1');
    }

    const response = await api.get(`/qualificacoes?${params}`);
    return response.qualificacoes || response.data || [];
  },

  dashboard: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/qualificacoes');
    return response.data || response.stats || response;
  },

  buscarPorId: async (id: string | number): Promise<Qualificacao> => {
    const response = await api.get(`/qualificacoes/${id}`);
    return response.qualificacao || response.data;
  },

  criar: async (data: QualificacaoCreate): Promise<Qualificacao> => {
    const response = await api.post('/qualificacoes', data);
    return response.data || response;
  },

  atualizar: async (id: string | number, data: QualificacaoUpdate): Promise<Qualificacao> => {
    const response = await api.put(`/qualificacoes/${id}`, data);
    return response.data || response;
  },

  excluir: async (id: string | number): Promise<void> => {
    return api.delete(`/qualificacoes/${id}`);
  },

  importar: async (data: any[]): Promise<ImportResult> => {
    return api.post('/qualificacoes/import', { qualificacoes: data });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/qualificacoes/export', { responseType: 'blob' });
  },

  buscarPorFuncionario: async (
    funcionarioId: number,
  ): Promise<{ funcionario: any; qualificacoes: Qualificacao[]; stats: any }> => {
    return api.get(`/qualificacoes/funcionario/${funcionarioId}`);
  },
};

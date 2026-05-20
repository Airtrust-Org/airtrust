import api from './api';
import {
  Funcionario,
  FuncionarioCreate,
  FuncionarioUpdate,
  ImportResult,
  FiltrosFuncionarios,
  PaginacaoParams,
} from '@/types';

export const funcionariosService = {
  listar: async (
    filtros?: FiltrosFuncionarios,
    paginacao?: PaginacaoParams,
  ): Promise<{ data: Funcionario[]; total: number; page: number }> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.cargo) params.append('cargo', filtros.cargo);
    if (filtros?.setor) params.append('setor', filtros.setor);
    if (filtros?.ativo !== undefined) params.append('ativo', filtros.ativo.toString());
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      // Sem paginação explícita → buscar "todos" para preencher páginas
      params.append('limit', '10000');
      params.append('page', '1');
    }

    const response = await api.get(`/funcionarios?${params}`);
    console.log('[funcionariosService.listar] Response:', response);

    // API returns { success: true, data: [...] }
    // axios interceptor returns response.data, so we get the actual { success, data } object
    let data: Funcionario[] = [];

    if (Array.isArray(response)) {
      data = response;
    } else if (response && typeof response === 'object' && 'data' in response) {
      data = Array.isArray(response.data) ? response.data : [];
    }

    return { data, total: data.length, page: 1 };
  },

  buscarPorId: async (id: string | number): Promise<Funcionario> => {
    const response = await api.get(`/funcionarios/${id}`);
    // API returns { success: true, data: {...} }
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  criar: async (data: FuncionarioCreate): Promise<Funcionario> => {
    const response = await api.post('/funcionarios', data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  atualizar: async (id: string | number, data: FuncionarioUpdate): Promise<Funcionario> => {
    const response = await api.put(`/funcionarios/${id}`, data);
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data || {};
    }
    return response || {};
  },

  excluir: async (id: string | number): Promise<void> => {
    return api.delete(`/funcionarios/${id}`);
  },

  importar: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/funcionarios/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/funcionarios/export', { responseType: 'blob' });
  },
};

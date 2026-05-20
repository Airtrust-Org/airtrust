import api from './api';
import {
  Simulador,
  SimuladorCreate,
  SimuladorUpdate,
  FiltrosSimuladores,
  PaginacaoParams,
} from '@/types';

export const simuladoresService = {
  listar: async (
    filtros?: FiltrosSimuladores,
    paginacao?: PaginacaoParams,
  ): Promise<Simulador[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.tipo) params.append('tipo', filtros.tipo);
    if (filtros?.status) params.append('status', filtros.status);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) {
      params.append('limit', paginacao.limit.toString());
    } else {
      params.append('limit', '10000');
      params.append('page', '1');
    }

    return api.get(`/simuladores?${params}`);
  },

  buscarPorId: async (id: string): Promise<Simulador> => {
    return api.get(`/simuladores/${id}`);
  },

  criar: async (data: SimuladorCreate): Promise<Simulador> => {
    return api.post('/simuladores', data);
  },

  atualizar: async (id: string, data: SimuladorUpdate): Promise<Simulador> => {
    return api.put(`/simuladores/${id}`, data);
  },

  excluir: async (id: string): Promise<void> => {
    return api.delete(`/simuladores/${id}`);
  },

  importar: async (file: File): Promise<{ sucesso: number; erros: any[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/simuladores/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  exportar: async (): Promise<Blob> => {
    return api.get('/simuladores/export', { responseType: 'blob' });
  },

  modelosSessao: async (): Promise<any[]> => {
    return api.get('/simuladores/modelos-sessao');
  },
};

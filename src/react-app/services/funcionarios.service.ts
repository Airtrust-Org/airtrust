import api from './api';
import { Funcionario, FuncionarioCreate, FuncionarioUpdate, ImportResult, FiltrosFuncionarios, PaginacaoParams } from '@/types';

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const getCacheKey = (filtros?: FiltrosFuncionarios, paginacao?: PaginacaoParams) => {
  return `funcionarios_${JSON.stringify({ filtros, paginacao })}`;
};

const isValidCache = (timestamp: number) => {
  return Date.now() - timestamp < CACHE_TTL;
};

export const funcionariosService = {
  listar: async (filtros?: FiltrosFuncionarios, paginacao?: PaginacaoParams): Promise<{ data: Funcionario[]; total: number; page: number; }> => {
    const cacheKey = getCacheKey(filtros, paginacao);
    const cached = cache.get(cacheKey);

    if (cached && isValidCache(cached.timestamp)) {
      return cached.data;
    }

    const params = new URLSearchParams();
    if (filtros?.search) params.append('search', filtros.search);
    if ((filtros as any)?.funcao) params.append('funcao', (filtros as any).funcao);
    if ((filtros as any)?.aeronave) params.append('aeronave', (filtros as any).aeronave);
    if ((filtros as any)?.status) params.append('status', (filtros as any).status);
    if ((filtros as any)?.sortBy) params.append('sortBy', (filtros as any).sortBy);
    if ((filtros as any)?.sortOrder) params.append('sortOrder', (filtros as any).sortOrder);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) params.append('limit', paginacao.limit.toString());

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await api.get(`/funcionarios${query}`);
    const payload = response as any;
    const shaped = { data: payload.data || [], total: payload.total || 0, page: payload.page || (paginacao?.page || 1) };

    cache.set(cacheKey, { data: shaped, timestamp: Date.now() });

    return shaped;
  },

  buscarPorId: async (id: string): Promise<Funcionario> => {
    const cacheKey = `funcionario_${id}`;
    const cached = cache.get(cacheKey);

    if (cached && isValidCache(cached.timestamp)) {
      return cached.data;
    }

    const response = await api.get(`/funcionarios/${id}`);

    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    return response;
  },

  criar: async (data: FuncionarioCreate): Promise<Funcionario> => {
    const response = await api.post('/funcionarios', data);

    funcionariosService.limparCache();

    return response;
  },

  atualizar: async (id: string, data: FuncionarioUpdate): Promise<Funcionario> => {
    const response = await api.put(`/funcionarios/${id}`, data);

    funcionariosService.limparCache();

    return response;
  },

  excluir: async (id: string): Promise<void> => {
    await api.delete(`/funcionarios/${id}`);

    funcionariosService.limparCache();
  },

  importar: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/funcionarios/importar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    funcionariosService.limparCache();

    return response;
  },

  exportar: async (): Promise<Blob> => {
    const response = await api.get('/funcionarios/exportar', {
      responseType: 'blob'
    });

    return response;
  },

  limparCache: () => {
    cache.clear();
  }
};

import {
  Funcionario,
  FuncionarioCreate,
  FuncionarioUpdate,
  ImportResult,
  FiltrosFuncionarios,
  PaginacaoParams,
} from '@/types';
import { apiBlob, apiEnvelope, apiJson } from '@/react-app/lib/api-contract';
import { LruTtlCache } from '@/react-app/lib/lru-ttl-cache';
import { getCurrentTenantId, registerTenantCacheReset } from '@/react-app/lib/tenant-data-layer';

interface FuncionariosListResult {
  data: Funcionario[];
  total: number;
  page: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const listCache = new LruTtlCache<string, FuncionariosListResult>(40, CACHE_TTL);
const detailCache = new LruTtlCache<string, Funcionario>(40, CACHE_TTL);
registerTenantCacheReset('funcionarios-service', () => {
  listCache.clear();
  detailCache.clear();
});

function tenantCacheKey(...parts: unknown[]): string {
  return `${getCurrentTenantId() ?? 'pending'}:${JSON.stringify(parts)}`;
}

function clearTenantCache(): void {
  const tenantPrefix = `${getCurrentTenantId() ?? 'pending'}:`;
  listCache.deleteMatching((key) => key.startsWith(tenantPrefix));
  detailCache.deleteMatching((key) => key.startsWith(tenantPrefix));
}

export const funcionariosService = {
  listar: async (
    filtros?: FiltrosFuncionarios,
    paginacao?: PaginacaoParams,
  ): Promise<FuncionariosListResult> => {
    const cacheKey = tenantCacheKey('list', filtros ?? {}, paginacao ?? {});
    const cached = listCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (filtros?.search) params.append('search', filtros.search);
    if ((filtros as { funcao?: string } | undefined)?.funcao) {
      params.append('funcao', (filtros as { funcao: string }).funcao);
    }
    if ((filtros as { aeronave?: string } | undefined)?.aeronave) {
      params.append('aeronave', (filtros as { aeronave: string }).aeronave);
    }
    if ((filtros as { status?: string } | undefined)?.status) {
      params.append('status', (filtros as { status: string }).status);
    }
    if ((filtros as { sortBy?: string } | undefined)?.sortBy) {
      params.append('sortBy', (filtros as { sortBy: string }).sortBy);
    }
    if ((filtros as { sortOrder?: string } | undefined)?.sortOrder) {
      params.append('sortOrder', (filtros as { sortOrder: string }).sortOrder);
    }
    if (paginacao?.page) params.append('page', String(paginacao.page));
    if (paginacao?.limit) params.append('limit', String(paginacao.limit));

    const query = params.size > 0 ? `?${params.toString()}` : '';
    const envelope = await apiEnvelope<Funcionario[]>(`/api/funcionarios${query}`);
    const pagination = envelope.pagination as { total?: number; page?: number } | undefined;
    const shaped: FuncionariosListResult = {
      data: Array.isArray(envelope.data) ? envelope.data : [],
      total: Number(envelope.total ?? pagination?.total ?? envelope.data?.length ?? 0),
      page: Number(envelope.page ?? pagination?.page ?? paginacao?.page ?? 1),
    };

    listCache.set(cacheKey, shaped);
    return shaped;
  },

  buscarPorId: async (id: string): Promise<Funcionario> => {
    const cacheKey = tenantCacheKey('detail', id);
    const cached = detailCache.get(cacheKey);
    if (cached) return cached;

    const funcionario = await apiJson<Funcionario>(`/api/funcionarios/${id}`);
    detailCache.set(cacheKey, funcionario);
    return funcionario;
  },

  criar: async (data: FuncionarioCreate): Promise<Funcionario> => {
    const funcionario = await apiJson<Funcionario>('/api/funcionarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    clearTenantCache();
    return funcionario;
  },

  atualizar: async (id: string, data: FuncionarioUpdate): Promise<Funcionario> => {
    const funcionario = await apiJson<Funcionario>(`/api/funcionarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    clearTenantCache();
    return funcionario;
  },

  excluir: async (id: string): Promise<void> => {
    await apiJson<unknown>(`/api/funcionarios/${id}`, { method: 'DELETE' });
    clearTenantCache();
  },

  importar: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const result = await apiJson<ImportResult>('/api/funcionarios/import', {
      method: 'POST',
      body: formData,
    });
    clearTenantCache();
    return result;
  },

  exportar: async (): Promise<Blob> => apiBlob('/api/funcionarios/export'),

  limparCache: (): void => {
    listCache.clear();
    detailCache.clear();
  },
};

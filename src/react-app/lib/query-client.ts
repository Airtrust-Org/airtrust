import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { onDataChanged, type DataChangeScope } from '@/react-app/utils/data-sync';
import { frontendErrorMessage } from '@/react-app/lib/api-contract';
import {
  getCurrentTenantId,
  registerTenantCacheReset,
  resetTenantDataLayer,
} from '@/react-app/lib/tenant-data-layer';

export interface AirTrustMutationMeta extends Record<string, unknown> {
  suppressGlobalError?: boolean;
}

const queryCache = new QueryCache({
  onError: (error, query) => {
    const meta = query.meta as AirTrustMutationMeta | undefined;
    if (meta?.suppressGlobalError) return;
    toast.error(frontendErrorMessage(error));
  },
});

const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    const meta = mutation.options.meta as AirTrustMutationMeta | undefined;
    if (meta?.suppressGlobalError) return;
    toast.error(frontendErrorMessage(error));
  },
});

/**
 * React Query client. Tenant changes clear the complete client before any new
 * tenant-scoped refetch can begin.
 */
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
});

const clearReactQueryOnly = queryClient.clear.bind(queryClient);
registerTenantCacheReset('react-query', clearReactQueryOnly);

// Existing logout paths already call queryClient.clear(). Make that call the
// complete data-layer reset rather than clearing React Query alone.
queryClient.clear = () => {
  resetTenantDataLayer({ reason: 'logout', tenantId: null });
};

/**
 * Tenant-scoped query key helper. Missing IDs are derived from the current JWT.
 * The safe pending namespace replaces the historical `tenant, 0` collision.
 */
export function tenantQueryKey(
  empresaId: number | null | undefined,
  ...parts: unknown[]
): readonly unknown[] {
  const resolvedTenantId = empresaId ?? getCurrentTenantId();
  return ['tenant', resolvedTenantId ?? 'pending', ...parts] as const;
}

export const queryKeys = {
  all: (empresaId?: number | null) => tenantQueryKey(empresaId, 'data'),

  categorias: (empresaId?: number | null) => tenantQueryKey(empresaId, 'categorias'),
  categoriasDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'categorias', id),

  qualificacoes: (empresaId?: number | null) => tenantQueryKey(empresaId, 'qualificacoes'),
  qualificacoesDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'qualificacoes', id),

  funcionarios: (empresaId?: number | null) => tenantQueryKey(empresaId, 'funcionarios'),
  funcionariosDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'funcionarios', id),

  agendamentos: (empresaId?: number | null) => tenantQueryKey(empresaId, 'agendamentos'),
  agendamentosDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'agendamentos', id),

  historico: (empresaId?: number | null) => tenantQueryKey(empresaId, 'historico'),
  historicoDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'historico', id),

  simuladores: (empresaId?: number | null) => tenantQueryKey(empresaId, 'simuladores'),
  simuladoresDetail: (id: string, empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'simuladores', id),

  dashboard: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard'),
};


/**
 * Tenant-scoped, domain-aware invalidation. Only keys under the active tenant
 * can be touched; global/unscoped and other-company queries remain untouched.
 */
const dataChangeQueryDomains: Record<Exclude<DataChangeScope, 'all'>, string[]> = {
  treinamentos: ['treinamento', 'lms', 'matricula', 'ead', 'compliance', 'qualificac', 'dashboard'],
  escala: ['escala', 'evd', 'frms', 'dashboard'],
  qualificacoes: ['qualificac', 'categoria', 'historico', 'certificado', 'compliance', 'dashboard'],
  simuladores: ['simulador', 'ficha', 'qualificac', 'dashboard'],
  funcionarios: ['funcionario', 'setor', 'usuario', 'qualificac', 'compliance', 'dashboard'],
  lms: ['lms', 'matricula', 'curso', 'treinamento', 'ead', 'qualificac', 'compliance', 'dashboard'],
  frms: ['frms', 'fadiga', 'jornada', 'readiness', 'dashboard'],
  compliance: ['compliance', 'qualificac', 'treinamento', 'dashboard'],
};

export function shouldInvalidateQueryForDataChange(
  queryKey: readonly unknown[],
  scope: DataChangeScope,
  tenantId: number,
): boolean {
  if (queryKey[0] !== 'tenant' || queryKey[1] !== tenantId) return false;
  if (scope === 'all') return true;
  const domains = dataChangeQueryDomains[scope];
  return queryKey.slice(2).some((keyPart) =>
    typeof keyPart === 'string' &&
    domains.some((domain) => keyPart.toLowerCase().includes(domain)),
  );
}

onDataChanged((scope) => {
  const tenantId = getCurrentTenantId();
  if (tenantId == null) return;
  void queryClient.invalidateQueries({
    predicate: (query) => shouldInvalidateQueryForDataChange(query.queryKey, scope, tenantId),
  });
});

export const cacheTimes = {
  STATIC: 1000 * 60 * 60,
  MEDIUM: 1000 * 60 * 30,
  LOW: 1000 * 60 * 5,
  FREQUENT: 1000 * 60 * 3,
  REALTIME: 1000 * 30,
};

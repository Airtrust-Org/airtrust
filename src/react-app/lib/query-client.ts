import { QueryClient } from '@tanstack/react-query'

/**
 * React Query Client Configuration
 * Optimized for AirTrust performance
 *
 * Cache Strategy:
 * - Static data (categorias): 1 hour
 * - Medium volatility (qualificacoes): 30 minutes
 * - Employee data (funcionarios): 5 minutes
 * - Training history: 3 minutes
 * - Dashboard: 30 seconds (real-time)
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Default: 5 minutes
      gcTime: 1000 * 60 * 10, // Former cacheTime: 10 minutes
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
})

/**
 * Tenant-scoped query key helper.
 * Prefixes any query key with the current empresaId so that switching
 * tenants automatically creates a new cache namespace.
 *
 * Usage:
 *   tenantQueryKey(empresaId, 'funcionarios', 'list', filters)
 *   // => ['tenant', 8, 'funcionarios', 'list', filters]
 */
export function tenantQueryKey(empresaId: number | null | undefined, ...parts: unknown[]): readonly unknown[] {
  return ['tenant', empresaId ?? 0, ...parts] as const;
}

/**
 * Query Key Factory
 * Standardized query keys for type-safe cache management.
 * All tenant-scoped keys accept an optional empresaId as first parameter.
 */
export const queryKeys = {
  all: ['data'] as const,

  // Categorias (1 hour cache - static)
  categorias: (empresaId?: number | null) => tenantQueryKey(empresaId, 'categorias'),
  categoriasDetail: (id: string, empresaId?: number | null) => tenantQueryKey(empresaId, 'categorias', id),

  // Qualificações (30 min cache - medium volatility)
  qualificacoes: (empresaId?: number | null) => tenantQueryKey(empresaId, 'qualificacoes'),
  qualificacoesDetail: (id: string, empresaId?: number | null) => tenantQueryKey(empresaId, 'qualificacoes', id),

  // Funcionários (5 min cache - frequent changes)
  funcionarios: (empresaId?: number | null) => tenantQueryKey(empresaId, 'funcionarios'),
  funcionariosDetail: (id: string, empresaId?: number | null) => tenantQueryKey(empresaId, 'funcionarios', id),

  // Histórico (3 min cache - audit data)
  historico: (empresaId?: number | null) => tenantQueryKey(empresaId, 'historico'),
  historicoDetail: (id: string, empresaId?: number | null) => tenantQueryKey(empresaId, 'historico', id),

  // Simuladores (30 sec - real-time)
  simuladores: (empresaId?: number | null) => tenantQueryKey(empresaId, 'simuladores'),
  simuladoresDetail: (id: string, empresaId?: number | null) => tenantQueryKey(empresaId, 'simuladores', id),

  // Dashboard (30 sec - real-time)
  dashboard: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard'),
}

/**
 * Cache configuration by data type
 * Override default staleTime per query
 */
export const cacheTimes = {
  STATIC: 1000 * 60 * 60, // 1 hour - categorias, funcoes
  MEDIUM: 1000 * 60 * 30, // 30 min - qualificacoes
  LOW: 1000 * 60 * 5, // 5 min - funcionarios
  FREQUENT: 1000 * 60 * 3, // 3 min - historico
  REALTIME: 1000 * 30, // 30 sec - dashboard, simuladores
}

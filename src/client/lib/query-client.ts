import { QueryClient } from '@tanstack/react-query';

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
});

/**
 * Query Key Factory
 * Standardized query keys for type-safe cache management
 */
export const queryKeys = {
  all: ['data'] as const,

  // Categorias (1 hour cache - static)
  categorias: () => [...queryKeys.all, 'categorias'] as const,
  categoriasDetail: (id: string) => [...queryKeys.categorias(), id] as const,

  // Qualificações (30 min cache - medium volatility)
  qualificacoes: () => [...queryKeys.all, 'qualificacoes'] as const,
  qualificacoesDetail: (id: string) => [...queryKeys.qualificacoes(), id] as const,

  // Funcionários (5 min cache - frequent changes)
  funcionarios: () => [...queryKeys.all, 'funcionarios'] as const,
  funcionariosDetail: (id: string) => [...queryKeys.funcionarios(), id] as const,

  // Histórico (3 min cache - audit data)
  historico: () => [...queryKeys.all, 'historico'] as const,
  historicoDetail: (id: string) => [...queryKeys.historico(), id] as const,

  // Simuladores (30 sec - real-time)
  simuladores: () => [...queryKeys.all, 'simuladores'] as const,
  simuladoresDetail: (id: string) => [...queryKeys.simuladores(), id] as const,

  // Dashboard (30 sec - real-time)
  dashboard: () => [...queryKeys.all, 'dashboard'] as const,
};

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
};

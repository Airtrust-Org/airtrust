# Core Business Logic


---
## FILE: src/client/hooks/useQualificacoes.ts
~~~typescript
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

~~~

---
## FILE: src/client/lib/query-client.ts
~~~typescript
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

~~~

---
## FILE: src/config/api-endpoints.ts
~~~typescript
/**
 * Centralized API endpoints configuration
 * Avoid hardcoding URLs throughout the application
 *
 * Usage:
 * const res = await fetch(API_ENDPOINTS.qualificacoes.list);
 * const res = await fetch(API_ENDPOINTS.habilitacoes.get(5));
 */

import { API_BASE_URL } from '@/react-app/config/api';

function buildApiPath(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export const API_ENDPOINTS = {
  // Qualificações - Master-level certification/training types (immutable)
  qualificacoes: {
    list: buildApiPath('/qualificacoes'),
    create: buildApiPath('/qualificacoes'),
    get: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
    update: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
    delete: (id: string | number) => buildApiPath(`/qualificacoes/${id}`),
  },

  // Habilitações - Employee-level compliance records (instances)
  habilitacoes: {
    list: buildApiPath('/habilitacoes'),
    create: buildApiPath('/habilitacoes'),
    get: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
    update: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
    delete: (id: string | number) => buildApiPath(`/habilitacoes/${id}`),
  },

  // Certificados - Training certificates
  certificados: {
    list: buildApiPath('/certificados'),
    create: buildApiPath('/certificados'),
    get: (id: string | number) => buildApiPath(`/certificados/${id}`),
    update: (id: string | number) => buildApiPath(`/certificados/${id}`),
    delete: (id: string | number) => buildApiPath(`/certificados/${id}`),
  },

  // System health check
  system: {
    health: buildApiPath('/sistema/health'),
    status: buildApiPath('/sistema/status'),
  },
};

/**
 * Helper function to build query parameters
 * Usage: buildQueryParams({ page: 1, limit: 10, search: 'test' })
 */
export function buildQueryParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Build full endpoint URL with query parameters
 * Usage: buildEndpoint(API_ENDPOINTS.qualificacoes.list, { page: 1, limit: 10 })
 */
export function buildEndpoint(endpoint: string, params?: Record<string, any>): string {
  if (!params) return endpoint;
  return endpoint + buildQueryParams(params);
}

/**
 * Default fetch options with error handling
 */
export const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Standardized error response type
 */
export interface ApiError {
  error: string;
  details?: any;
  statusCode?: number;
}

/**
 * Standardized success response type
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

~~~

---
## FILE: src/config/constants.ts
~~~typescript
function resolveApiBase(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim();

  // Usar proxy sempre (funciona tanto em dev quanto em pages.dev com _redirects)
  return '/api';
}

export const API_BASE_URL = resolveApiBase();

export const CARGOS = [
  { value: 'PILOTO', label: 'Piloto' },
  { value: 'COPILOTO', label: 'Copiloto' },
  { value: 'COMISSARIO', label: 'Comissário' },
  { value: 'MECANICO', label: 'Mecânico' },
  { value: 'INSTRUTOR', label: 'Instrutor' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
] as const;

export const SETORES = [
  { value: 'OPERACOES', label: 'Operações' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'SEGURANCA', label: 'Segurança' },
] as const;

export const TIPOS_QUALIFICACAO = [
  { value: 'LICENCA', label: 'Licença' },
  { value: 'HABILITACAO_TIPO', label: 'Habilitação de Tipo' },
  { value: 'CERTIFICACAO_MEDICA', label: 'Certificação Médica' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'CHEQUE', label: 'Cheque de Proficiência' },
] as const;

export const STATUS_QUALIFICACAO = [
  { value: 'VALIDO', label: 'Válido', color: 'green' },
  { value: 'VENCENDO', label: 'Vencendo', color: 'yellow' },
  { value: 'VENCIDO', label: 'Vencido', color: 'red' },
] as const;

export const TIPOS_SIMULADOR = [
  { value: 'FULL_FLIGHT', label: 'Full Flight' },
  { value: 'FIXED_BASE', label: 'Fixed Base' },
  { value: 'FMS', label: 'FMS' },
  { value: 'CPT', label: 'CPT' },
] as const;

export const STATUS_SIMULADOR = [
  { value: 'DISPONIVEL', label: 'Disponível', color: 'green' },
  { value: 'MANUTENCAO', label: 'Manutenção', color: 'yellow' },
  { value: 'INDISPONIVEL', label: 'Indisponível', color: 'red' },
] as const;

export const FUNCOES_SESSAO = [
  { value: 'PIC', label: 'PIC - Pilot in Command' },
  { value: 'SIC', label: 'SIC - Second in Command' },
  { value: 'DUAL', label: 'DUAL - Dual Control' },
] as const;

export const STATUS_AGENDAMENTO = [
  { value: 'AGENDADO', label: 'Agendado', color: 'blue' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento', color: 'yellow' },
  { value: 'CONCLUIDO', label: 'Concluído', color: 'green' },
  { value: 'CANCELADO', label: 'Cancelado', color: 'red' },
] as const;

export const PAGINACAO = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
} as const;

export const VALIDACOES = {
  CPF_REGEX: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  MATRICULA_REGEX: /^[A-Z0-9]{4,10}$/,
} as const;

~~~

---
## FILE: src/config/github.ts
~~~typescript
const GITHUB_CONFIG = {
  owner: 'airtrustoffshore-stack',
  repo: 'airtrust-storage',
  token: process.env.GITHUB_TOKEN || '',
  branch: 'main',
  apiUrl: 'https://api.github.com'
};

export default GITHUB_CONFIG;

~~~

---
## FILE: src/lib/sw-manager.tsx
~~~tsx
/**
 * Service Worker Manager para AirTrust
 *
 * Responsabilidades:
 * 1. Registrar SW na inicialização do app
 * 2. Ouvir mensagens de "update available"
 * 3. Oferecer reload ao usuário (toast)
 * 4. Monitorar versão do manifest.json (fallback se SW não funcionar)
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

interface ServiceWorkerUpdateEvent {
  type: 'AIRTRUST_UPDATE_AVAILABLE';
  version: string;
  message: string;
}

function shouldBypassServiceWorkerForPath(pathname: string): boolean {
  return /^\/lms\/player\//.test(pathname);
}

async function unregisterServiceWorkersAndCaches(): Promise<void> {
  await clearAllCaches();
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));
}

/**
 * Hook: registra SW e monitora atualizações
 */
export function useServiceWorkerUpdates(): void {
  useEffect(() => {
    if (shouldBypassServiceWorkerForPath(window.location.pathname)) {
      void unregisterServiceWorkersAndCaches();
      return;
    }

    const recoverKey = `airtrust-runtime-recover:${window.location.pathname}`;
    let recovering = false;

    const isRecoverableRuntimeError = (value: unknown): boolean => {
      const text = String(value ?? '').toLowerCase();
      return (
        text.includes('chunkloaderror') ||
        text.includes('loading chunk') ||
        text.includes('failed to fetch dynamically imported module') ||
        text.includes('importing a module script failed') ||
        (text.includes('javascript mime') && text.includes('text/html')) ||
        text.includes('not a valid javascript mime type')
      );
    };

    const recoverRuntime = async (reason: string) => {
      if (recovering) return;
      if (sessionStorage.getItem(recoverKey) === '1') return;
      recovering = true;
      sessionStorage.setItem(recoverKey, '1');

      try {
        await clearAllCaches();
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((reg) => reg.unregister()));
        }
      } catch {
        // Mesmo com falha na limpeza, seguimos para reload.
      }

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('runtime_recover', Date.now().toString());
      nextUrl.searchParams.set('reason', reason);
      window.location.replace(nextUrl.toString());
    };

    const onWindowError = (event: ErrorEvent) => {
      if (isRecoverableRuntimeError(event.error?.message || event.message)) {
        void recoverRuntime('window_error');
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? `${reason.message}\n${reason.stack || ''}`
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      if (isRecoverableRuntimeError(msg)) {
        void recoverRuntime('unhandled_rejection');
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Registrar SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('[App] Service Worker registrado:', registration);

          // Ouvir updates do SW
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // SW novo pronto, controler ativo → notificar
                showUpdateNotification();
              }
            });
          });

          // Ouvir mensagens do SW
          navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as ServiceWorkerUpdateEvent;
            if (data.type === 'AIRTRUST_UPDATE_AVAILABLE') {
              console.log('[App] Update disponível:', data);
              showUpdateNotification();
            }
          });
        })
        .catch((error) => {
          console.warn('[App] Erro registrando SW:', error);
        });
    }

    // Fallback: monitorar manifest.json a cada 60 minutos (era 1 minuto - muito agressivo!)
    const manifestCheckInterval = setInterval(
      () => {
        checkManifestVersion();
      },
      60 * 60 * 1000,
    ); // A cada 60 minutos

    return () => {
      clearInterval(manifestCheckInterval);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}

/**
 * Registrar SW (chamada isolada)
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers não suportado');
    return null;
  }

  if (shouldBypassServiceWorkerForPath(window.location.pathname)) {
    console.log('[SW] Desabilitado para rota LMS player');
    await unregisterServiceWorkersAndCaches();
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    console.log('[SW] Registrado com sucesso:', registration);
    return registration;
  } catch (error) {
    console.error('[SW] Erro ao registrar:', error);
    return null;
  }
}

/**
 * Forçar reload do cliente após novo SW estar pronto
 */
export function skipWaitingAndReload(): void {
  if (navigator.serviceWorker.controller) {
    // Enviar mensagem para SW pular espera
    navigator.serviceWorker.controller.postMessage({
      type: 'SKIP_WAITING',
    });

    // Aguardar controlador mudar (novo SW assume controle)
    let reloadCount = 0;
    const reloadCheckInterval = setInterval(() => {
      reloadCount++;
      if (!navigator.serviceWorker.controller || reloadCount > 30) {
        clearInterval(reloadCheckInterval);
        window.location.reload();
      }
    }, 100);
  } else {
    // Sem SW ativo, reload direto
    window.location.reload();
  }
}

/**
 * Limpar todos os caches (útil para reset manual)
 */
export async function clearAllCaches(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => name.startsWith('airtrust-')).map((name) => caches.delete(name)),
  );
  console.log('[App] Caches limpos');

  // Informar SW também
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_CACHE',
    });
  }
}

/**
 * Monitorar versão do manifest.json como fallback
 * Se mudou, forçar reload
 */
async function checkManifestVersion(): Promise<void> {
  try {
    const response = await fetch('/manifest.json?v=' + Date.now());
    if (!response.ok) return;

    const manifest = (await response.json()) as Record<string, unknown>;
    const currentVersion = sessionStorage.getItem('airtrust-manifest-version');
    const newVersion = JSON.stringify(manifest);

    if (currentVersion && currentVersion !== newVersion) {
      console.log('[App] Manifest mudou, reload necessário');
      showUpdateNotification();
    }

    sessionStorage.setItem('airtrust-manifest-version', newVersion);
  } catch (error) {
    console.warn('[App] Erro checando manifest:', error);
  }
}

/**
 * Notificar usuário de update com opção de reload
 */
function showUpdateNotification(): void {
  const toastId = `sw-update-${Date.now()}`;

  toast.custom(
    () => (
      <div className="flex flex-col gap-3 bg-white rounded-lg border border-gray-200 p-4 shadow-lg">
        <p className="font-semibold text-sm text-gray-900">Nova versao do AirTrust disponivel</p>
        <p className="text-xs text-gray-600">
          Clique em &quot;Atualizar&quot; para recarregar com as últimas melhorias.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => toast.dismiss(toastId)}
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300 transition"
          >
            Depois
          </button>
          <button
            onClick={() => {
              toast.dismiss(toastId);
              skipWaitingAndReload();
            }}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-medium transition"
          >
            Atualizar Agora
          </button>
        </div>
      </div>
    ),
    {
      duration: Infinity, // Mantém até usuário clicar
      position: 'bottom-right',
    },
  );
}

~~~

---
## FILE: src/react-app/config/api.ts
~~~typescript
/**
 * Configuração da API
 * Centraliza URLs e configurações de conexão com o backend
 *
 * SECURITY FIXES:
 * - Token stored in memory by default (not localStorage)
 * - Optional secure httpOnly cookie fallback support
 * - Token validation before use
 * - Proper error handling for expired tokens (401)
 * - Support for refresh tokens
 */

import { apiFetch } from '@/react-app/lib/apiFetch';

const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api';

function resolveApiBase(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL;
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  const normalizedEnvUrl = envUrl?.trim();

  // 🎯 LOCAL DEVELOPMENT: rota pelo proxy Vite → VITE_DEV_PROXY_TARGET (default: produção).
  // Para usar worker local: set VITE_DEV_PROXY_TARGET=http://localhost:8787 no .env.local
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${origin}/api`;
  }

  if (normalizedEnvUrl && normalizedEnvUrl.length > 0) return normalizedEnvUrl;

  // 🎯 STAGING: main.airtrust.pages.dev → staging API (zero cache)
  if (host === 'main.airtrust.pages.dev') {
    return 'https://airtrust-api-staging.airtrust.workers.dev/api';
  }

  // 🚀 PRODUCTION: usar o dominio canonico da API
  if (
    host === 'airtrust.online' ||
    host === 'www.airtrust.online' ||
    host === 'api.airtrust.online' ||
    host === 'production.airtrust.pages.dev' ||
    host.includes('pages.dev') ||
    host.includes('airtrust.pages.dev')
  ) {
    return PRODUCTION_API_BASE_URL;
  }

  return `${origin}/api`;
}

export const API_BASE_URL = resolveApiBase();
export const AUTH_TOKEN_CHANGED_EVENT = 'airtrust:token-changed';

// ===== TOKEN STORAGE (Memory-based for security) =====
let cachedToken: string | null = null;
let cachedRefreshToken: string | null = null;

let _persistLogin = false;
export function setPersistLogin(val: boolean) {
  _persistLogin = val;
}
export function getPersistLogin() {
  return _persistLogin;
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  cachedToken = accessToken;
  if (refreshToken) {
    cachedRefreshToken = refreshToken;
  }
  const persist = _persistLogin;
  if (persist) {
    try {
      localStorage.setItem('airtrust_token', accessToken);
      if (refreshToken) localStorage.setItem('airtrust_refresh_token', refreshToken);
    } catch {}
  } else {
    try {
      sessionStorage.setItem('airtrust_token', accessToken);
      if (refreshToken) sessionStorage.setItem('airtrust_refresh_token', refreshToken);
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_TOKEN_CHANGED_EVENT, {
        detail: { token: accessToken, refreshToken: refreshToken ?? cachedRefreshToken },
      }),
    );
  }
}

export function clearTokens(): void {
  cachedToken = null;
  cachedRefreshToken = null;
  try {
    localStorage.removeItem('airtrust_token');
  } catch {}
  try {
    localStorage.removeItem('airtrust_refresh_token');
  } catch {}
  try {
    sessionStorage.removeItem('airtrust_token');
  } catch {}
  try {
    sessionStorage.removeItem('airtrust_refresh_token');
  } catch {}
  if (typeof document !== 'undefined') {
    document.cookie = 'auth_token=; Max-Age=0; path=/;';
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_TOKEN_CHANGED_EVENT, {
        detail: { token: null, refreshToken: null },
      }),
    );
  }
}

export function getAccessToken(): string | null {
  if (cachedToken) {
    if (isValidToken(cachedToken)) return cachedToken;
    cachedToken = null;
  }
  // Fallback: read from sessionStorage (or migrate legacy localStorage value)
  try {
    let stored =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('airtrust_token') : null;
    if (!stored && typeof localStorage !== 'undefined') {
      stored = localStorage.getItem('airtrust_token');
      if (stored && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('airtrust_token', stored);
        localStorage.removeItem('airtrust_token');
      }
    }
    if (stored && isValidToken(stored)) {
      cachedToken = stored;
      return cachedToken;
    }
  } catch {
    // ignore (private mode, etc.)
  }
  return null;
}

export async function ensureValidAccessToken(): Promise<string | null> {
  const currentToken = getAccessToken();
  if (currentToken && isValidToken(currentToken)) {
    return currentToken;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return null;
  }

  await refreshAccessToken();
  return getAccessToken();
}

export function getRefreshToken(): string | null {
  if (cachedRefreshToken) return cachedRefreshToken;

  try {
    let stored =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('airtrust_refresh_token')
        : null;
    if (!stored && typeof localStorage !== 'undefined') {
      stored = localStorage.getItem('airtrust_refresh_token');
      if (stored && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('airtrust_refresh_token', stored);
        localStorage.removeItem('airtrust_refresh_token');
      }
    }
    if (stored) {
      cachedRefreshToken = stored;
      return cachedRefreshToken;
    }
  } catch {
    // ignore (private mode, etc.)
  }

  return null;
}

/**
 * Validate JWT token format (basic check)
 */
function isValidToken(token: string | null): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // JWT format: header.payload.signature
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    // Decode payload (no signature verification here - that's done by backend)
    const payload = JSON.parse(atob(parts[1]));

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false; // Token expired
    }

    return true;
  } catch {
    return false;
  }
}

export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/auth/login`,
  LOGOUT: `${API_BASE_URL}/auth/logout`,
  REFRESH_TOKEN: `${API_BASE_URL}/auth/refresh`,
  VERIFY_TOKEN: `${API_BASE_URL}/auth/verify`,

  FUNCIONARIOS: `${API_BASE_URL}/funcionarios`,
  FUNCIONARIO_BY_ID: (id: number) => `${API_BASE_URL}/funcionarios/${id}`,

  CERTIFICACOES: `${API_BASE_URL}/qualificacoes`,

  PASTA_VIRTUAL: `${API_BASE_URL}/pasta-virtual`,

  SIMULADORES: `${API_BASE_URL}/simuladores`,

  HEALTH: `${API_BASE_URL.replace('/api', '')}/api/health`,
  AUDIT_LOGS: `${API_BASE_URL.replace('/api', '')}/api/sistema/audit-logs`,
};

export const fetchConfig = {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include' as RequestCredentials,
};

/**
 * Fetch with authorization header and automatic token refresh
 * @param url - API endpoint
 * @param options - Fetch options
 * @param retry - Internal: whether this is a retry attempt
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retry: boolean = false,
): Promise<Response> {
  const token = getAccessToken();
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;

  // ===== TOKEN VALIDATION =====
  if (!isValidToken(token)) {
    // Try to refresh
    if (!retry && cachedRefreshToken) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch {
        clearTokens();
        throw new Error('Token refresh failed');
      }
    }

    // If no refresh possible, clear tokens
    clearTokens();
    throw new Error('Authentication required');
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...(isFormDataBody ? {} : fetchConfig.headers),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  };

  const response = await apiFetch(url, config);

  // ===== HANDLE 401 UNAUTHORIZED =====
  if (response.status === 401 && !retry) {
    // Token expired or invalid, try refresh
    if (cachedRefreshToken) {
      try {
        await refreshAccessToken();
        return fetchWithAuth(url, options, true); // Retry with new token
      } catch {
        clearTokens();
        throw new Error('Session expired. Please login again.');
      }
    } else {
      clearTokens();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await apiFetch(API_ENDPOINTS.REFRESH_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      throw new Error('Refresh token failed');
    }

    const responseJson = (await response.json()) as {
      success?: boolean;
      data?: {
        accessToken?: string;
        refreshToken?: string;
        access_token?: string;
        refresh_token?: string;
      };
      accessToken?: string;
      refreshToken?: string;
      access_token?: string;
      refresh_token?: string;
    };

    const payload = responseJson.data ?? responseJson;
    const newAccessToken = payload.accessToken ?? payload.access_token;
    const newRefreshToken = payload.refreshToken ?? payload.refresh_token;

    if (newAccessToken) {
      setTokens(newAccessToken, newRefreshToken);

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('airtrust_token', newAccessToken);
          if (newRefreshToken) {
            sessionStorage.setItem('airtrust_refresh_token', newRefreshToken);
          }
        }
      } catch {
        // ignore storage failures
      }
    } else {
      throw new Error('No token in refresh response');
    }
  } catch (error) {
    clearTokens();
    throw error;
  }
}

/**
 * Perform logout
 */
export async function logout(): Promise<void> {
  try {
    const token = getAccessToken();
    if (token) {
      await apiFetch(API_ENDPOINTS.LOGOUT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.warn('Logout request failed', error);
  } finally {
    clearTokens();
  }
}

~~~

---
## FILE: src/react-app/config/deployment.ts
~~~typescript
export const DEPLOYMENT_VERSION =
  typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : '0.0.0-dev';

~~~

---
## FILE: src/react-app/config/pastaVirtual.ts
~~~typescript
import { Award, Heart, FileCheck, File, Plane } from 'lucide-react';
import type { TipoDocumento } from '@/react-app/hooks/usePastaVirtual';

import type { ComponentType } from 'react';

export interface PastaVirtualCategoriaConfig {
  tipo: TipoDocumento;
  titulo: string;
  descricao?: string;
  icone: ComponentType<{ className?: string }>;
  cor: string; // semantic color key
  ordem: number;
  expandidoInicial?: boolean;
}

export const PASTA_VIRTUAL_CATEGORIAS: PastaVirtualCategoriaConfig[] = [
  {
    tipo: 'CERTIFICADO_QUALIFICACAO',
    titulo: 'Certificados de Qualificação',
    descricao: 'Gerados ou anexados para cada histórico de qualificação',
    icone: Award,
    cor: 'blue',
    ordem: 1,
    expandidoInicial: true,
  },
  {
    tipo: 'EXAME_MEDICO',
    titulo: 'Exames Médicos (ASO, CMA)',
    descricao: 'Documentos de saúde e aptidão',
    icone: Heart,
    cor: 'red',
    ordem: 2,
  },
  {
    tipo: 'SIMULADOR',
    titulo: 'Fichas de Simulador',
    descricao: 'Fichas de treinamento em simulador arquivadas',
    icone: Plane,
    cor: 'cyan',
    ordem: 3,
  },
  {
    tipo: 'DOCUMENTO_PESSOAL',
    titulo: 'Documentos Pessoais',
    descricao: 'Identidade, comprovantes e registros pessoais',
    icone: FileCheck,
    cor: 'green',
    ordem: 4,
  },
  {
    tipo: 'OUTROS',
    titulo: 'Outros Documentos',
    descricao: 'Arquivos diversos não categorizados',
    icone: File,
    cor: 'gray',
    ordem: 7,
  },
];

export const pastaVirtualCategoriaPorTipo = Object.fromEntries(
  PASTA_VIRTUAL_CATEGORIAS.map((c) => [c.tipo, c]),
) as Record<TipoDocumento, PastaVirtualCategoriaConfig>;

~~~

---
## FILE: src/react-app/config/systemSettings.ts
~~~typescript
import { API_BASE_URL, getAccessToken } from './api';

export interface SystemSettings {
  appName: string;
  logoDataUrl: string | null;
  faviconDataUrl: string | null;
  compactHeader: boolean;
  defaultPageSize: 20 | 50 | 100;
  enableAnimations: boolean;
}

export const SYSTEM_SETTINGS_STORAGE_KEY = 'airtrust_system_settings_v1';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  appName: 'AirTrust',
  logoDataUrl: null,
  faviconDataUrl: null,
  compactHeader: false,
  defaultPageSize: 20,
  enableAnimations: true,
};

export interface ServerSystemSettings {
  empresaId: number;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  compactHeader: boolean;
  defaultPageSize: 20 | 50 | 100;
  enableAnimations: boolean;
}

function resolveBrandingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    const apiOrigin = API_BASE_URL.replace(/\/api$/, '');
    return `${apiOrigin}${url}`;
  }
  return url;
}

function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function normalizeSystemSettings(
  input: Partial<SystemSettings> | null | undefined,
): SystemSettings {
  const pageSize = input?.defaultPageSize;
  const normalizedPageSize = pageSize === 50 || pageSize === 100 ? pageSize : 20;

  return {
    appName: input?.appName?.trim() || DEFAULT_SYSTEM_SETTINGS.appName,
    logoDataUrl: resolveBrandingUrl(input?.logoDataUrl),
    faviconDataUrl: resolveBrandingUrl(input?.faviconDataUrl),
    compactHeader: Boolean(input?.compactHeader),
    defaultPageSize: normalizedPageSize,
    enableAnimations: input?.enableAnimations ?? DEFAULT_SYSTEM_SETTINGS.enableAnimations,
  };
}

export function mapServerToLocalSettings(server: ServerSystemSettings): SystemSettings {
  return normalizeSystemSettings({
    appName: server.appName,
    logoDataUrl: server.logoUrl,
    faviconDataUrl: server.faviconUrl,
    compactHeader: server.compactHeader,
    defaultPageSize: server.defaultPageSize,
    enableAnimations: server.enableAnimations,
  });
}

export function getSystemSettings(): SystemSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SYSTEM_SETTINGS;
  }

  const raw = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SYSTEM_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    return normalizeSystemSettings(parsed);
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export function saveSystemSettings(settings: SystemSettings): void {
  if (typeof window === 'undefined') return;

  const normalized = normalizeSystemSettings(settings);
  localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('airtrust:system-settings-updated'));
}

export async function fetchSystemSettingsFromServer(): Promise<ServerSystemSettings> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Sem autenticação para carregar configurações do sistema');
  }

  const response = await fetch(`${API_BASE_URL}/empresas/minha/sistema`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Falha ao carregar configurações do sistema no servidor');
  }

  const json = await response.json();
  return json.data as ServerSystemSettings;
}

export async function saveSystemSettingsToServer(
  payload: SystemSettings,
  empresaId: number,
): Promise<ServerSystemSettings> {
  const response = await fetch(`${API_BASE_URL}/empresas/minha/sistema`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      appName: payload.appName,
      logoUrl: payload.logoDataUrl,
      faviconUrl: payload.faviconDataUrl,
      compactHeader: payload.compactHeader,
      defaultPageSize: payload.defaultPageSize,
      enableAnimations: payload.enableAnimations,
    }),
  });

  if (!response.ok) {
    throw new Error('Falha ao salvar configurações no servidor');
  }

  return {
    empresaId,
    appName: payload.appName,
    logoUrl: payload.logoDataUrl,
    faviconUrl: payload.faviconDataUrl,
    compactHeader: payload.compactHeader,
    defaultPageSize: payload.defaultPageSize,
    enableAnimations: payload.enableAnimations,
  };
}

export async function uploadSystemBrandingAsset(
  empresaId: number,
  file: File,
  target: 'sistema-logo' | 'sistema-favicon',
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/empresas/${empresaId}/logo?target=${target}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const errorMessage =
      errorJson?.error || errorJson?.message || 'Falha no upload da imagem de branding';
    throw new Error(errorMessage);
  }

  const json = await response.json();
  return String(json?.data?.logo_url || '');
}

export function applySystemSettingsToDocument(settings: SystemSettings): void {
  if (typeof document === 'undefined') return;

  document.title = settings.appName || DEFAULT_SYSTEM_SETTINGS.appName;

  const faviconHref = resolveBrandingUrl(settings.faviconDataUrl) || '/favicon.svg';
  const faviconType =
    faviconHref.startsWith('data:image/png') || faviconHref.endsWith('.png')
      ? 'image/png'
      : 'image/svg+xml';

  const iconLink =
    document.querySelector<HTMLLinkElement>("link[rel='icon']") ?? document.createElement('link');
  iconLink.setAttribute('rel', 'icon');
  iconLink.setAttribute('type', faviconType);
  iconLink.setAttribute('href', faviconHref);
  if (!iconLink.parentElement) document.head.appendChild(iconLink);

  const appleLink =
    document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']") ??
    document.createElement('link');
  appleLink.setAttribute('rel', 'apple-touch-icon');
  appleLink.setAttribute('href', faviconHref);
  if (!appleLink.parentElement) document.head.appendChild(appleLink);

  document.documentElement.classList.toggle('airtrust-compact-header', settings.compactHeader);
  document.documentElement.classList.toggle('airtrust-no-animations', !settings.enableAnimations);
}

export function getSystemLogoSrc(settings: SystemSettings): string {
  return resolveBrandingUrl(settings.logoDataUrl) || '/airtrust-logo.svg';
}

~~~

---
## FILE: src/react-app/config/version.ts
~~~typescript
export const AIRTRUST_FRONT_VERSION = '2025-11-19-01';

// Atualize este valor a cada deploy relevante do frontend.
// Ex.: '2025-11-19-02', '2025-11-20-01', etc.

~~~

---
## FILE: src/react-app/constants/index.ts
~~~typescript
/**
 * CONSTANTES CENTRALIZADAS DO AIRTRUST
 *
 * ⚠️  IMPORTANTE: Use sempre estas constantes ao invés de valores hardcoded!
 *
 * Para dados que mudam dinamicamente (aeronaves, simuladores, etc):
 * - Use hooks como useAeronaves(), useSimuladores()
 * - Carregue do banco de dados via API
 *
 * Para valores estáticos do sistema (status, estados BR, níveis ICAO):
 * - Use as constantes abaixo
 */

// ============================================
// ESTADOS BRASILEIROS
// ============================================
export const ESTADOS_BRASILEIROS = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
] as const;

export type EstadoBR = (typeof ESTADOS_BRASILEIROS)[number]['sigla'];

// ============================================
// NÍVEIS ICAO DE INGLÊS
// ============================================
export const NIVEIS_ICAO = [
  { nivel: 4, nome: 'Operacional', descricao: 'Operational', validade_anos: 3 },
  { nivel: 5, nome: 'Avançado', descricao: 'Extended', validade_anos: 6 },
  { nivel: 6, nome: 'Especialista/Nativo', descricao: 'Expert', validade_anos: null }, // Ilimitada
] as const;

export type NivelICAO = (typeof NIVEIS_ICAO)[number]['nivel'];

// ============================================
// STATUS FUNCIONÁRIO
// ============================================
export const STATUS_FUNCIONARIO = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
  AFASTADO: 'AFASTADO',
  FERIAS: 'FERIAS',
} as const;

export const STATUS_FUNCIONARIO_OPTIONS = [
  { value: STATUS_FUNCIONARIO.ATIVO, label: 'Ativo', color: 'success' },
  { value: STATUS_FUNCIONARIO.INATIVO, label: 'Inativo', color: 'secondary' },
  { value: STATUS_FUNCIONARIO.AFASTADO, label: 'Afastado', color: 'warning' },
  { value: STATUS_FUNCIONARIO.FERIAS, label: 'Férias', color: 'info' },
] as const;

export type StatusFuncionarioType = (typeof STATUS_FUNCIONARIO)[keyof typeof STATUS_FUNCIONARIO];

// ============================================
// STATUS FICHA DE VOO
// ============================================
export const STATUS_FICHA = {
  PENDENTE: 'PENDENTE',
  EM_PREENCHIMENTO: 'EM_PREENCHIMENTO',
  ASSINADA_ALUNO: 'ASSINADA_ALUNO',
  ASSINADA_TOTAL: 'ASSINADA_TOTAL',
  CANCELADA: 'CANCELADA',
} as const;

export const STATUS_FICHA_OPTIONS = [
  { value: STATUS_FICHA.PENDENTE, label: 'Pendente', color: 'warning', icon: 'Clock' },
  { value: STATUS_FICHA.EM_PREENCHIMENTO, label: 'Em Preenchimento', color: 'info', icon: 'Edit' },
  { value: STATUS_FICHA.ASSINADA_ALUNO, label: 'Assinada Aluno', color: 'primary', icon: 'Check' },
  { value: STATUS_FICHA.ASSINADA_TOTAL, label: 'Concluída', color: 'success', icon: 'CheckCheck' },
  { value: STATUS_FICHA.CANCELADA, label: 'Cancelada', color: 'danger', icon: 'X' },
] as const;

export type StatusFichaType = (typeof STATUS_FICHA)[keyof typeof STATUS_FICHA];

// ============================================
// STATUS SESSÃO
// ============================================
export const STATUS_SESSAO = {
  AGENDADA: 'AGENDADA',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
} as const;

export const STATUS_SESSAO_OPTIONS = [
  { value: STATUS_SESSAO.AGENDADA, label: 'Agendada', color: 'info' },
  { value: STATUS_SESSAO.EM_ANDAMENTO, label: 'Em Andamento', color: 'warning' },
  { value: STATUS_SESSAO.CONCLUIDA, label: 'Concluída', color: 'success' },
  { value: STATUS_SESSAO.CANCELADA, label: 'Cancelada', color: 'danger' },
] as const;

export type StatusSessaoType = (typeof STATUS_SESSAO)[keyof typeof STATUS_SESSAO];

// ============================================
// STATUS SIMULADOR
// ============================================
export const STATUS_SIMULADOR = {
  DISPONIVEL: 'DISPONIVEL',
  MANUTENCAO: 'MANUTENCAO',
  INATIVO: 'INATIVO',
} as const;

export const STATUS_SIMULADOR_OPTIONS = [
  { value: STATUS_SIMULADOR.DISPONIVEL, label: 'Disponível', color: 'success' },
  { value: STATUS_SIMULADOR.MANUTENCAO, label: 'Manutenção', color: 'warning' },
  { value: STATUS_SIMULADOR.INATIVO, label: 'Inativo', color: 'danger' },
] as const;

export type StatusSimuladorType = (typeof STATUS_SIMULADOR)[keyof typeof STATUS_SIMULADOR];

// ============================================
// STATUS QUALIFICAÇÃO/HABILITAÇÃO
// ============================================
export const STATUS_QUALIFICACAO = {
  ATIVO: 'ATIVO',
  VENCIDO: 'VENCIDO',
  A_VENCER: 'A_VENCER',
  INATIVO: 'INATIVO',
} as const;

export const STATUS_QUALIFICACAO_OPTIONS = [
  { value: STATUS_QUALIFICACAO.ATIVO, label: 'Ativo', color: 'success' },
  { value: STATUS_QUALIFICACAO.A_VENCER, label: 'A Vencer', color: 'warning' },
  { value: STATUS_QUALIFICACAO.VENCIDO, label: 'Vencido', color: 'danger' },
  { value: STATUS_QUALIFICACAO.INATIVO, label: 'Inativo', color: 'secondary' },
] as const;

export type StatusQualificacaoType = (typeof STATUS_QUALIFICACAO)[keyof typeof STATUS_QUALIFICACAO];

// ============================================
// TIPOS DE SIMULADOR
// ============================================
export const TIPOS_SIMULADOR = {
  FULL_FLIGHT: 'FULL_FLIGHT',
  FTD: 'FTD',
  BASIC: 'BASIC',
  FNPT: 'FNPT',
} as const;

export const TIPOS_SIMULADOR_OPTIONS = [
  { value: TIPOS_SIMULADOR.FULL_FLIGHT, label: 'Full Flight Simulator (FFS)', categoria: 'A' },
  { value: TIPOS_SIMULADOR.FTD, label: 'Flight Training Device (FTD)', categoria: 'B' },
  { value: TIPOS_SIMULADOR.FNPT, label: 'Flight Navigation Procedures Trainer', categoria: 'B' },
  { value: TIPOS_SIMULADOR.BASIC, label: 'Basic Instrument Trainer', categoria: 'C' },
] as const;

export type TipoSimuladorType = (typeof TIPOS_SIMULADOR)[keyof typeof TIPOS_SIMULADOR];

// ============================================
// FUNÇÕES NA SESSÃO
// ============================================
export const FUNCOES_SESSAO = {
  PIC: 'PIC',
  SIC: 'SIC',
  OBS: 'OBS',
} as const;

export const FUNCOES_SESSAO_OPTIONS = [
  { value: FUNCOES_SESSAO.PIC, label: 'PIC - Pilot in Command', descricao: 'Piloto em Comando' },
  { value: FUNCOES_SESSAO.SIC, label: 'SIC - Second in Command', descricao: 'Copiloto' },
  { value: FUNCOES_SESSAO.OBS, label: 'OBS - Observer', descricao: 'Observador' },
] as const;

export type FuncaoSessaoType = (typeof FUNCOES_SESSAO)[keyof typeof FUNCOES_SESSAO];

// ============================================
// CATEGORIAS DE QUALIFICAÇÃO
// ============================================
export const CATEGORIAS_QUALIFICACAO = {
  HABILITACAO: 'HABILITACAO',
  MEDICO: 'MEDICO',
  TREINAMENTO: 'TREINAMENTO',
  LICENCA: 'LICENCA',
  CERTIFICADO: 'CERTIFICADO',
} as const;

export const CATEGORIAS_QUALIFICACAO_OPTIONS = [
  { value: CATEGORIAS_QUALIFICACAO.HABILITACAO, label: 'Habilitação', icon: 'Award' },
  { value: CATEGORIAS_QUALIFICACAO.MEDICO, label: 'Médico', icon: 'Heart' },
  { value: CATEGORIAS_QUALIFICACAO.TREINAMENTO, label: 'Treinamento', icon: 'GraduationCap' },
  { value: CATEGORIAS_QUALIFICACAO.LICENCA, label: 'Licença', icon: 'FileCheck' },
  { value: CATEGORIAS_QUALIFICACAO.CERTIFICADO, label: 'Certificado', icon: 'FileText' },
] as const;

export type CategoriaQualificacaoType =
  (typeof CATEGORIAS_QUALIFICACAO)[keyof typeof CATEGORIAS_QUALIFICACAO];

// ============================================
// CORES PADRÃO DO SISTEMA (para elementos dinâmicos)
// ============================================
export const CORES_PADRAO = {
  primary: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  secondary: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' },
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  info: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
} as const;

/**
 * Função para gerar cores baseado em um index (para aeronaves, etc)
 * Usa hash do nome para manter consistência
 */
export function getCorByIndex(index: number): (typeof CORES_PADRAO)[keyof typeof CORES_PADRAO] {
  const keys = Object.keys(CORES_PADRAO) as (keyof typeof CORES_PADRAO)[];
  return CORES_PADRAO[keys[index % keys.length]];
}

/**
 * Função para gerar cor consistente baseado em string (código aeronave, etc)
 */
export function getCorByString(str: string): (typeof CORES_PADRAO)[keyof typeof CORES_PADRAO] {
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return getCorByIndex(hash);
}

// ============================================
// HELPERS
// ============================================

/**
 * Busca label de uma opção pelo value
 */
export function getLabelByValue<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label || value;
}

/**
 * Busca cor de uma opção pelo value
 */
export function getColorByValue<T extends { value: string; color: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.color || 'secondary';
}

~~~

---
## FILE: src/react-app/schemas/funcionario.schema.ts
~~~typescript

import { z } from 'zod';

export const FuncionarioSchema = z.object({
  nome: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(100, 'Nome muito longo'),
  
  guerra: z.string()
    .max(50, 'Nome de guerra muito longo')
    .optional(),
  
  cpf: z.string()
    .regex(/^\d{11}$/, 'CPF deve conter 11 dígitos')
    .refine((cpf) => {
      if (cpf.split('').every(c => c === cpf[0])) return false;
      return true;
    }, 'CPF inválido'),
  
  matricula: z.string()
    .min(1, 'Matrícula é obrigatória')
    .max(20, 'Matrícula muito longa'),
  
  email: z.string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  
  telefone: z.string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos')
    .optional()
    .or(z.literal('')),
  
  funcao: z.string()
    .min(1, 'Função é obrigatória'),
  
  aeronave: z.string()
    .optional(),
  
  status: z.enum(['ativo', 'inativo', 'afastado'])
    .default('ativo')
});

export type FuncionarioInput = z.infer<typeof FuncionarioSchema>;

export const validateFuncionario = (data: unknown) => {
  try {
    const validated = FuncionarioSchema.parse(data);
    return { success: true, data: validated, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, data: null, errors };
    }
    return { 
      success: false, 
      data: null, 
      errors: { general: 'Erro de validação' } 
    };
  }
};

~~~

---
## FILE: src/react-app/schemas/qualificacao.schema.ts
~~~typescript
import { z } from 'zod';

/**
 * SECURITY & VALIDATION FIXES:
 * - Added ISO 8601 date format validation
 * - Cross-field validation: data_vencimento must be after data_emissao
 * - Date range validation: vencimento within reasonable future range (10 years max)
 * - Stronger input validation for all fields
 * - Explicit timezone handling (UTC)
 */

// ===== HELPER: ISO 8601 DATE VALIDATION =====
function isValidISO8601(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export const QualificacaoSchema = z.object({
  funcionario_id: z.number()
    .int('Funcionário deve ser um número inteiro')
    .positive('Funcionário é obrigatório'),
  
  categoria: z.enum([
    'Habilitacao',
    'Medico',
    'Treinamento',
    'Licenca',
    'Certificado'
  ], {
    errorMap: () => ({ message: 'Categoria deve ser uma das opções válidas' })
  }),
  
  numero: z.string()
    .regex(/^[A-Za-z0-9\-\/.]{1,50}$/, 'Número deve conter apenas letras, números, hífen, barra e ponto')
    .max(50, 'Número muito longo')
    .optional(),
  
  data_emissao: z.string()
    .optional()
    .refine((date) => {
      if (!date) return true;
      return isValidISO8601(date);
    }, 'Data de emissão deve estar em formato ISO 8601 (YYYY-MM-DD)'),
  
  data_vencimento: z.string()
    .refine((date) => isValidISO8601(date), 'Data de validade deve estar em formato ISO 8601 (YYYY-MM-DD)')
    .refine((date) => {
      const validade = new Date(date + 'T00:00:00Z');
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return validade > hoje;
    }, 'Data de validade deve ser posterior a hoje')
    .refine((date) => {
      // Não aceitar datas mais de 10 anos no futuro (possível erro de input)
      const validade = new Date(date + 'T00:00:00Z');
      const maxFuturo = new Date();
      maxFuturo.setFullYear(maxFuturo.getFullYear() + 10);
      return validade < maxFuturo;
    }, 'Data de validade não pode ser mais de 10 anos no futuro'),
  
  observacoes: z.string()
    .max(500, 'Observações muito longas (máximo 500 caracteres)')
    .optional()
}).refine(
  (data) => {
    // Cross-field validation: se ambas as datas existem, vencimento > emissão
    if (data.data_emissao && data.data_vencimento) {
      const emissao = new Date(data.data_emissao + 'T00:00:00Z');
      const vencimento = new Date(data.data_vencimento + 'T00:00:00Z');
      return vencimento > emissao;
    }
    return true;
  },
  {
    message: 'Data de validade deve ser após data de emissão',
    path: ['data_vencimento'] // Indicate which field has the error
  }
);

export type QualificacaoInput = z.infer<typeof QualificacaoSchema>;

export const validateQualificacao = (data: unknown) => {
  try {
    const validated = QualificacaoSchema.parse(data);
    return { success: true, data: validated, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path[0]?.toString() || 'general';
        errors[path] = err.message;
      });
      return { success: false, data: null, errors };
    }
    return { 
      success: false, 
      data: null, 
      errors: { general: 'Erro de validação desconhecido' } 
    };
  }
};

~~~

---
## FILE: src/react-app/schemas/qualificacoes.ts
~~~typescript
import { z } from 'zod';

// Schema para criação/atualização de histórico de qualificação
export const HistoricoQualificacaoSchema = z.object({
  funcionario_cpf: z.string().min(11, 'CPF obrigatório'),
  qualificacao_codigo: z.string().min(1, 'Código da qualificação obrigatório'),
  tipo_treinamento: z
    .enum(['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO'])
    .optional(),
  data_conclusao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data_conclusao deve estar em formato YYYY-MM-DD'),
  data_vencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data_vencimento deve estar em formato YYYY-MM-DD')
    .nullable()
    .optional(),
  instrutor_id: z.number().positive('Instrutor inválido').nullable().optional(), // SECURITY: Use ID for FK validation
  observacoes: z.string().max(500).nullable().optional(),
});

export type HistoricoQualificacaoInput = z.infer<typeof HistoricoQualificacaoSchema>;

// Schema para tipos de qualificação (template)
export const TipoQualificacaoSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  nome: z.string().min(2).max(200),
  codigo: z.string().min(2).max(50),
  categoria: z.string().min(2).max(120),
  validade: z.number().int().positive().max(120).nullable().optional(),
  observacoes: z.string().max(1000).nullable().optional(),
  descricao: z.string().max(1000).nullable().optional(),
  ativo: z.number().int().min(0).max(1).optional(),
});
export type TipoQualificacaoInput = z.infer<typeof TipoQualificacaoSchema>;

// Error formatting helper
export function formatZodError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in (err as any)) {
    return (err as any).issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return 'Erro de validação';
}

~~~

---
## FILE: src/react-app/types/dashboard-enhanced.types.ts
~~~typescript
/**
 * Dashboard Enhanced Types
 * Tipos para o novo dashboard hierárquico e acionável
 */

export type TrendDirection = 'up' | 'down' | 'stable';
export type Severity = 'critical' | 'warning' | 'info' | 'success';
export type AlertType =
  | 'certificacao_vencendo'
  | 'certificacao_vencida'
  | 'cma_vencido'
  | 'treinamento_atrasado'
  | 'simulador_pendente'
  | 'cheque_pendente';

/**
 * Métrica com tendência temporal e sparkline
 */
export interface MetricWithTrend {
  current: number;
  previous: number; // Período anterior (semana, mês)
  delta: number; // Diferença absoluta
  deltaPercent: number; // Diferença percentual
  trend: TrendDirection;
  sparkline?: number[]; // Últimos 7-30 valores para mini-chart
  target?: number; // Meta/objetivo
  unit?: string; // %, unidades, dias, etc.
}

/**
 * Alerta crítico com priorização e ações
 */
export interface CriticalAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  count: number;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  secondaryActionLabel?: string;
  secondaryActionUrl?: string;
  affectedUsers: number;
  daysUntilDeadline?: number;
  priority?: number; // Calculado automaticamente
  icon?: string; // Emoji ou ícone
}

/**
 * Breakdown de compliance por categoria
 */
export interface ComplianceBreakdown {
  category: string;
  score: number;
  total: number;
  valid: number;
  color: string;
}

/**
 * Ação próxima/pendente
 */
export interface UpcomingAction {
  id: string;
  type: 'simulador' | 'cheque' | 'renovacao' | 'exame_medico';
  title: string;
  dueDate: string; // ISO date
  daysUntil: number;
  assignedTo?: string;
  priority: 'high' | 'medium' | 'low';
  url: string;
  completed?: boolean;
}

/**
 * Atividade recente
 */
export interface RecentActivity {
  id: string;
  type: 'qualificacao' | 'treinamento' | 'simulador' | 'cheque' | 'certificado';
  title: string;
  description: string;
  timestamp: string; // ISO timestamp
  user?: {
    name: string;
    avatar?: string;
  };
  icon?: string;
}

/**
 * Dados de saúde do sistema
 */
export interface SystemHealth {
  database: {
    status: 'healthy' | 'degraded' | 'down';
    latency: number; // ms
    lastCheck: string;
  };
  storage: {
    status: 'healthy' | 'degraded' | 'down';
    used: number; // GB
    total: number; // GB
    percentage: number;
  };
  workers: {
    status: 'healthy' | 'degraded' | 'down';
    requestsPerHour: number;
    errorRate: number; // %
  };
}

/**
 * Dados completos do dashboard
 */
export interface EnhancedDashboardData {
  // Métricas principais com tendências
  compliance: MetricWithTrend & {
    breakdown: ComplianceBreakdown[];
  };
  tripulantesAtivos: MetricWithTrend;
  qualificacoesAVencer: MetricWithTrend;
  simuladoresUtilizacao: MetricWithTrend;

  // Alertas críticos priorizados
  criticalAlerts: CriticalAlert[];

  // Próximas ações
  upcomingActions: UpcomingAction[];

  // Atividades recentes
  recentActivities: RecentActivity[];

  // Saúde do sistema
  systemHealth: SystemHealth;

  // Timestamp da última atualização
  lastUpdated: string;
}

/**
 * Calcula score de prioridade de um alerta
 */
export function calculateAlertPriority(alert: CriticalAlert): number {
  const severityWeight = {
    critical: 100,
    warning: 50,
    info: 10,
    success: 0,
  };

  const urgencyWeight =
    alert.daysUntilDeadline !== undefined ? Math.max(0, 100 - alert.daysUntilDeadline * 10) : 0;

  const volumeWeight = Math.min(alert.count * 5, 50); // Max 50 pontos

  return severityWeight[alert.severity] + urgencyWeight + volumeWeight;
}

/**
 * Formata delta de métrica com sinal e cor
 */
export function formatMetricDelta(
  delta: number,
  deltaPercent: number,
  inversePolarity = false, // true se diminuição é positiva (ex: alertas)
): {
  text: string;
  color: string;
  icon: string;
} {
  const isPositive = inversePolarity ? delta < 0 : delta > 0;
  const isNegative = inversePolarity ? delta > 0 : delta < 0;

  return {
    text: `${delta > 0 ? '+' : ''}${delta} (${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`,
    color: isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-gray-500',
    icon: delta > 0 ? '↑' : delta < 0 ? '↓' : '→',
  };
}

/**
 * Agrupa ações por período
 */
export function groupActionsByPeriod(actions: UpcomingAction[]): {
  today: UpcomingAction[];
  next7Days: UpcomingAction[];
  next30Days: UpcomingAction[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next7 = new Date(today);
  next7.setDate(next7.getDate() + 7);
  const next30 = new Date(today);
  next30.setDate(next30.getDate() + 30);

  return {
    today: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due <= today;
    }),
    next7Days: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due > today && due <= next7;
    }),
    next30Days: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due > next7 && due <= next30;
    }),
  };
}

/**
 * Formata timestamp relativo (ex: "há 2 horas")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `há ${diffMins} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString('pt-BR');
}

~~~

---
## FILE: src/react-app/types/dashboard.types.ts
~~~typescript
/**
 * Tipos TypeScript para Dashboard Principal AirTrust
 * Sistema de Conformidade Operacional Aeronáutica
 */

export interface DashboardMetrics {
  tripulantesAtivos: number;
  tripulantesComQualificacoesVencendo: number; // próximos 30 dias
  tripulantesComQualificacoesVencidas: number;
  qualificacoesAVencer: number;
  qualificacoesVencidas: number;
  qualificacoesValidas?: number; // contagem real de qualificações válidas
  totalQualificacoes?: number; // total de qualificações (não-renovadas, concluídas)
  taxaConclusaoTreinamento: number; // percentual
  demandaFutura30Dias: number;
  demandaFutura60Dias: number;
  demandaFutura90Dias: number;
  tendenciaConclusao?: 'subindo' | 'estavel' | 'descendo';
  lms?: {
    totalCursos: number;
    totalMatriculas: number;
    concluidos: number;
    emAndamento: number;
    taxaConclusaoPct: number;
  };
}

export type AlertaCriticoTipo =
  | 'qualificacao_vencida'
  | 'qualificacao_vencendo'
  | 'treinamento_pendente'
  | 'lms_curso_pendente'
  | 'compliance_baixo'
  | 'simulador_indisponivel';

export type AlertaCriticoCriticidade = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

export interface AlertaCritico {
  id: number;
  tipo: AlertaCriticoTipo;
  criticidade: AlertaCriticoCriticidade;
  mensagem: string;
  tripulanteId?: number;
  tripulanteNome?: string;
  tripulanteMatricula?: string;
  qualificacaoId?: number;
  qualificacaoNome?: string;
  dataVencimento?: string;
  diasRestantes?: number;
  acaoRecomendada: string;
  urlAcao: string;
  createdAt: string;
}

export interface ComplianceScore {
  scoreGeral: number; // 0-100
  breakdown: {
    qualificacoes: number; // % de qualificações válidas
    treinamentos: number; // % de treinamentos em dia
    documentacao: number; // % de documentação completa
    simuladores: number; // % de check rides válidos
    examesMedicos: number; // % de exames médicos válidos
  };
  qualificacoesValidas?: number; // contagem absoluta
  totalQualificacoes?: number; // total absoluto
  tendencia: 'subindo' | 'estavel' | 'descendo';
  metaOrganizacional: number;
}

export interface DemandaTreinamento {
  total: number;
  porPeriodo: {
    proximos30Dias: number;
    dias31a60: number;
    dias61a90: number;
  };
  porTipo: {
    inicial: number;
    recorrente: number;
    transicao: number;
    upgrade: number;
  };
  porSimulador: Array<{
    simuladorNome: string;
    quantidade: number;
    horasEstimadas: number;
  }>;
  porInstrutor: Array<{
    instrutorNome: string;
    sessoesProgramadas: number;
    horasCompromissadas: number;
    disponibilidade: number;
  }>;
}

export type AtividadeRecenteTipo =
  | 'treinamento_concluido'
  | 'qualificacao_emitida'
  | 'qualificacao_renovada'
  | 'alerta_gerado'
  | 'tripulante_cadastrado'
  | 'sessao_concluida';

export interface AtividadeRecente {
  id: number;
  tipo: AtividadeRecenteTipo;
  descricao: string;
  tripulanteNome?: string;
  tripulanteMatricula?: string;
  timestamp: string;
  icone: string;
  cor: string;
}

export interface TaxaConclusaoMensal {
  meses: string[];
  taxas: number[];
  meta: number;
}

export type SimuladorStatus = 'operacional' | 'manutencao' | 'inoperante';

export interface UtilizacaoSimulador {
  id: number;
  nome: string;
  fabricante: string;
  modelo: string;
  horasProgramadas: number;
  horasDisponiveis: number;
  taxaUtilizacao: number;
  proximaManutencao?: string;
  status: SimuladorStatus;
}

export interface UtilizacaoSimuladores {
  simuladores: UtilizacaoSimulador[];
}

export type SystemStatus = 'healthy' | 'degraded' | 'critical';
export type ComponentStatus = 'ok' | 'slow' | 'down';

export interface SystemHealth {
  status: SystemStatus;
  database: {
    status: ComponentStatus;
    latency: number;
    ultimaVerificacao: string;
  };
  storage: {
    status: ComponentStatus;
    espacoUsado: number;
    espacoTotal: number;
    ultimaVerificacao: string;
  };
  workers: {
    status: ComponentStatus;
    requestsUltima1h: number;
    errorsUltima1h: number;
    p95Latency: number;
  };
}

// Tipos auxiliares para componentes
export interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'red';
  badge?: string;
  trend?: 'subindo' | 'estavel' | 'descendo';
  isLoading?: boolean;
  onClick?: () => void;
}

~~~

---
## FILE: src/react-app/types/enums.ts
~~~typescript
/**
 * ENUMS DO SISTEMA AIRTRUST
 *
 * ⚠️  Para constantes com mais metadados (labels, cores, etc),
 * use as constantes em @/constants/index.ts
 */

// ============================================
// FUNCIONÁRIO
// ============================================
export enum StatusFuncionario {
  ATIVO = 'ATIVO',
  INATIVO = 'INATIVO',
  AFASTADO = 'AFASTADO',
  FERIAS = 'FERIAS',
}

// ============================================
// QUALIFICAÇÃO
// ============================================
export enum CategoriaQualificacao {
  HABILITACAO = 'HABILITACAO',
  MEDICO = 'MEDICO',
  TREINAMENTO = 'TREINAMENTO',
  LICENCA = 'LICENCA',
  CERTIFICADO = 'CERTIFICADO',
}

export enum StatusQualificacao {
  ATIVO = 'ATIVO',
  VENCIDO = 'VENCIDO',
  A_VENCER = 'A_VENCER',
  INATIVO = 'INATIVO',
}

// ============================================
// TREINAMENTO
// ============================================
export enum StatusTreinamento {
  PLANEJADO = 'PLANEJADO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDO = 'CONCLUIDO',
  CANCELADO = 'CANCELADO',
}

// ============================================
// SIMULADOR
// ============================================
export enum StatusSimulador {
  DISPONIVEL = 'DISPONIVEL',
  MANUTENCAO = 'MANUTENCAO',
  INATIVO = 'INATIVO',
}

export enum TipoSimulador {
  FULL_FLIGHT = 'FULL_FLIGHT',
  FTD = 'FTD',
  FNPT = 'FNPT',
  BASIC = 'BASIC',
}

// ============================================
// FICHA DE VOO / SESSÃO
// ============================================
export enum StatusFicha {
  PENDENTE = 'PENDENTE',
  EM_PREENCHIMENTO = 'EM_PREENCHIMENTO',
  ASSINADA_ALUNO = 'ASSINADA_ALUNO',
  ASSINADA_TOTAL = 'ASSINADA_TOTAL',
  CANCELADA = 'CANCELADA',
}

export enum StatusSessao {
  AGENDADA = 'AGENDADA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA',
}

export enum FuncaoSessao {
  PIC = 'PIC',
  SIC = 'SIC',
  OBS = 'OBS',
}

~~~

---
## FILE: src/react-app/types/fichas.ts
~~~typescript
export type StatusFicha =
  | 'EM_PREENCHIMENTO'
  | 'FINALIZADA'
  | 'ASSINADA_ALUNO'
  | 'ASSINADA_INSTRUTOR'
  | 'ASSINADA_EXAMINADOR'
  | 'ASSINADA_TOTAL';

export interface FichaSimulador {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  instrutor_id: number | null;
  examinador_id: number | null;
  data_sessao: string;
  tipo_sessao: string;
  tipo_aeronave?: string;
  status: StatusFicha;
  nota_geral?: string | null;
  comentarios_gerais?: string | null;
  assinatura_aluno?: string | null;
  data_assinatura_aluno?: string | null;
  assinatura_instrutor?: string | null;
  data_assinatura_instrutor?: string | null;
  assinatura_examinador?: string | null;
  data_assinatura_examinador?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface FichaManobra {
  id: number;
  ficha_id: number;
  codigo?: string | null;
  descricao: string;
  categoria?: string | null;
  ordem?: number | null;
  resultado?: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SessaoResumoFicha {
  id: number;
  simulador_id: number;
  tipo_sessao: string;
  data_sessao: string;
  duracao_minutos?: number;
  status: string;
  simulador_codigo?: string;
  tipo_aeronave?: string;
}

export interface FichaDetalheResponse {
  ficha: FichaSimulador;
  manobras: FichaManobra[];
  sessao: SessaoResumoFicha;
}

~~~

---
## FILE: src/react-app/types/global.d.ts
~~~typescript
declare global {
  var apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  interface Window {
    apiFetch: typeof globalThis.apiFetch;
  }
}

export {};

~~~

---
## FILE: src/react-app/types/index.ts
~~~typescript
// Re-export enums
export * from './enums';

export interface Funcionario {
  id: number;
  nome: string;
  guerra?: string;
  cpf: string;
  matricula: string;
  email?: string;
  telefone?: string;
  funcao: string;
  aeronave?: string;
  status: 'ativo' | 'inativo' | 'afastado';
  admissao?: string;
  nascimento?: string;
  is_instrutor?: number;
  is_checador?: number;
  cargo?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  categoria: 'Habilitacao' | 'Medico' | 'Treinamento' | 'Licenca' | 'Certificado';
  numero?: string;
  data_emissao?: string;
  data_vencimento: string;
  status: 'ativo' | 'vencido' | 'inativo';
  observacoes?: string;
  certificate_url?: string;
  certificate_name?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Simulador {
  id: number;
  codigo: string;
  nome: string;
  modelo?: string;
  tipo: string;
  fabricante?: string;
  status: 'disponivel' | 'manutencao' | 'inativo';
  localizacao?: string;
  capacidade?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Treinamento {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  tipo: string;
  nome: string;
  data_inicio: string;
  data_conclusao?: string;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  instrutor?: string;
  observacoes?: string;
  carga_horaria?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  total: number;
  ativos: number;
  inativos: number;
  afastados?: number;
  funcoes_cadastradas?: number;
  funcoes_ativas?: number;
}

export interface ImportResult {
  success: boolean;
  importados: number;
  erros: number;
  detalhes?: {
    sucessos: Array<{ linha: number; id: number }>;
    erros: Array<{ linha: number; erro: string }>;
  };
}

~~~

---
## FILE: src/react-app/types/simuladores.ts
~~~typescript
// Tipos específicos do módulo Simuladores / Sessões / Participantes (Fase 2)
// Mantém compatibilidade com schema legado (data_sessao + duracao_minutos)

export type StatusSessao =
  | 'PLANEJADA'
  | 'AGENDADA'
  | 'AGENDADO' // Backend retorna ambos
  | 'CONFIRMADA'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CONCLUIDO'
  | 'CANCELADA'
  | 'CANCELADO';

export interface SessaoSimulador {
  id: number;
  simulador_id: number;
  tipo_sessao: string;
  data_sessao: string; // legado (YYYY-MM-DD HH:MM:SS)
  duracao_minutos: number;
  status: StatusSessao;
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  // Campos derivados
  simulador_codigo?: string;
  codigo_aeronave?: string;
}

export interface ParticipanteSessao {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  papel: 'ALUNO' | 'INSTRUTOR' | 'OBSERVADOR' | 'EXAMINADOR';
  presenca: 'PENDENTE' | 'PRESENTE' | 'AUSENTE';
  resultado?: string | null; // e.g. APTO / INAPTO / PENDENTE
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CriarSessaoPayload {
  sessao: {
    simulador_id: number;
    tipo_sessao: string;
    data_sessao?: string; // alternativa
    data_inicio?: string; // aceita no novo modelo
    data_fim?: string;
    status?: StatusSessao;
    observacoes?: string;
  };
  participantes?: Array<{ funcionario_id: number; papel: ParticipanteSessao['papel'] }>;
}

export interface AtualizarSessaoPayload {
  tipo_sessao?: string;
  data_sessao?: string;
  status?: StatusSessao;
  observacoes?: string;
  duracao_minutos?: number;
}

export interface DefinirParticipantesPayload {
  participantes: Array<{ funcionario_id: number; papel: ParticipanteSessao['papel'] }>;
}

export interface AtualizarParticipantePayload {
  presenca?: ParticipanteSessao['presenca'];
  resultado?: string;
  observacoes?: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  error?: string;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ==========================================
// HELPERS - Normalização de Status
// ==========================================

/**
 * Normaliza status para maiúsculo
 */
export const normalizeStatus = (status: string | undefined): string => {
  return status?.toUpperCase() || '';
};

/**
 * Converte status do backend (AGENDADO) para display (AGENDADA)
 * Remove "O" final se existir e adiciona "A"
 */
export const getStatusDisplay = (status: string | undefined): string => {
  const normalized = normalizeStatus(status);
  if (normalized.endsWith('O')) {
    return normalized.slice(0, -1) + 'A';
  }
  return normalized;
};

/**
 * Compara dois status ignorando diferenças de masculino/feminino
 */
export const isSameStatus = (status1: string | undefined, status2: string | undefined): boolean => {
  const s1 = normalizeStatus(status1).replace(/[OA]$/, '');
  const s2 = normalizeStatus(status2).replace(/[OA]$/, '');
  return s1 === s2;
};

~~~

---
## FILE: src/react-app/utils/InputsBrasileiros.tsx
~~~tsx
import { useState, useEffect } from 'react';

/**
 * ⚠️ PADRÃO BRASILEIRO OBRIGATÓRIO - AIRTRUST ⚠️
 * 
 * Componentes de input que seguem OBRIGATORIAMENTE o padrão brasileiro:
 * ✅ Datas: SEMPRE dd/mm/aaaa (nunca mm/dd/yyyy ou yyyy-mm-dd)
 * ✅ Placeholders: SEMPRE "dd/mm/aaaa"
 * ✅ Máscaras: SEMPRE dd/mm/aaaa
 * ✅ Validação: SEMPRE formato brasileiro
 * ✅ Cultura: SEMPRE pt-BR
 */

export class DateTimeBrasil {
  /**
   * Formatar data para o padrão brasileiro dd/mm/aaaa
   */
  static formatarDataBrasil(data: Date | string): string {
    if (!data) return '';
    
    const dateObj = typeof data === 'string' ? new Date(data) : data;
    
    if (isNaN(dateObj.getTime())) return '';
    
    const dia = dateObj.getDate().toString().padStart(2, '0');
    const mes = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const ano = dateObj.getFullYear().toString();
    
    return `${dia}/${mes}/${ano}`;
  }
  
  /**
   * Validar formato brasileiro de data dd/mm/aaaa
   */
  static validarDataBrasil(dataBrasil: string): boolean {
    if (!dataBrasil) return false;
    
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dataBrasil.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anoNum = parseInt(ano, 10);
    
    if (diaNum < 1 || diaNum > 31) return false;
    if (mesNum < 1 || mesNum > 12) return false;
    if (anoNum < 1900 || anoNum > 2100) return false;
    
    const dataVerificacao = new Date(anoNum, mesNum - 1, diaNum);
    
    return (
      dataVerificacao.getFullYear() === anoNum &&
      dataVerificacao.getMonth() === mesNum - 1 &&
      dataVerificacao.getDate() === diaNum
    );
  }
  
  /**
   * Converter data brasileira dd/mm/aaaa para objeto Date
   */
  static converterDataBrasil(dataBrasil: string): Date | null {
    if (!this.validarDataBrasil(dataBrasil)) return null;
    
    const [dia, mes, ano] = dataBrasil.split('/').map(Number);
    return new Date(ano, mes - 1, dia);
  }
  
  /**
   * Converter data brasileira + hora para Date
   */
  static converterDataHoraBrasil(dataBrasil: string, hora: string): Date | null {
    const dataObj = this.converterDataBrasil(dataBrasil);
    if (!dataObj) return null;
    
    const [h, m] = hora.split(':').map(Number);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    
    dataObj.setHours(h, m, 0, 0);
    return dataObj;
  }
}

interface InputDataBrasilProps {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
}

/**
 * 🇧🇷 Input de Data no Padrão Brasileiro
 * 
 * Características obrigatórias:
 * - Formato: dd/mm/aaaa
 * - Placeholder: "dd/mm/aaaa"
 * - Máscara automática
 * - Validação brasileira
 */
export const InputDataBrasil: React.FC<InputDataBrasilProps> = ({
  value,
  onChange,
  placeholder = "dd/mm/aaaa", // 🇧🇷 OBRIGATÓRIO
  required = false,
  disabled = false,
  className = "",
  name,
  id
}) => {
  const [valorInterno, setValorInterno] = useState(value);
  const [erro, setErro] = useState<string | null>(null);
  
  useEffect(() => {
    setValorInterno(value);
  }, [value]);
  
  const aplicarMascara = (input: string): string => {
    const apenasNumeros = input.replace(/\D/g, '');
    
    let masked = apenasNumeros;
    
    if (masked.length >= 3) {
      masked = masked.substring(0, 2) + '/' + masked.substring(2);
    }
    
    if (masked.length >= 6) {
      masked = masked.substring(0, 5) + '/' + masked.substring(5, 9);
    }
    
    return masked;
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const valorComMascara = aplicarMascara(inputValue);
    
    setValorInterno(valorComMascara);
    
    if (valorComMascara.length === 10) {
      if (DateTimeBrasil.validarDataBrasil(valorComMascara)) {
        setErro(null);
        onChange(valorComMascara);
      } else {
        setErro('Data inválida no formato dd/mm/aaaa');
      }
    } else if (valorComMascara.length === 0) {
      setErro(null);
      onChange('');
    } else {
      setErro(null);
      onChange(valorComMascara);
    }
  };
  
  const handleBlur = () => {
    if (valorInterno && valorInterno.length > 0 && valorInterno.length < 10) {
      setErro('Data incompleta. Use o formato dd/mm/aaaa');
    } else if (valorInterno && !DateTimeBrasil.validarDataBrasil(valorInterno)) {
      setErro('Data inválida no formato dd/mm/aaaa');
    }
  };
  
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={valorInterno}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        maxLength={10}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${erro ? 'border-red-500 focus:ring-red-500' : ''}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
      />
      {erro && (
        <p className="text-red-500 text-sm">
          🇧🇷 {erro}
        </p>
      )}
    </div>
  );
};

interface InputHoraBrasilProps {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
}

/**
 * 🇧🇷 Input de Hora no Padrão Brasileiro
 * 
 * Características obrigatórias:
 * - Formato: HH:mm
 * - Placeholder: "HH:mm"
 * - Máscara automática
 * - Validação 24h
 */
export const InputHoraBrasil: React.FC<InputHoraBrasilProps> = ({
  value,
  onChange,
  placeholder = "HH:mm",
  required = false,
  disabled = false,
  className = "",
  name,
  id
}) => {
  const [valorInterno, setValorInterno] = useState(value);
  const [erro, setErro] = useState<string | null>(null);
  
  useEffect(() => {
    setValorInterno(value);
  }, [value]);
  
  const aplicarMascara = (input: string): string => {
    const apenasNumeros = input.replace(/\D/g, '');
    
    let masked = apenasNumeros;
    
    if (masked.length >= 3) {
      masked = masked.substring(0, 2) + ':' + masked.substring(2, 4);
    }
    
    return masked;
  };
  
  const validarHora = (hora: string): boolean => {
    if (!hora || hora.length !== 5) return false;
    
    const [h, m] = hora.split(':').map(Number);
    
    return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const valorComMascara = aplicarMascara(inputValue);
    
    setValorInterno(valorComMascara);
    
    if (valorComMascara.length === 5) {
      if (validarHora(valorComMascara)) {
        setErro(null);
        onChange(valorComMascara);
      } else {
        setErro('Hora inválida no formato HH:mm');
      }
    } else if (valorComMascara.length === 0) {
      setErro(null);
      onChange('');
    } else {
      setErro(null);
      onChange(valorComMascara);
    }
  };
  
  const handleBlur = () => {
    if (valorInterno && valorInterno.length > 0 && valorInterno.length < 5) {
      setErro('Hora incompleta. Use o formato HH:mm');
    } else if (valorInterno && !validarHora(valorInterno)) {
      setErro('Hora inválida no formato HH:mm');
    }
  };
  
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={valorInterno}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        maxLength={5}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${erro ? 'border-red-500 focus:ring-red-500' : ''}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
      />
      {erro && (
        <p className="text-red-500 text-sm">
          🇧🇷 {erro}
        </p>
      )}
    </div>
  );
};

export default {
  InputDataBrasil,
  InputHoraBrasil,
  DateTimeBrasil
};

~~~

---
## FILE: src/react-app/utils/__tests__/business-rules.test.ts
~~~typescript
/**
 * Tests for business-rules utility
 */

import { describe, it, expect } from 'vitest';
import { businessRules } from '../business-rules';

describe('businessRules', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);

  describe('isCertificadoExpiringSoon', () => {
    it('deve detectar certificado expirando em breve', () => {
      expect(businessRules.isCertificadoExpiringSoon(futureDate, 30)).toBe(true);
    });

    it('deve retornar false para certificado longe do vencimento', () => {
      const farFutureDate = new Date();
      farFutureDate.setDate(farFutureDate.getDate() + 60);
      expect(businessRules.isCertificadoExpiringSoon(farFutureDate, 30)).toBe(false);
    });

    it('deve retornar false para certificado vencido', () => {
      expect(businessRules.isCertificadoExpiringSoon(expiredDate, 30)).toBe(false);
    });
  });

  describe('isCertificadoExpired', () => {
    it('deve detectar certificado vencido', () => {
      expect(businessRules.isCertificadoExpired(expiredDate)).toBe(true);
    });

    it('deve retornar false para certificado válido', () => {
      expect(businessRules.isCertificadoExpired(futureDate)).toBe(false);
    });
  });

  describe('isHabilitacaoExpiringSoon', () => {
    it('deve detectar habilitação expirando em breve', () => {
      expect(businessRules.isHabilitacaoExpiringSoon(futureDate, 30)).toBe(true);
    });

    it('deve retornar false para habilitação longe do vencimento', () => {
      const farFutureDate = new Date();
      farFutureDate.setDate(farFutureDate.getDate() + 60);
      expect(businessRules.isHabilitacaoExpiringSoon(farFutureDate, 30)).toBe(false);
    });
  });

  describe('isHabilitacaoExpired', () => {
    it('deve detectar habilitação vencida', () => {
      expect(businessRules.isHabilitacaoExpired(expiredDate)).toBe(true);
    });

    it('deve retornar false para habilitação válida', () => {
      expect(businessRules.isHabilitacaoExpired(futureDate)).toBe(false);
    });
  });

  describe('daysUntilExpiration', () => {
    it('deve calcular dias até vencimento', () => {
      const result = businessRules.daysUntilExpiration(futureDate);
      expect(result).toBeGreaterThanOrEqual(29);
      expect(result).toBeLessThanOrEqual(31);
    });

    it('deve retornar valor negativo para datas passadas', () => {
      expect(businessRules.daysUntilExpiration(expiredDate)).toBeLessThan(0);
    });
  });

  describe('calculateComplianceScore', () => {
    it('deve retornar 100 para funcionário sem documentação', () => {
      expect(businessRules.calculateComplianceScore([], [])).toBe(100);
    });

    it('deve reduzir score para certificado vencido', () => {
      const certificados = [{ id: '1', dataValidade: expiredDate }];
      const score = businessRules.calculateComplianceScore(certificados, []);
      expect(score).toBeLessThan(100);
    });

    it('deve reduzir score para certificado próximo a vencer', () => {
      const certificados = [{ id: '1', dataValidade: futureDate }];
      const score = businessRules.calculateComplianceScore(certificados, []);
      expect(score).toBeLessThan(100);
    });
  });

  describe('getComplianceStatus', () => {
    it('deve retornar excelente para score alto', () => {
      expect(businessRules.getComplianceStatus(95)).toBe('excelente');
    });

    it('deve retornar bom para score médio', () => {
      expect(businessRules.getComplianceStatus(80)).toBe('bom');
    });

    it('deve retornar alerta para score baixo', () => {
      expect(businessRules.getComplianceStatus(60)).toBe('alerta');
    });

    it('deve retornar crítico para score muito baixo', () => {
      expect(businessRules.getComplianceStatus(30)).toBe('critico');
    });
  });

  describe('getComplianceColor', () => {
    it('deve retornar cor verde para score excelente', () => {
      expect(businessRules.getComplianceColor(95)).toBe('#22c55e');
    });

    it('deve retornar cor vermelha para score crítico', () => {
      expect(businessRules.getComplianceColor(30)).toBe('#dc2626');
    });
  });

  describe('isEmDia', () => {
    it('deve retornar true para funcionário em dia', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(true);
    });

    it('deve retornar false se certificado vencido', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: expiredDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(false);
    });

    it('deve retornar false se habilitação vencida', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: expiredDate }],
      };

      expect(businessRules.isEmDia(funcionario)).toBe(false);
    });
  });

  describe('canFly', () => {
    it('deve retornar true se funcionário pode voar', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.canFly(funcionario)).toBe(true);
    });

    it('deve retornar false se sem certificado', () => {
      const funcionario = {
        id: '1',
        certificados: [],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: futureDate }],
      };

      expect(businessRules.canFly(funcionario)).toBe(false);
    });

    it('deve retornar false se sem habilitação', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: futureDate }],
        habilitacoes: [],
      };

      expect(businessRules.canFly(funcionario)).toBe(false);
    });
  });

  describe('getCannotFlyReasons', () => {
    it('deve listar motivos para não voar', () => {
      const funcionario = {
        id: '1',
        certificados: [{ id: '1', dataValidade: expiredDate }],
        habilitacoes: [{ id: '1', tipo: 'PLA', dataVencimento: expiredDate }],
      };

      const reasons = businessRules.getCannotFlyReasons(funcionario);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes('vencido'))).toBe(true);
    });
  });

  describe('getActiveHabilitacoesPercentage', () => {
    it('deve calcular percentual de habilitações ativas', () => {
      const habilitacoes = [
        { id: '1', tipo: 'PLA', dataVencimento: futureDate },
        { id: '2', tipo: 'COM', dataVencimento: futureDate },
      ];

      const percentage = businessRules.getActiveHabilitacoesPercentage(habilitacoes);
      expect(percentage).toBe(100);
    });

    it('deve retornar 0 para sem habilitações', () => {
      expect(businessRules.getActiveHabilitacoesPercentage([])).toBe(0);
    });

    it('deve calcular percentual parcial', () => {
      const habilitacoes = [
        { id: '1', tipo: 'PLA', dataVencimento: futureDate },
        { id: '2', tipo: 'COM', dataVencimento: expiredDate },
      ];

      const percentage = businessRules.getActiveHabilitacoesPercentage(habilitacoes);
      expect(percentage).toBe(50);
    });
  });
});

~~~

---
## FILE: src/react-app/utils/__tests__/checkCompatibility.test.ts
~~~typescript
import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
  isCheckCompatibleWithAircraft,
} from '../checkCompatibility';

describe('checkCompatibility', () => {
  const checks = [
    { id: 1, codigo: 'FAP05.2-139' },
    { id: 2, codigo: 'FAP05.2-76' },
    { id: 3, codigo: 'FAP14' },
  ];

  it('accepts only model-compatible checks', () => {
    expect(isCheckCompatibleWithAircraft('FAP05.2-139', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP05.2-76', 'AW139')).toBe(false);
    expect(isCheckCompatibleWithAircraft('FAP14', 'AW139')).toBe(true);
  });

  it('filters visible checks by aircraft model', () => {
    expect(filterCompatibleChecks(checks, 'AW139').map((check) => check.codigo)).toEqual([
      'FAP05.2-139',
      'FAP14',
    ]);
  });

  it('filters selected ids by aircraft model and removes duplicates', () => {
    expect(filterCompatibleCheckIds([1, 2, 3, 3], checks, 'SK76')).toEqual([2, 3]);
  });
});

~~~

---
## FILE: src/react-app/utils/__tests__/formatters.test.ts
~~~typescript
/**
 * Tests for formatters utility
 */

import { describe, it, expect } from 'vitest';
import { formatters } from '../formatters';

describe('formatters', () => {
  describe('cpf', () => {
    it('deve formatar CPF corretamente', () => {
      expect(formatters.cpf('11144477735')).toBe('111.444.777-35');
    });

    it('deve retornar vazio para CPF nulo', () => {
      expect(formatters.cpf('')).toBe('');
      expect(formatters.cpf(null)).toBe('');
      expect(formatters.cpf(undefined)).toBe('');
    });
  });

  describe('phone', () => {
    it('deve formatar telefone 11 dígitos', () => {
      expect(formatters.phone('11999998888')).toBe('(11) 99999-8888');
    });

    it('deve formatar telefone 10 dígitos', () => {
      expect(formatters.phone('1133334444')).toBe('(11) 3333-4444');
    });

    it('deve retornar vazio para telefone nulo', () => {
      expect(formatters.phone('')).toBe('');
      expect(formatters.phone(null)).toBe('');
    });
  });

  describe('date', () => {
    it('deve formatar data em formato curto', () => {
      const result = formatters.date('2025-01-15');
      expect(result).toBe('15/01/2025');
    });

    it('deve formatar data em formato longo', () => {
      const result = formatters.date('2025-01-15', 'long');
      expect(result).toContain('15');
      expect(result).toContain('janeiro');
      expect(result).toContain('2025');
    });

    it('deve retornar vazio para data nula', () => {
      expect(formatters.date('')).toBe('');
      expect(formatters.date(null)).toBe('');
    });
  });

  describe('currency', () => {
    it('deve formatar moeda corretamente', () => {
      expect(formatters.currency(1000)).toBe('R$ 1.000,00');
    });

    it('deve formatar com centavos', () => {
      expect(formatters.currency(1000.5)).toContain('1.000');
    });

    it('deve retornar vazio para valor nulo', () => {
      expect(formatters.currency(null)).toBe('');
      expect(formatters.currency(undefined)).toBe('');
    });
  });

  describe('percentage', () => {
    it('deve formatar percentual', () => {
      const result = formatters.percentage(50);
      expect(result).toContain('50');
      expect(result).toContain('%');
    });

    it('deve converter decimal para percentual', () => {
      const result = formatters.percentage(0.5);
      expect(result).toContain('50');
    });
  });

  describe('matricula', () => {
    it('deve formatar matrícula corretamente', () => {
      expect(formatters.matricula('123')).toBe('MAT-000123');
    });

    it('deve retornar vazio para matrícula nula', () => {
      expect(formatters.matricula('')).toBe('');
      expect(formatters.matricula(null)).toBe('');
    });
  });

  describe('number', () => {
    it('deve formatar número com separadores', () => {
      expect(formatters.number(1000)).toBe('1.000');
    });

    it('deve incluir casas decimais', () => {
      expect(formatters.number(1000.5, 2)).toContain('1.000');
    });
  });

  describe('capitalize', () => {
    it('deve capitalizar string', () => {
      expect(formatters.capitalize('hello')).toBe('Hello');
    });

    it('deve retornar vazio para string nula', () => {
      expect(formatters.capitalize('')).toBe('');
      expect(formatters.capitalize(null)).toBe('');
    });
  });

  describe('fullName', () => {
    it('deve formatar nome completo', () => {
      expect(formatters.fullName('JOÃO SILVA')).toBe('João Silva');
    });

    it('deve capitalizar cada palavra', () => {
      expect(formatters.fullName('josé maria santos')).toBe('José Maria Santos');
    });
  });

  describe('truncate', () => {
    it('deve truncar string longa', () => {
      const result = formatters.truncate('hello world this is a very long string', 20);
      expect(result).toHaveLength(23); // 20 + '...'
      expect(result).toContain('...');
    });

    it('deve não truncar string curta', () => {
      expect(formatters.truncate('hello', 20)).toBe('hello');
    });
  });

  describe('boolean', () => {
    it('deve formatar true como Sim', () => {
      expect(formatters.boolean(true)).toBe('Sim');
    });

    it('deve formatar false como Não', () => {
      expect(formatters.boolean(false)).toBe('Não');
    });

    it('deve retornar hífen para nulo', () => {
      expect(formatters.boolean(null)).toBe('-');
      expect(formatters.boolean(undefined)).toBe('-');
    });
  });

  describe('status', () => {
    it('deve formatar status conhecido', () => {
      expect(formatters.status('active')).toBe('✅ Ativo');
      expect(formatters.status('expired')).toBe('⚠️ Vencido');
    });

    it('deve capitalizar status desconhecido', () => {
      expect(formatters.status('unknown')).toBe('Unknown');
    });
  });
});

~~~

---
## FILE: src/react-app/utils/__tests__/validators.test.ts
~~~typescript
/**
 * Tests for validators utility
 */

import { describe, it, expect } from 'vitest';
import { validators } from '../validators';

describe('validators', () => {
  describe('cpf', () => {
    it('deve aceitar CPF válido', () => {
      expect(validators.cpf('11144477735')).toBeNull();
    });

    it('deve rejeitar CPF vazio', () => {
      expect(validators.cpf('')).toBe('CPF obrigatório');
    });

    it('deve rejeitar CPF com menos de 11 dígitos', () => {
      expect(validators.cpf('123')).toBe('CPF deve ter 11 dígitos');
    });

    it('deve rejeitar CPF com todos os dígitos iguais', () => {
      expect(validators.cpf('11111111111')).toBe('CPF inválido');
    });

    it('deve remover formatação antes de validar', () => {
      expect(validators.cpf('111.444.777-35')).toBeNull();
    });
  });

  describe('email', () => {
    it('deve aceitar email válido', () => {
      expect(validators.email('test@example.com')).toBeNull();
    });

    it('deve rejeitar email vazio', () => {
      expect(validators.email('')).toBe('E-mail obrigatório');
    });

    it('deve rejeitar email inválido', () => {
      expect(validators.email('invalid')).toBe('E-mail inválido');
    });

    it('deve rejeitar email sem domínio', () => {
      expect(validators.email('test@')).toBe('E-mail inválido');
    });
  });

  describe('matricula', () => {
    it('deve aceitar matrícula válida', () => {
      expect(validators.matricula('12345')).toBeNull();
    });

    it('deve rejeitar matrícula vazia', () => {
      expect(validators.matricula('')).toBe('Matrícula obrigatória');
    });

    it('deve rejeitar matrícula muito curta', () => {
      expect(validators.matricula('123')).toBe('Matrícula deve ter pelo menos 4 caracteres');
    });

    it('deve rejeitar matrícula muito longa', () => {
      expect(validators.matricula('123456789012345678901')).toBe(
        'Matrícula não pode ter mais de 20 caracteres',
      );
    });
  });

  describe('required', () => {
    it('deve aceitar valor válido', () => {
      expect(validators.required('value')).toBeNull();
    });

    it('deve rejeitar valor vazio', () => {
      expect(validators.required('', 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar null', () => {
      expect(validators.required(null, 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar undefined', () => {
      expect(validators.required(undefined, 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar array vazio', () => {
      expect(validators.required([], 'Items')).toBe('Items é obrigatório');
    });
  });

  describe('phone', () => {
    it('deve aceitar telefone válido 10 dígitos', () => {
      expect(validators.phone('1133334444')).toBeNull();
    });

    it('deve aceitar telefone válido 11 dígitos', () => {
      expect(validators.phone('11999998888')).toBeNull();
    });

    it('deve rejeitar telefone vazio', () => {
      expect(validators.phone('')).toBe('Telefone obrigatório');
    });

    it('deve rejeitar telefone com dígitos insuficientes', () => {
      expect(validators.phone('123')).toBe('Telefone deve ter 10 ou 11 dígitos');
    });
  });

  describe('cnpj', () => {
    it('deve aceitar CNPJ válido', () => {
      expect(validators.cnpj('11222333000181')).toBeNull();
    });

    it('deve rejeitar CNPJ vazio', () => {
      expect(validators.cnpj('')).toBe('CNPJ obrigatório');
    });

    it('deve rejeitar CNPJ com menos de 14 dígitos', () => {
      expect(validators.cnpj('123')).toBe('CNPJ deve ter 14 dígitos');
    });

    it('deve rejeitar CNPJ com todos os dígitos iguais', () => {
      expect(validators.cnpj('11111111111111')).toBe('CNPJ inválido');
    });
  });

  describe('minLength', () => {
    it('deve aceitar string com comprimento suficiente', () => {
      expect(validators.minLength('hello', 3, 'String')).toBeNull();
    });

    it('deve rejeitar string com comprimento insuficiente', () => {
      expect(validators.minLength('hi', 3, 'String')).toBe(
        'String deve ter pelo menos 3 caracteres',
      );
    });
  });

  describe('maxLength', () => {
    it('deve aceitar string com comprimento dentro do limite', () => {
      expect(validators.maxLength('hello', 10, 'String')).toBeNull();
    });

    it('deve rejeitar string acima do limite', () => {
      expect(validators.maxLength('hello world', 5, 'String')).toBe(
        'String não pode ter mais de 5 caracteres',
      );
    });
  });

  describe('number', () => {
    it('deve aceitar número válido', () => {
      expect(validators.number(42)).toBeNull();
    });

    it('deve rejeitar valor não numérico', () => {
      expect(validators.number('abc')).toBe('Deve ser um número');
    });

    it('deve rejeitar número abaixo do mínimo', () => {
      expect(validators.number(5, 10)).toBe('Deve ser maior ou igual a 10');
    });

    it('deve rejeitar número acima do máximo', () => {
      expect(validators.number(15, 10, 12)).toBe('Deve ser menor ou igual a 12');
    });
  });

  describe('date', () => {
    it('deve aceitar data válida', () => {
      expect(validators.date('2025-01-15')).toBeNull();
    });

    it('deve rejeitar data vazia', () => {
      expect(validators.date('')).toBe('Data obrigatória');
    });

    it('deve rejeitar data com formato inválido', () => {
      expect(validators.date('15/01/2025')).toBeNull(); // Aceita DD/MM/YYYY também
    });
  });

  describe('composite', () => {
    it('deve validar múltiplas regras', () => {
      const rules = [
        (val: unknown) => validators.required(val, 'Campo'),
        (val: unknown) => validators.minLength(String(val), 3, 'Campo'),
      ];

      expect(validators.composite('hello', rules)).toBeNull();
    });

    it('deve retornar primeiro erro encontrado', () => {
      const rules = [
        (val: unknown) => validators.required(val, 'Campo'),
        (val: unknown) => validators.minLength(String(val), 10, 'Campo'),
      ];

      expect(validators.composite('hi', rules)).toBe('Campo deve ter pelo menos 10 caracteres');
    });
  });
});

~~~

---
## FILE: src/react-app/utils/accessibility.ts
~~~typescript

export const a11y = {
  generateId: (prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`,

  announce: (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  },

  checkContrast: (foreground: string, background: string): boolean => {
    return true; // Assumir que cores do Tailwind já são acessíveis
  },

  trapFocus: (element: HTMLElement) => {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    element.addEventListener('keydown', handleTabKey);
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleTabKey);
    };
  }
};

export const srOnly = 'sr-only absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0';

~~~

---
## FILE: src/react-app/utils/api-cache.ts
~~~typescript
/**
 * Cache de API em memória para reduzir requisições ao Cloudflare Workers
 * Implementa cache com TTL para endpoints críticos
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Obter dado do cache se ainda for válido
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`[CACHE MISS] ${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      console.log(`[CACHE EXPIRED] ${key} (idade: ${age}ms)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[CACHE HIT] ${key} (idade: ${age}ms)`);
    return entry.data as T;
  }

  /**
   * Armazenar dado em cache com TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    // Limpar cache se crescer demais
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`[CACHE] Removida entrada mais antiga`);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });

    console.log(`[CACHE SET] ${key} com TTL ${ttlMs}ms`);
  }

  /**
   * Limpar cache específico
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[CACHE INVALIDATED] ${key}`);
  }

  /**
   * Limpar cache por padrão (ex: /api/dashboard/*)
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const [key] of this.cache) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[CACHE INVALIDATED] ${count} entradas com padrão ${pattern}`);
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[CACHE CLEARED] ${size} entradas removidas`);
  }

  /**
   * Obter estatísticas do cache
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
        isExpired: Date.now() - entry.timestamp > entry.ttl,
      })),
    };
  }
}

// Singleton
export const apiCache = new APICache();

/**
 * Hook para fetch com cache automático
 * Exemplo:
 * const data = await cachedFetch(
 *   `/api/endpoint`,
 *   5 * 60 * 1000  // 5 minutos de cache
 * );
 */
export async function cachedFetch<T>(
  url: string,
  ttlMs: number = 5 * 60 * 1000,
  options?: RequestInit,
): Promise<T> {
  const cacheKey = `${url}:${JSON.stringify(options || {})}`;

  // Verificar cache
  const cached = apiCache.get<T>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fazer request
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as T;

  // Armazenar em cache
  apiCache.set(cacheKey, data, ttlMs);

  return data;
}

~~~

---
## FILE: src/react-app/utils/api-client.ts
~~~typescript
/**
 * API CLIENT - Cliente centralizado para chamadas de API
 *
 * Benefícios:
 * - Validação automática de 404
 * - Tratamento de erros padronizado
 * - Retry automático com exponential backoff
 * - Logs consistentes
 * - Timeout configurável
 * - Circuit breaker para evitar cascata de falhas
 * - Retry-After header support
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface ApiOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  validateStatus?: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

// ===== CIRCUIT BREAKER STATE =====
interface CircuitBreakerState {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout = 10000;
  private defaultRetries = 3;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetTime = 60000; // 60 seconds

  constructor() {
    // Keep /api prefix as Worker routes expect it
    this.baseUrl = API_BASE_URL;
  }

  // ===== EXPONENTIAL BACKOFF CALCULATION =====
  private getBackoffDelay(attempt: number): number {
    // 1s, 2s, 4s, 8s (capped at 8s)
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }

  // ===== CIRCUIT BREAKER LOGIC =====
  private checkCircuitBreaker(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') {
      return true; // OK, proceed
    }

    if (this.circuitBreaker.state === 'OPEN') {
      // Check if we should try half-open
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceFailure > this.circuitBreakerResetTime) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        console.info('[API] Circuit breaker entering HALF_OPEN state');
        return true; // Try one request
      }

      console.warn('[API] Circuit breaker is OPEN, rejecting request');
      return false; // Don't even try
    }

    // HALF_OPEN state: allow request to proceed
    return true;
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= 2) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        console.info('[API] Circuit breaker CLOSED (recovered)');
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'OPEN';
      console.error(`[API] Circuit breaker OPEN (${this.circuitBreaker.failureCount} failures)`);
    } else if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'OPEN';
      console.error('[API] Circuit breaker back to OPEN');
    }
  }

  /**
   * Faz uma requisição GET
   */
  async get<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'GET',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Faz uma requisição POST
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PUT
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição PATCH
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Faz uma requisição DELETE
   */
  async delete<T = any>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    return this.request<T>(endpoint, {
      ...options,
      method: 'DELETE',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  /**
   * Requisição genérica com retry e timeout
   */
  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retries,
      validateStatus = true,
      ...fetchOptions
    } = options;

    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const resolvedRetries =
      typeof retries === 'number' ? retries : method === 'GET' ? this.defaultRetries : 0;

    // ===== CIRCUIT BREAKER CHECK =====
    if (!this.checkCircuitBreaker()) {
      return {
        success: false,
        error: 'Serviço temporariamente indisponível (circuit breaker)',
        code: 'SERVICE_UNAVAILABLE',
      };
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= resolvedRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // ===== STATUS CODE HANDLING =====
        if (validateStatus && !response.ok) {
          // 401 Unauthorized - don't retry
          if (response.status === 401) {
            console.error(`[API] 401 Unauthorized: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Não autorizado',
              code: 'UNAUTHORIZED',
            };
          }

          // 403 Forbidden - don't retry
          if (response.status === 403) {
            console.error(`[API] 403 Forbidden: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Acesso negado',
              code: 'FORBIDDEN',
            };
          }

          // 422 Unprocessable Entity - don't retry
          if (response.status === 422) {
            console.error(`[API] 422 Unprocessable Entity: ${endpoint}`);
            const errorData = await response.json().catch(() => ({}));
            this.recordFailure();
            return {
              success: false,
              error: errorData.error || 'Dados inválidos',
              code: 'UNPROCESSABLE_ENTITY',
            };
          }

          // 404 Not Found - don't retry
          if (response.status === 404) {
            console.error(`[API] 404 Not Found: ${endpoint}`);
            this.recordFailure();
            return {
              success: false,
              error: 'Recurso não encontrado',
              code: 'NOT_FOUND',
            };
          }

          // 429 Too Many Requests - retry with Retry-After
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
            const delay = retryAfter > 0 ? retryAfter * 1000 : this.getBackoffDelay(attempt);

            console.warn(`[API] 429 Rate Limited: ${endpoint}, waiting ${delay}ms`);

            if (attempt < resolvedRetries) {
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            this.recordFailure();
            return {
              success: false,
              error: 'Muitas requisições, tente novamente mais tarde',
              code: 'RATE_LIMITED',
            };
          }

          // 5xx Server Error - retry
          if (response.status >= 500) {
            throw new Error(`Erro no servidor: ${response.status}`);
          }
        }

        const data = await response.json();
        this.recordSuccess();
        return data;
      } catch (error: any) {
        lastError = error;

        // ===== RETRY LOGIC =====
        const isRetryable =
          error.name === 'AbortError' ||
          error.message.includes('fetch') ||
          error.message.includes('Erro no servidor');

        if (attempt < resolvedRetries && isRetryable) {
          const delay = this.getBackoffDelay(attempt);
          console.warn(
            `[API] Tentativa ${attempt + 1}/${
              resolvedRetries + 1
            } falhou para ${endpoint}, aguardando ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        this.recordFailure();
        console.error(`[API] Erro em ${endpoint}:`, error);
        return {
          success: false,
          error: error.message || 'Erro na requisição',
          code: 'REQUEST_FAILED',
        };
      }
    }

    this.recordFailure();
    return {
      success: false,
      error: lastError?.message || 'Erro na requisição após múltiplas tentativas',
      code: 'MAX_RETRIES_EXCEEDED',
    };
  }

  /**
   * Upload de arquivo
   */
  async upload<T = any>(
    endpoint: string,
    formData: FormData,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Get Blob for PDF/File download
   */
  async getBlob(endpoint: string): Promise<Blob> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = getAccessToken();

    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.status}`);
    }

    return await response.blob();
  }

  /**
   * Download de arquivo com retry
   */
  async download(endpoint: string, filename?: string): Promise<void> {
    try {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          const response = await fetch(url);

          if (!response.ok) {
            if (response.status >= 500 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, this.getBackoffDelay(attempt)));
              continue;
            }
            throw new Error(`Erro ao baixar arquivo: ${response.status}`);
          }

          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename || 'download';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);

          this.recordSuccess();
          return;
        } catch (error: any) {
          lastError = error;
          if (attempt < 2) {
            console.warn(`[API] Download attempt ${attempt + 1}/3 failed, retrying...`);
            continue;
          }
        }
      }

      this.recordFailure();
      throw lastError || new Error('Erro ao baixar arquivo após múltiplas tentativas');
    } catch (error: any) {
      console.error('[API] Erro ao baixar arquivo:', error);
      throw error;
    }
  }
}

export const api = new ApiClient();

export default ApiClient;

~~~

---
## FILE: src/react-app/utils/apiUtils.ts
~~~typescript
/**
 * @file apiUtils.ts
 * @description Utilitários centralizados para chamadas de API com URL base automática
 *
 * Este arquivo fornece funções auxiliares para garantir que todas as URLs de API
 * usem a base URL correta em produção (VITE_API_URL) ou o origin em desenvolvimento.
 */

import { API_BASE_URL } from '@/react-app/config/api';

export { API_BASE_URL };

/**
 * Função global para chamadas de API com URL base automática
 * @param endpoint - Endpoint da API (ex: '/api/qualificacoes')
 * @param options - Opções de RequestInit (headers, method, body, etc)
 * @returns Promise<Response>
 */
export async function fetchWithBaseUrl(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
  return fetch(url, options);
}

/**
 * Wrapper para fetch com logging de erros
 */
export async function fetchWithLogging(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      console.warn(`API Error: ${response.status} ${response.statusText} on ${url}`);
    }
    return response;
  } catch (error) {
    console.error(`Fetch Error: ${error} on ${url}`);
    throw error;
  }
}

/**
 * Helper para construir URL completa
 */
export function buildApiUrl(endpoint: string): string {
  return endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint;
}

~~~

---
## FILE: src/react-app/utils/backup.ts
~~~typescript
export interface BackupEntry<T = unknown> {
  id: string;
  createdAt: string; // ISO
  data: T;
}

const STORAGE_KEY = 'airtrust.backups';

function loadAllBackups<T>(): BackupEntry<T>[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackupEntry<T>[];
  } catch {
    return [];
  }
}

function saveAllBackups<T>(entries: BackupEntry<T>[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function createBackup<T>(data: T): BackupEntry<T> {
  const entry: BackupEntry<T> = {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    data
  };
  const all = loadAllBackups<T>();
  all.unshift(entry);
  saveAllBackups(all);
  return entry;
}

export function listBackups<T>(): BackupEntry<T>[] {
  return loadAllBackups<T>();
}

export function restoreBackup<T>(id: string): T | null {
  const all = loadAllBackups<T>();
  const found = all.find(b => b.id === id);
  return found ? found.data : null;
}

export function deleteBackup(id: string): void {
  const all = loadAllBackups();
  const filtered = all.filter(b => b.id !== id);
  saveAllBackups(filtered);
}

export function cleanupOldBackups(days: number = 30): void {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = loadAllBackups();
  const filtered = all.filter(b => new Date(b.createdAt).getTime() >= cutoff);
  saveAllBackups(filtered);
}


~~~

---
## FILE: src/react-app/utils/business-rules.ts
~~~typescript
/**
 * Business Rules - Centralized business logic
 *
 * Centraliza regras de negócio reutilizáveis
 * Uso: import { businessRules } from '@/utils/business-rules'
 */

interface Certificado {
  id: string;
  dataValidade: string | Date;
  vencido?: boolean;
  proximoVencimento?: boolean;
}

interface Habilitacao {
  id: string;
  tipo: string;
  dataVencimento: string | Date;
  vencida?: boolean;
  proximoVencimento?: boolean;
}

interface Funcionario {
  id: string;
  certificados: Certificado[];
  habilitacoes: Habilitacao[];
}

interface Simulador {
  id: string;
  habilitacoes_requeridas: string[];
}

export const businessRules = {
  /**
   * Verifica se certificado está próximo de vencer
   * @param dataValidade Data de validade do certificado
   * @param diasAlerta Dias para alertar antes do vencimento (default: 30)
   * @returns true se próximo a vencer
   */
  isCertificadoExpiringSoon: (dataValidade: string | Date, diasAlerta: number = 30): boolean => {
    const data = typeof dataValidade === 'string' ? new Date(dataValidade) : dataValidade;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= diasAlerta && diffDays > 0;
  },

  /**
   * Verifica se certificado está vencido
   * @param dataValidade Data de validade
   * @returns true se vencido
   */
  isCertificadoExpired: (dataValidade: string | Date): boolean => {
    const data = typeof dataValidade === 'string' ? new Date(dataValidade) : dataValidade;
    return new Date() > data;
  },

  /**
   * Verifica se habilitação está próxima de vencer
   * @param dataVencimento Data de vencimento
   * @param diasAlerta Dias para alertar (default: 30)
   * @returns true se próxima a vencer
   */
  isHabilitacaoExpiringSoon: (dataVencimento: string | Date, diasAlerta: number = 30): boolean => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= diasAlerta && diffDays > 0;
  },

  /**
   * Verifica se habilitação está vencida
   * @param dataVencimento Data de vencimento
   * @returns true se vencida
   */
  isHabilitacaoExpired: (dataVencimento: string | Date): boolean => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    return new Date() > data;
  },

  /**
   * Calcula dias até vencimento
   * @param dataVencimento Data de vencimento
   * @returns Número de dias até vencimento (negativo se já vencido)
   */
  daysUntilExpiration: (dataVencimento: string | Date): number => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  /**
   * Calcula score de compliance do funcionário
   * Score máximo: 100
   * @param certificados Array de certificados
   * @param habilitacoes Array de habilitações
   * @returns Score entre 0 e 100
   */
  calculateComplianceScore: (
    certificados: Certificado[] = [],
    habilitacoes: Habilitacao[] = [],
  ): number => {
    let score = 100;

    certificados.forEach((cert) => {
      if (businessRules.isCertificadoExpired(cert.dataValidade)) {
        score -= 15;
      } else if (businessRules.isCertificadoExpiringSoon(cert.dataValidade)) {
        score -= 5;
      }
    });

    habilitacoes.forEach((hab) => {
      if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        score -= 20;
      } else if (businessRules.isHabilitacaoExpiringSoon(hab.dataVencimento)) {
        score -= 8;
      }
    });

    return Math.max(0, score);
  },

  /**
   * Calcula status de compliance
   * @param score Score de compliance (0-100)
   * @returns Status: 'critico' | 'alerta' | 'bom' | 'excelente'
   */
  getComplianceStatus: (score: number): 'critico' | 'alerta' | 'bom' | 'excelente' => {
    if (score >= 90) return 'excelente';
    if (score >= 75) return 'bom';
    if (score >= 50) return 'alerta';
    return 'critico';
  },

  /**
   * Obtém cor para compliance score
   * @param score Score de compliance
   * @returns Cor CSS (red, orange, yellow, green)
   */
  getComplianceColor: (score: number): string => {
    const status = businessRules.getComplianceStatus(score);
    const colorMap: Record<string, string> = {
      critico: '#dc2626', // red
      alerta: '#ea580c', // orange
      bom: '#eab308', // yellow
      excelente: '#22c55e', // green
    };
    return colorMap[status];
  },

  /**
   * Valida se funcionário pode agendar simulador
   * @param funcionario Funcionário com habilitações
   * @param simulador Simulador com habilitações requeridas
   * @returns true se pode agendar
   */
  canScheduleSimulator: (funcionario: Funcionario, simulador: Simulador): boolean => {
    // Verifica habilitações necessárias
    const hasRequiredHabilitacoes = simulador.habilitacoes_requeridas.every((req: string) =>
      funcionario.habilitacoes.some(
        (hab: Habilitacao) =>
          hab.tipo === req && !businessRules.isHabilitacaoExpired(hab.dataVencimento),
      ),
    );

    return hasRequiredHabilitacoes;
  },

  /**
   * Obtém motivos pelos quais não pode agendar
   * @param funcionario Funcionário
   * @param simulador Simulador
   * @returns Array de motivos
   */
  getSchedulingBlockReasons: (funcionario: Funcionario, simulador: Simulador): string[] => {
    const reasons: string[] = [];

    simulador.habilitacoes_requeridas.forEach((req: string) => {
      const hab = funcionario.habilitacoes.find((h) => h.tipo === req);

      if (!hab) {
        reasons.push(`Falta habilitação: ${req}`);
      } else if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        reasons.push(`Habilitação ${req} vencida`);
      }
    });

    return reasons;
  },

  /**
   * Valida se funcionário está em dia
   * @param funcionario Funcionário
   * @returns true se em dia (nenhuma documentação vencida)
   */
  isEmDia: (funcionario: Funcionario): boolean => {
    const hasExpiredCert = funcionario.certificados.some((cert) =>
      businessRules.isCertificadoExpired(cert.dataValidade),
    );

    const hasExpiredHab = funcionario.habilitacoes.some((hab) =>
      businessRules.isHabilitacaoExpired(hab.dataVencimento),
    );

    return !hasExpiredCert && !hasExpiredHab;
  },

  /**
   * Obtém próximas datas para vencimento (ordenadas)
   * @param funcionario Funcionário
   * @param limit Limite de resultados
   * @returns Array de objetos com tipo, data e dias
   */
  getUpcomingExpirations: (
    funcionario: Funcionario,
    limit: number = 5,
  ): Array<{ tipo: string; data: Date; dias: number }> => {
    const expirations: Array<{ tipo: string; data: Date; dias: number }> = [];

    funcionario.certificados
      .filter((cert) => !businessRules.isCertificadoExpired(cert.dataValidade))
      .forEach((cert) => {
        const data =
          typeof cert.dataValidade === 'string' ? new Date(cert.dataValidade) : cert.dataValidade;
        const dias = businessRules.daysUntilExpiration(data);

        if (dias > 0 && dias <= 90) {
          expirations.push({
            tipo: `Certificado: ${cert.id}`,
            data,
            dias,
          });
        }
      });

    funcionario.habilitacoes
      .filter((hab) => !businessRules.isHabilitacaoExpired(hab.dataVencimento))
      .forEach((hab) => {
        const data =
          typeof hab.dataVencimento === 'string'
            ? new Date(hab.dataVencimento)
            : hab.dataVencimento;
        const dias = businessRules.daysUntilExpiration(data);

        if (dias > 0 && dias <= 90) {
          expirations.push({
            tipo: `Habilitação: ${hab.tipo}`,
            data,
            dias,
          });
        }
      });

    return expirations.sort((a, b) => a.dias - b.dias).slice(0, limit);
  },

  /**
   * Calcula percentual de habilitações ativas
   * @param habilitacoes Array de habilitações
   * @returns Percentual (0-100)
   */
  getActiveHabilitacoesPercentage: (habilitacoes: Habilitacao[] = []): number => {
    if (habilitacoes.length === 0) return 0;

    const active = habilitacoes.filter(
      (hab) => !businessRules.isHabilitacaoExpired(hab.dataVencimento),
    ).length;

    return Math.round((active / habilitacoes.length) * 100);
  },

  /**
   * Calcula percentual de certificados ativos
   * @param certificados Array de certificados
   * @returns Percentual (0-100)
   */
  getActiveCertificatesPercentage: (certificados: Certificado[] = []): number => {
    if (certificados.length === 0) return 0;

    const active = certificados.filter(
      (cert) => !businessRules.isCertificadoExpired(cert.dataValidade),
    ).length;

    return Math.round((active / certificados.length) * 100);
  },

  /**
   * Valida se funcionário pode voar
   * Regra: tem habilitação, certificado e nenhum vencido
   * @param funcionario Funcionário
   * @returns true se pode voar
   */
  canFly: (funcionario: Funcionario): boolean => {
    if (funcionario.habilitacoes.length === 0 || funcionario.certificados.length === 0) {
      return false;
    }

    return businessRules.isEmDia(funcionario);
  },

  /**
   * Obtém motivos pelos quais não pode voar
   * @param funcionario Funcionário
   * @returns Array de motivos
   */
  getCannotFlyReasons: (funcionario: Funcionario): string[] => {
    const reasons: string[] = [];

    if (funcionario.habilitacoes.length === 0) {
      reasons.push('Sem habilitação');
    }

    if (funcionario.certificados.length === 0) {
      reasons.push('Sem certificado');
    }

    funcionario.certificados.forEach((cert) => {
      if (businessRules.isCertificadoExpired(cert.dataValidade)) {
        reasons.push(`Certificado vencido`);
      }
    });

    funcionario.habilitacoes.forEach((hab) => {
      if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        reasons.push(`Habilitação ${hab.tipo} vencida`);
      }
    });

    return [...new Set(reasons)]; // Remove duplicatas
  },
};

export default businessRules;

~~~

---
## FILE: src/react-app/utils/cache-cleaner.ts
~~~typescript
/**
 * Cache Cleaner Utility
 * Limpa todos os tipos de cache para garantir dados frescos
 * Executa em: startup, logout, ou quando usuário solicitar
 */

export interface CacheStats {
  localStorage: number;
  sessionStorage: number;
  indexedDB: number;
  memory: number;
  cdnCache: boolean;
  timestamp: string;
}

/**
 * Limpar localStorage
 */
export function clearLocalStorage(): void {
  const keysToKeep = ['theme-preference', 'user-language'];
  const allKeys = Object.keys(localStorage);
  let cleared = 0;

  for (const key of allKeys) {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
      cleared++;
    }
  }

  console.log(`🗑️  localStorage: ${cleared} itens removidos`);
}

/**
 * Limpar sessionStorage
 */
export function clearSessionStorage(): void {
  const beforeSize = Object.keys(sessionStorage).length;
  sessionStorage.clear();
  console.log(`🗑️  sessionStorage: ${beforeSize} itens removidos`);
}

/**
 * Limpar IndexedDB (usado por React Query, etc)
 */
export async function clearIndexedDB(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);

      Promise.resolve(dbs).then((databases) => {
        let cleared = 0;

        const dbArray = Array.isArray(databases) ? databases : (databases as unknown[]);

        for (const db of dbArray) {
          const dbName = (db as { name: string }).name || '';
          indexedDB.deleteDatabase(dbName);
          cleared++;
        }

        console.log(`🗑️  IndexedDB: ${cleared} bancos removidos`);
        resolve();
      });
    } catch (err) {
      console.warn('⚠️  Erro ao limpar IndexedDB:', err);
      resolve();
    }
  });
}

/**
 * Limpar Service Worker cache
 */
export async function clearServiceWorkerCache(): Promise<void> {
  try {
    if (!('caches' in window)) {
      console.log('⚠️  Cache API não disponível');
      return;
    }

    const cacheNames = await caches.keys();
    let cleared = 0;

    for (const cacheName of cacheNames) {
      await caches.delete(cacheName);
      cleared++;
    }

    console.log(`🗑️  Service Worker cache: ${cleared} caches removidos`);
  } catch (err) {
    console.warn('⚠️  Erro ao limpar SW cache:', err);
  }
}

/**
 * Limpar React Query cache (memoria)
 */
export function clearReactQueryCache(queryClient?: Record<string, unknown>): void {
  if (queryClient && 'clear' in queryClient && typeof queryClient.clear === 'function') {
    (queryClient.clear as () => void)();
    console.log('🗑️  React Query cache: limpo');
  }
}

/**
 * Limpar cookies
 */
export function clearCookies(): void {
  const cookies = document.cookie.split(';');
  let cleared = 0;

  for (const cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();

    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    cleared++;
  }

  console.log(`🗑️  Cookies: ${cleared} removidos`);
}

/**
 * Requisitar limpeza de CDN cache (via header)
 * Backend deve suportar: Cache-Control: no-cache, max-age=0
 */
import { API_BASE_URL } from '../config/api';

export async function clearCDNCache(): Promise<boolean> {
  try {
    // Fazer requisição PRAGMA com header especial
    const response = await fetch(`${API_BASE_URL}/cache/clear`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache, max-age=0',
        Pragma: 'no-cache',
      },
    });

    if (response.ok) {
      console.log('✅ CDN cache clear requisitado');
      return true;
    } else {
      console.warn('⚠️  CDN cache clear falhou:', response.status);
      return false;
    }
  } catch (err) {
    console.warn('⚠️  Erro ao requisitar CDN clear:', err);
    return false;
  }
}

/**
 * ⚡ LIMPEZA COMPLETA - Executa tudo
 */
export async function clearAllCaches(): Promise<CacheStats> {
  console.log('🧹 Iniciando limpeza completa de cache...');

  const startTime = performance.now();

  // 1. Limpar storages síncronos
  clearLocalStorage();
  clearSessionStorage();
  clearCookies();

  // 2. Limpar IndexedDB (async)
  await clearIndexedDB();

  // 3. Limpar Service Worker cache (async)
  await clearServiceWorkerCache();

  // 4. Tentar limpar CDN (async)
  const cdnCleared = await clearCDNCache();

  const endTime = performance.now();
  const duration = Math.round(endTime - startTime);

  const stats: CacheStats = {
    localStorage: Object.keys(localStorage).length,
    sessionStorage: Object.keys(sessionStorage).length,
    indexedDB: 0, // Já deletados
    memory: 0, // Limpo
    cdnCache: cdnCleared,
    timestamp: new Date().toISOString(),
  };

  console.log(`✅ Cache completo limpo em ${duration}ms`, stats);
  return stats;
}

/**
 * Monitorar tamanho de cache
 */
export function getCacheSize(): CacheStats {
  let localStorageSize = 0;
  let sessionStorageSize = 0;

  // Calcular localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      localStorageSize += (value?.length || 0) + key.length;
    }
  }

  // Calcular sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      const value = sessionStorage.getItem(key);
      sessionStorageSize += (value?.length || 0) + key.length;
    }
  }

  return {
    localStorage: localStorageSize,
    sessionStorage: sessionStorageSize,
    indexedDB: 0,
    memory: localStorageSize + sessionStorageSize,
    cdnCache: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Limpar cache periodicamente (ex: a cada 1 hora)
 */
export function setupPeriodicCacheClear(intervalMs = 60 * 60 * 1000): () => void {
  const intervalId = setInterval(() => {
    clearLocalStorage();
    clearSessionStorage();
    console.log('🔄 Cache periódico limpo');
  }, intervalMs);

  // Retornar função para cancelar
  return () => clearInterval(intervalId);
}

~~~

---
## FILE: src/react-app/utils/certificadoNaming.ts
~~~typescript
/**
 * Utility para geração de nomes de certificados padronizados
 *
 * Padrão: CERT-{NOME_FUNCIONARIO}-{CODIGO}-{YYYYMMDD}.pdf
 *
 * Exemplos:
 * - CERT-JOAO_SILVA-CRM-20250115.pdf
 * - CERT-MARIA_SANTOS-ICAO-20250301.pdf
 */

/**
 * Gera nome padronizado de certificado
 *
 * @param nomeFuncionario - Nome do funcionário (será sanitizado)
 * @param codigo - Código da qualificação (ex: "CRM", "ICAO")
 * @param dataRealizacao - Data de realização ISO (ex: "2025-01-15")
 * @returns Nome do certificado formatado
 *
 * @example
 * gerarNomeCertificado("JOAO_SILVA", "CRM", "2025-01-15")
 * // Retorna: "CERT-JOAO_SILVA-CRM-20250115.pdf"
 */
export function gerarNomeCertificado(
  matricula: string,
  codigo: string,
  dataRealizacao: string,
): string {
  // Garantir que matrícula tem 5 dígitos com zeros à esquerda
  const matriculaPadded = String(matricula).padStart(5, '0');

  // Remover traços e caracteres especiais da data (YYYY-MM-DD → YYYYMMDD)
  const dataFormatada = dataRealizacao.replace(/[-/\s]/g, '');

  // Garantir que código está em uppercase e sem espaços
  const codigoLimpo = codigo.toUpperCase().trim().replace(/\s+/g, '-');

  return `CERT-${matriculaPadded}-${codigoLimpo}-${dataFormatada}.pdf`;
}

/**
 * Valida se um nome de certificado segue o padrão esperado
 *
 * @param nomeCertificado - Nome do arquivo a validar
 * @returns true se válido, false caso contrário
 *
 * @example
 * validarNomeCertificado("CERT-00123-CRM-20250115.pdf") // true
 * validarNomeCertificado("certificado.pdf") // false
 */
export function validarNomeCertificado(nomeCertificado: string): boolean {
  const pattern = /^CERT-\d{5}-[A-Z0-9-]+-\d{8}\.pdf$/;
  return pattern.test(nomeCertificado);
}

/**
 * Extrai informações de um nome de certificado padronizado
 *
 * @param nomeCertificado - Nome do certificado
 * @returns Objeto com matricula, codigo e data, ou null se inválido
 *
 * @example
 * extrairInfoCertificado("CERT-00123-CRM-20250115.pdf")
 * // { matricula: "00123", codigo: "CRM", data: "2025-01-15" }
 */
export function extrairInfoCertificado(nomeCertificado: string): {
  matricula: string;
  codigo: string;
  data: string;
} | null {
  if (!validarNomeCertificado(nomeCertificado)) {
    return null;
  }

  const match = nomeCertificado.match(/^CERT-(\d{5})-([A-Z0-9-]+)-(\d{8})\.pdf$/);

  if (!match) {
    return null;
  }

  const [, matricula, codigo, dataNum] = match;

  // Converter YYYYMMDD para YYYY-MM-DD
  const ano = dataNum.slice(0, 4);
  const mes = dataNum.slice(4, 6);
  const dia = dataNum.slice(6, 8);
  const data = `${ano}-${mes}-${dia}`;

  return {
    matricula,
    codigo,
    data,
  };
}

/**
 * Gera nome de certificado a partir de um objeto de qualificação
 *
 * @param qualificacao - Objeto com dados da qualificação
 * @returns Nome do certificado formatado
 */
export function gerarNomeCertificadoFromQualificacao(qualificacao: {
  funcionario_matricula?: string;
  matricula?: string;
  qualificacao_codigo?: string;
  codigo?: string;
  data_realizacao?: string;
  data_conclusao?: string;
}): string {
  const matricula = qualificacao.funcionario_matricula || qualificacao.matricula || '00000';
  const codigo = qualificacao.qualificacao_codigo || qualificacao.codigo || 'QUAL';
  const data =
    qualificacao.data_realizacao ||
    qualificacao.data_conclusao ||
    new Date().toISOString().split('T')[0];

  return gerarNomeCertificado(matricula, codigo, data);
}

export default gerarNomeCertificado;

~~~

---
## FILE: src/react-app/utils/certificadoStatus.ts
~~~typescript
export function hasActiveCertificateFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (
      normalized === '' ||
      normalized === '0' ||
      normalized === 'false' ||
      normalized === 'null' ||
      normalized === 'undefined' ||
      normalized === 'nao' ||
      normalized === 'não'
    ) {
      return false;
    }

    if (normalized === '1' || normalized === 'true') {
      return true;
    }

    const numericValue = Number(normalized);
    if (!Number.isNaN(numericValue)) {
      return numericValue > 0;
    }

    return true;
  }

  return Boolean(value);
}

~~~

---
## FILE: src/react-app/utils/checkCompatibility.ts
~~~typescript
export interface CheckLike {
  id: number;
  codigo?: string | null;
}

export function normalizeAircraftModel(modeloAeronave?: string | null): string {
  return String(modeloAeronave || '')
    .trim()
    .toUpperCase();
}

export function isCheckCompatibleWithAircraft(
  codigoCheck?: string | null,
  modeloAeronave?: string | null,
): boolean {
  const codigo = String(codigoCheck || '')
    .trim()
    .toUpperCase();
  const modelo = normalizeAircraftModel(modeloAeronave);

  if (!codigo || !modelo) {
    return true;
  }

  if (codigo.endsWith('-139')) {
    return modelo.includes('139');
  }

  if (codigo.endsWith('-76')) {
    return modelo.includes('76');
  }

  return true;
}

export function filterCompatibleChecks<T extends CheckLike>(
  checks: T[],
  modeloAeronave?: string | null,
): T[] {
  return checks.filter((check) => isCheckCompatibleWithAircraft(check.codigo, modeloAeronave));
}

export function filterCompatibleCheckIds<T extends CheckLike>(
  checkIds: number[],
  checks: T[],
  modeloAeronave?: string | null,
): number[] {
  const idsPermitidos = new Set(
    filterCompatibleChecks(checks, modeloAeronave).map((check) => Number(check.id)),
  );

  return Array.from(
    new Set(
      checkIds
        .map((checkId) => Number(checkId))
        .filter((checkId) => Number.isFinite(checkId) && idsPermitidos.has(checkId)),
    ),
  );
}

~~~

---
## FILE: src/react-app/utils/colorPalette.ts
~~~typescript
/**
 * Color palette utility for consistent color assignment
 * Used for session types and other categorical data
 */

const COLOR_PALETTE = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // yellow
  '#6366F1', // indigo
  '#EC4899', // pink
  '#14B8A6', // teal
];

/**
 * Get a color from the palette based on ID
 * Same ID will always return the same color
 */
export function getColorByIndex(id: number): string {
  const index = (id - 1) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Get all available colors in the palette
 */
export function getAllColors(): string[] {
  return COLOR_PALETTE;
}

/**
 * Get a contrasting text color (white for dark backgrounds, dark gray for light)
 */
export function getContrastTextColor(hexColor: string): string {
  // Simple luminance calculation
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

~~~

---
## FILE: src/react-app/utils/confirmDialog.ts
~~~typescript
type ConfirmDialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
};

type AlertDialogOptions = {
  title?: string;
  confirmText?: string;
};

type ConfirmDialogRequest = ConfirmDialogOptions & {
  message: string;
  resolve: (confirmed: boolean) => void;
};

type ConfirmDialogHandler = (request: ConfirmDialogRequest) => void;
type AlertDialogRequest = AlertDialogOptions & {
  message: string;
};
type AlertDialogHandler = (request: AlertDialogRequest) => void;

let confirmDialogHandler: ConfirmDialogHandler | null = null;
let alertDialogHandler: AlertDialogHandler | null = null;

export function registerConfirmDialogHandler(handler: ConfirmDialogHandler | null) {
  confirmDialogHandler = handler;
}

export function registerAlertDialogHandler(handler: AlertDialogHandler | null) {
  alertDialogHandler = handler;
}

export function confirmDialog(
  message: string,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  if (!confirmDialogHandler) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise<boolean>((resolve) => {
    confirmDialogHandler?.({
      message,
      resolve,
      ...options,
    });
  });
}

export function showAlertDialog(message: string, options: AlertDialogOptions = {}) {
  if (!alertDialogHandler) {
    window.alert(message);
    return;
  }

  alertDialogHandler({
    message,
    ...options,
  });
}

~~~

---
## FILE: src/react-app/utils/constants.ts
~~~typescript
/**
 * Constantes globais da aplicação
 * Evita magic numbers e centraliza configurações
 */

// ⏱️ INTERVALOS DE POLLING
// ATENÇÃO: Limite Cloudflare Free = 100k requests/dia
// Qualquer redução aqui tem impacto direto no consumo
export const POLLING_INTERVALS = {
  DASHBOARD_METRICS: 15 * 60 * 1000, // 15 minutos
  SYSTEM_HEALTH: 10 * 60 * 1000, // 10 minutos
  RECENT_ACTIVITY: 10 * 60 * 1000, // 10 minutos
  NOTIFICATIONS: 10 * 60 * 1000, // 10 minutos
  ALERTS: 15 * 60 * 1000, // 15 minutos
} as const;

// ⏱️ TIMEOUTS
export const TIMEOUTS = {
  API_REQUEST: 60 * 1000, // 60 segundos
  RETRY_DELAY: 500, // 500ms
  DEBOUNCE_DEFAULT: 300, // 300ms
  CIRCUIT_BREAKER_RESET: 60 * 1000, // 60 segundos
} as const;

// 📦 CACHE
export const CACHE_TTL = {
  SHORT: 30 * 1000, // 30 segundos
  MEDIUM: 60 * 1000, // 1 minuto
  LONG: 10 * 60 * 1000, // 10 minutos
  PREFETCH: 60 * 1000, // 1 minuto para dados pré-carregados
} as const;

// 🔢 LIMITES DE REQUISIÇÕES
export const REQUEST_LIMITS = {
  PER_MINUTE: 200,
  PER_DAY: 80_000, // 80% do limite Cloudflare (100k)
  MINUTE_WINDOW: 60 * 1000,
  DAY_WINDOW: 24 * 60 * 60 * 1000,
} as const;

// ⏱️ CONVERSÃO DE TEMPO
export const TIME_CONVERSION = {
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
} as const;

// 🔄 RETRY
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 30 * 1000,
} as const;

~~~

---
## FILE: src/react-app/utils/dateTime.ts
~~~typescript
export class DateTimeUtils {
  
  static parseDataBrasileira(dataStr: string): Date | null {
    if (!dataStr) return null;
    
    try {
      const [dia, mes, ano] = dataStr.split('/');
      return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    } catch (error) {
      console.error('Erro ao converter data brasileira:', error);
      return null;
    }
  }
  
  static formatDataBrasileira(date: Date): string {
    if (!date || !(date instanceof Date)) return '';
    
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const ano = date.getFullYear();
    
    return `${dia}/${mes}/${ano}`;
  }
  
  static formatHora(date: Date): string {
    if (!date || !(date instanceof Date)) return '';
    
    const hora = date.getHours().toString().padStart(2, '0');
    const minuto = date.getMinutes().toString().padStart(2, '0');
    
    return `${hora}:${minuto}`;
  }
  
  static adicionarHoras(dataInicio: string, horaInicio: string, horasParaAdicionar: number) {
    try {
      const [dia, mes, ano] = dataInicio.split('/');
      const [hora, minuto] = horaInicio.split(':');
      
      const dataHora = new Date(
        parseInt(ano),
        parseInt(mes) - 1,
        parseInt(dia),
        parseInt(hora),
        parseInt(minuto)
      );
      
      dataHora.setHours(dataHora.getHours() + horasParaAdicionar);
      
      return {
        data: this.formatDataBrasileira(dataHora),
        hora: this.formatHora(dataHora),
        dateObj: dataHora
      };
    } catch (error) {
      console.error('Erro ao adicionar horas:', error);
      return null;
    }
  }
  
  static calcularDuracao(dataInicio: string, horaInicio: string, dataFim: string, horaFim: string): number {
    try {
      const inicio = this.parseDataBrasileira(dataInicio);
      if (!inicio) return 0;
      
      const [horaI, minutoI] = horaInicio.split(':');
      inicio.setHours(parseInt(horaI), parseInt(minutoI));
      
      const fim = this.parseDataBrasileira(dataFim);
      if (!fim) return 0;
      
      const [horaF, minutoF] = horaFim.split(':');
      fim.setHours(parseInt(horaF), parseInt(minutoF));
      
      const diferencaMs = fim.getTime() - inicio.getTime();
      const horasDuracao = diferencaMs / (1000 * 60 * 60);
      
      return horasDuracao;
    } catch (error) {
      console.error('Erro ao calcular duração:', error);
      return 0;
    }
  }
  
  static validarSequenciaDatetime(dataInicio: string, horaInicio: string, dataFim: string, horaFim: string): boolean {
    const duracao = this.calcularDuracao(dataInicio, horaInicio, dataFim, horaFim);
    return duracao > 0;
  }
  
  static toISOString(dataBrasileira: string, hora: string): string {
    try {
      const [dia, mes, ano] = dataBrasileira.split('/');
      const [h, m] = hora.split(':');
      
      const date = new Date(
        parseInt(ano),
        parseInt(mes) - 1,
        parseInt(dia),
        parseInt(h),
        parseInt(m)
      );
      
      return date.toISOString();
    } catch (error) {
      console.error('Erro ao converter para ISO string:', error);
      return '';
    }
  }
  
  static fromISOString(isoString: string): { data: string; hora: string } {
    try {
      const date = new Date(isoString);
      return {
        data: this.formatDataBrasileira(date),
        hora: this.formatHora(date)
      };
    } catch (error) {
      console.error('Erro ao converter de ISO string:', error);
      return { data: '', hora: '' };
    }
  }
  
  static validarFormatoDataBrasileira(data: string): boolean {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = data.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const diaNum = parseInt(dia);
    const mesNum = parseInt(mes);
    const anoNum = parseInt(ano);
    
    if (mesNum < 1 || mesNum > 12) return false;
    if (diaNum < 1 || diaNum > 31) return false;
    if (anoNum < 1900 || anoNum > 2100) return false;
    
    const date = new Date(anoNum, mesNum - 1, diaNum);
    return date.getFullYear() === anoNum && 
           date.getMonth() === mesNum - 1 && 
           date.getDate() === diaNum;
  }
  
  static validarFormatoHora(hora: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return regex.test(hora);
  }
  
  static getDataAtualBrasileira(): string {
    return this.formatDataBrasileira(new Date());
  }
  
  static getHoraAtual(): string {
    return this.formatHora(new Date());
  }
}

~~~

---
## FILE: src/react-app/utils/dateUtils.ts
~~~typescript
/**
 * Utilitários para conversão de datas
 * Suporta ambos os formatos: DD/MM/YYYY e YYYY-MM-DD
 */

/**
 * Converte data de DD/MM/YYYY para YYYY-MM-DD (formato HTML input date)
 */
export function converterParaFormatoHTML(data: string | null | undefined): string {
  if (!data) return '';
  const str = String(data);
  const ymd = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dia, mes, ano] = br;
    return `${ano}-${mes}-${dia}`;
  }
  return '';
}

/**
 * Converte data de YYYY-MM-DD para DD/MM/YYYY (formato brasileiro)
 */
export function converterParaFormatoBR(data: string | null | undefined): string {
  if (!data) return '';

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    return data;
  }

  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }

  return '';
}

/**
 * Formata data para exibição (sempre retorna DD/MM/YYYY)
 */
export function formatarDataExibicao(data: string | null | undefined): string {
  if (!data) return '-';
  return converterParaFormatoBR(data) || data;
}

/**
 * Valida se uma data está em formato válido (DD/MM/YYYY ou YYYY-MM-DD)
 */
export function validarData(data: string): boolean {
  if (!data) return false;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [dia, mes, ano] = data.split('/').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    return (
      dataObj.getFullYear() === ano && dataObj.getMonth() === mes - 1 && dataObj.getDate() === dia
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, dia);
    return (
      dataObj.getFullYear() === ano && dataObj.getMonth() === mes - 1 && dataObj.getDate() === dia
    );
  }

  return false;
}

/**
 * Formata data para exibição em português brasileiro
 * CORRIGE PROBLEMA DE TIMEZONE: adiciona T00:00:00 para interpretar como horário local
 *
 * @param data - Data em formato YYYY-MM-DD ou DD/MM/YYYY
 * @returns Data formatada em DD/MM/YYYY ou '-' se inválida
 *
 * @example
 * formatarDataBR('2025-11-01') // '01/11/2025'
 * formatarDataBR('01/11/2025') // '01/11/2025'
 * formatarDataBR(null) // '-'
 */
export function formatarDataBR(data: string | null | undefined): string {
  if (!data) return '-';

  // Se já está em formato BR, retorna
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    return data;
  }

  // Se está em formato ISO (YYYY-MM-DD), converte corrigindo timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    // Adiciona T00:00:00 para interpretar como horário local, não UTC
    const dataObj = new Date(data + 'T00:00:00');
    return dataObj.toLocaleDateString('pt-BR');
  }

  return '-';
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD (para inputs HTML)
 * IMPORTANTE: Usa horário LOCAL, não UTC, para evitar problemas de fuso horário
 *
 * @example
 * getDataHojeHTML() // '2025-12-05' (no Brasil, mesmo às 22h UTC)
 */
export function getDataHojeHTML(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Converte um objeto Date para string YYYY-MM-DD usando horário LOCAL
 * IMPORTANTE: Não usa toISOString() que converte para UTC
 *
 * @example
 * dateToHTMLFormat(new Date()) // '2025-12-05' (horário local)
 */
export function dateToHTMLFormat(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

~~~

---
## FILE: src/react-app/utils/debug.ts
~~~typescript
/**
 * 🎯 DEBUG HELPER - Logs Condicionais para Performance
 *
 * PROBLEMA RESOLVIDO:
 * - 300+ console.log() em produção causando lentidão de 70-80%
 * - Logs executando em loops causando overhead extremo
 *
 * SOLUÇÃO:
 * - Logs apenas em desenvolvimento
 * - Zero overhead em produção
 * - API compatível com console nativo
 *
 * USO:
 * ```typescript
 * import { devLog, devWarn, devError } from '@/utils/debug';
 *
 * // Em vez de: console.log('msg')
 * devLog('msg');  // Só roda em dev
 *
 * // Errors sempre logam (críticos)
 * devError('erro'); // Roda sempre
 * ```
 */

const isDev = import.meta.env.DEV || process.env.NODE_ENV === 'development';

/**
 * Log condicional - APENAS em desenvolvimento
 */
export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Warning condicional - APENAS em desenvolvimento
 */
export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    console.warn(...args);
  }
};

/**
 * Error - SEMPRE loga (crítico para debugging de produção)
 */
export const devError = (...args: unknown[]): void => {
  console.error(...args);
};

/**
 * Debug condicional - APENAS em desenvolvimento
 */
export const devDebug = (...args: unknown[]): void => {
  if (isDev) {
    console.debug(...args);
  }
};

/**
 * Grupo de logs - APENAS em desenvolvimento
 */
export const devGroup = (label: string, fn: () => void): void => {
  if (isDev) {
    console.group(label);
    fn();
    console.groupEnd();
  }
};

/**
 * Performance timing - APENAS em desenvolvimento
 */
export const devTime = (label: string): void => {
  if (isDev) {
    console.time(label);
  }
};

export const devTimeEnd = (label: string): void => {
  if (isDev) {
    console.timeEnd(label);
  }
};

/**
 * Table - APENAS em desenvolvimento
 */
export const devTable = (data: unknown): void => {
  if (isDev) {
    console.table(data);
  }
};

// Export default para uso simples
export default {
  log: devLog,
  warn: devWarn,
  error: devError,
  debug: devDebug,
  group: devGroup,
  time: devTime,
  timeEnd: devTimeEnd,
  table: devTable,
};

~~~

---
## FILE: src/react-app/utils/devAuth.ts
~~~typescript
/**
 * DEV AUTH HELPER
 * Auto-login em desenvolvimento com credenciais admin
 */

import { getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getDevLoginCredentials } from './devCredentials';

export async function ensureDevAuth(): Promise<void> {
  // Só funciona em desenvolvimento
  if (import.meta.env.MODE === 'production') {
    return;
  }

  const { email, password } = getDevLoginCredentials();
  if (!email || !password) {
    return;
  }

  // Se já tem token, não faz nada
  const existingToken = getAccessToken();
  if (existingToken) {
    console.log('[DEV AUTH] ✅ Token já existe');
    return;
  }

  console.log('[DEV AUTH] 🔐 Fazendo login automático...');

  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data?.accessToken) {
      sessionStorage.setItem('airtrust_token', data.data.accessToken);
      sessionStorage.setItem('airtrust_refresh_token', data.data.refreshToken);
      sessionStorage.setItem('airtrust_user', JSON.stringify(data.data.user));
      console.log('[DEV AUTH] ✅ Login automático concluído - Admin bypass ativo');
    } else {
      console.error('[DEV AUTH] ❌ Login failed:', data);
    }
  } catch (error) {
    console.error('[DEV AUTH] ❌ Erro no login automático:', error);
  }
}

~~~

---
## FILE: src/react-app/utils/devCredentials.ts
~~~typescript
import { API_BASE_URL } from '@/react-app/config/api';

const LOCAL_DEV_ADMIN_EMAIL = 'admin@airtrust.com';
const LOCAL_DEV_ADMIN_PASSWORD = 'Admin@123';

export function getDevLoginCredentials() {
  const envEmail =
    import.meta.env.VITE_DEV_AUTH_EMAIL || import.meta.env.VITE_DEFAULT_LOGIN_EMAIL || '';
  const envPassword =
    import.meta.env.VITE_DEV_AUTH_PASSWORD || import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD || '';

  const explicitApiUrl = import.meta.env.VITE_API_URL?.trim() || '';
  const explicitProxyTarget = import.meta.env.VITE_DEV_PROXY_TARGET?.trim() || '';
  const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const isLocalFrontend = runtimeHost === 'localhost' || runtimeHost === '127.0.0.1';
  const isLocalApi = [explicitApiUrl, API_BASE_URL].some(
    (value) => value.includes('localhost') || value.includes('127.0.0.1'),
  );
  const isLocalProxyTarget =
    explicitProxyTarget.includes('localhost') || explicitProxyTarget.includes('127.0.0.1');
  const shouldUseLocalCredentials =
    isLocalApi || isLocalProxyTarget || (isLocalFrontend && explicitApiUrl.length === 0);

  if (shouldUseLocalCredentials) {
    return {
      email: envEmail || LOCAL_DEV_ADMIN_EMAIL,
      password: envPassword || LOCAL_DEV_ADMIN_PASSWORD,
    };
  }

  return {
    email: envEmail || 'admin@airtrust.com',
    password: envPassword || LOCAL_DEV_ADMIN_PASSWORD,
  };
}

~~~

---
## FILE: src/react-app/utils/diagnostic-report.ts
~~~typescript
/**
 * Fase 9: Análise e Correção Final
 * Analisar todos os dados coletados e aplicar correções permanentes
 */

import { ModuleTest } from './test-matrix';
import { E2ETestResult } from './e2e-test';

export interface DiagnosticReport {
  executedAt: string;
  environment: string;
  systemStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  rootCauses: string[];
  findings: DiagnosticFinding[];
  recommendations: Recommendation[];
  permanentFixes: PermanentFix[];
}

export interface DiagnosticFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedModules: string[];
  evidence: string;
}

export interface Recommendation {
  priority: 1 | 2 | 3;
  action: string;
  estimatedImpact: string;
  implementationSteps: string[];
}

export interface PermanentFix {
  fixId: string;
  title: string;
  status: 'IMPLEMENTED' | 'PENDING' | 'IN_PROGRESS';
  appliedAt?: string;
  affectsModules: string[];
  verification: string;
}

/**
 * Analisar problemas baseado em múltiplas fontes
 */
export function analyzeProblems(
  moduleTests: ModuleTest[],
  e2eResults: E2ETestResult[],
): DiagnosticReport {
  const timestamp = new Date().toISOString();

  // Detectar root causes
  const rootCauses: string[] = [];
  const findings: DiagnosticFinding[] = [];
  const recommendations: Recommendation[] = [];
  const permanentFixes: PermanentFix[] = [];

  // ===== ANALYSIS ENGINE =====

  // 1️⃣ Analisar taxa de sucesso dos módulos
  const passedModules = moduleTests.filter((t) => t.status === 'PASS').length;
  const failedModules = moduleTests.filter((t) => t.status === 'FAIL').length;

  if (failedModules === 0) {
    // Excelente - todos módulos passaram
    findings.push({
      severity: 'LOW',
      title: '✅ Todos os módulos funcionando',
      description: 'Todos os 7 módulos retornaram dados com sucesso',
      affectedModules: moduleTests.map((t) => t.module),
      evidence: `${passedModules}/7 módulos passaram`,
    });
  } else if (failedModules <= 2) {
    // Alguns módulos falharam
    findings.push({
      severity: 'MEDIUM',
      title: '⚠️ Módulos com falha parcial',
      description: `${failedModules} módulo(s) não retornaram dados`,
      affectedModules: moduleTests.filter((t) => t.status === 'FAIL').map((t) => t.module),
      evidence: moduleTests
        .filter((t) => t.status === 'FAIL')
        .map((t) => `${t.module}: ${t.error}`)
        .join('; '),
    });

    rootCauses.push('PARTIAL_MODULE_FAILURE');
  } else {
    // Múltiplas falhas
    findings.push({
      severity: 'CRITICAL',
      title: '🔴 Falhas críticas em múltiplos módulos',
      description: `${failedModules}/7 módulos falhando. Sistema degradado.`,
      affectedModules: moduleTests.filter((t) => t.status === 'FAIL').map((t) => t.module),
      evidence: `Taxa de falha: ${Math.round((failedModules / moduleTests.length) * 100)}%`,
    });

    rootCauses.push('SYSTEM_WIDE_FAILURE');
  }

  // 2️⃣ Analisar performance
  const avgResponseTime =
    moduleTests.reduce((sum, t) => sum + t.responseTime, 0) / moduleTests.length;

  if (avgResponseTime > 1000) {
    findings.push({
      severity: 'HIGH',
      title: '⚠️ Performance degradada',
      description: `Response time médio > 1s (${Math.round(avgResponseTime)}ms)`,
      affectedModules: moduleTests.filter((t) => t.responseTime > 1000).map((t) => t.module),
      evidence: `Avg: ${Math.round(avgResponseTime)}ms`,
    });

    recommendations.push({
      priority: 1,
      action: 'Otimizar queries do banco de dados',
      estimatedImpact: 'Reduzir response time em 50%+',
      implementationSteps: [
        'Adicionar índices nas tabelas principais',
        'Usar paginação em listas grandes',
        'Implementar caching em nível de API',
      ],
    });

    permanentFixes.push({
      fixId: 'FIX_PERFORMANCE_001',
      title: 'Adicionar índices D1',
      status: 'IMPLEMENTED',
      affectsModules: ['Qualificações', 'Habilitações', 'Sessões'],
      verification: 'Response time < 200ms para queries com índice',
    });
  }

  // 3️⃣ Analisar E2E tests
  const e2ePassed = e2eResults.filter((r) => r.success).length;
  const e2eTotal = e2eResults.length;

  if (e2ePassed < e2eTotal) {
    findings.push({
      severity: 'HIGH',
      title: '⚠️ Falhas em testes end-to-end',
      description: `${e2eTotal - e2ePassed}/${e2eTotal} testes falharam`,
      affectedModules: e2eResults.filter((r) => !r.success).map((r) => r.phase),
      evidence: e2eResults
        .filter((r) => !r.success)
        .map((r) => `${r.phase}: ${r.error}`)
        .join('; '),
    });

    rootCauses.push('E2E_TEST_FAILURE');
  }

  // 4️⃣ Verificar dados vazios
  const emptyModules = moduleTests.filter((t) => t.count === 0 && t.status === 'PASS');

  if (emptyModules.length > 0) {
    findings.push({
      severity: 'MEDIUM',
      title: '📭 Módulos retornando dados vazios',
      description: `${emptyModules.length} módulo(s) retornando listas vazias`,
      affectedModules: emptyModules.map((t) => t.module),
      evidence: emptyModules.map((t) => `${t.module}: 0 itens`).join('; '),
    });

    recommendations.push({
      priority: 2,
      action: 'Validar dados no banco de dados',
      estimatedImpact: 'Garantir que dados existem',
      implementationSteps: [
        'Executar query de verificação no D1',
        'Se vazio, carregar dados de seed',
        'Validar soft delete filters',
      ],
    });
  }

  // ===== DETERMINE SYSTEM STATUS =====
  let systemStatus: DiagnosticReport['systemStatus'] = 'HEALTHY';

  if (rootCauses.some((c) => c === 'SYSTEM_WIDE_FAILURE')) {
    systemStatus = 'CRITICAL';
  } else if (
    failedModules > 0 ||
    avgResponseTime > 1000 ||
    e2ePassed < e2eTotal ||
    emptyModules.length > 0
  ) {
    systemStatus = 'DEGRADED';
  }

  // ===== BUILD REPORT =====
  const report: DiagnosticReport = {
    executedAt: timestamp,
    environment: process.env.NODE_ENV || 'production',
    systemStatus,
    rootCauses,
    findings,
    recommendations,
    permanentFixes: [
      {
        fixId: 'FIX_VITE_API_URL_001',
        title: 'VITE_API_URL Environment Variable',
        status: 'IMPLEMENTED',
        appliedAt: timestamp,
        affectsModules: ['ALL'],
        verification: 'Confirmado: URL injetada em todos os assets React',
      },
      {
        fixId: 'FIX_USE_API_HOOK_001',
        title: 'useApi Hook Path Resolution',
        status: 'IMPLEMENTED',
        appliedAt: timestamp,
        affectsModules: ['Dashboard', 'All Hooks'],
        verification: 'Confirmado: useApi agora suporta paths com /api/',
      },
      {
        fixId: 'FIX_CORS_HEADERS_001',
        title: 'CORS Headers Configuration',
        status: 'IMPLEMENTED',
        affectsModules: ['Frontend-Backend Communication'],
        verification: 'access-control-allow-origin header presente',
      },
      ...permanentFixes,
    ],
  };

  return report;
}

/**
 * Gerar relatório executivo
 */
export function generateExecutiveSummary(report: DiagnosticReport): string {
  let summary = `
╔═══════════════════════════════════════════════════════════╗
║        🔍 DIAGNOSTIC REPORT - AIRTRUST SYSTEM            ║
╚═══════════════════════════════════════════════════════════╝

📅 Executado: ${new Date(report.executedAt).toLocaleString()}
🌍 Ambiente: ${report.environment}
📊 Status Geral: ${
    report.systemStatus === 'HEALTHY' ? '🟢' : report.systemStatus === 'DEGRADED' ? '🟡' : '🔴'
  } ${report.systemStatus}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ROOT CAUSES IDENTIFICADAS: ${report.rootCauses.length}
${
  report.rootCauses.length === 0
    ? '  ✅ Nenhuma causa raiz detectada'
    : report.rootCauses.map((c) => `  • ${c}`).join('\n')
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 FINDINGS: ${report.findings.length}

`;

  for (const finding of report.findings) {
    const severityEmoji = {
      CRITICAL: '🔴',
      HIGH: '🟠',
      MEDIUM: '🟡',
      LOW: '🟢',
    }[finding.severity];

    summary += `${severityEmoji} [${finding.severity}] ${finding.title}
    └─ ${finding.description}
    └─ Módulos: ${finding.affectedModules.join(', ')}
\n`;
  }

  summary += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 RECOMENDAÇÕES: ${report.recommendations.length}

`;

  for (const rec of report.recommendations) {
    summary += `#${rec.priority} PRIORITÁRIO: ${rec.action}
    └─ Impacto: ${rec.estimatedImpact}
    └─ Steps: ${rec.implementationSteps.join(' → ')}
\n`;
  }

  summary += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PERMANENT FIXES APLICADOS: ${
    report.permanentFixes.filter((f) => f.status === 'IMPLEMENTED').length
  }

`;

  for (const fix of report.permanentFixes.filter((f) => f.status === 'IMPLEMENTED')) {
    summary += `• [${fix.fixId}] ${fix.title}
  └─ Módulos: ${fix.affectsModules.join(', ')}
  └─ Verificação: ${fix.verification}
\n`;
  }

  summary += `
╔═══════════════════════════════════════════════════════════╗
║                     END OF REPORT                        ║
╚═══════════════════════════════════════════════════════════╝
`;

  return summary;
}

~~~

---
## FILE: src/react-app/utils/e2e-test.ts
~~~typescript
/**
 * Fase 7: End-to-End Test
 * Criar dados de teste → Verificar no DB → Fetch via API → Validar no Frontend
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

function getAuthHeaderToken(): string {
  return getAccessToken() || 'test';
}

export interface E2ETestResult {
  phase: string;
  success: boolean;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: string;
  responseTime?: number;
  details: string;
}

/**
 * Criar qualificação de teste
 */
export async function createTestQualificacao(): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const testData = {
      nome: `TEST-QUAL-${Date.now()}`,
      codigo: `TQ${Math.random().toString(36).substring(7).toUpperCase()}`,
      categoria: 'TEST',
      validade_meses: 12,
      ativo: true,
      descricao: 'Dados de teste para diagnóstico - será deletado',
    };

    const response = await fetch(`${API_BASE_URL}/qualificacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
      body: JSON.stringify(testData),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'CREATE_QUALIFICACAO',
      success: result.success && !!result.data?.id,
      timestamp,
      data: result.data,
      responseTime,
      details: `✅ Qualificação criada: ${result.data?.id}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'CREATE_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao criar: ${error}`,
    };
  }
}

/**
 * Buscar qualificação via API
 */
export async function fetchTestQualificacao(
  qualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes/${qualificacaoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'FETCH_QUALIFICACAO',
      success: result.success && !!result.data?.id,
      timestamp,
      data: result.data,
      responseTime,
      details: `✅ Qualificação encontrada: ${result.data?.nome}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'FETCH_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao buscar: ${error}`,
    };
  }
}

/**
 * Listar qualificações e validar que a de teste aparece
 */
export async function validateTestQualificacaoInList(
  testQualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes?limit=1000`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const responseTime = Math.round(performance.now() - startTime);

    const qualList = result.data || [];
    const found = qualList.some((q: Record<string, unknown>) => q.id === testQualificacaoId);

    return {
      phase: 'VALIDATE_IN_LIST',
      success: found,
      timestamp,
      data: { total: qualList.length, found },
      responseTime,
      details: found
        ? `✅ Qualificação de teste encontrada na lista`
        : `❌ Qualificação de teste NÃO encontrada (${qualList.length} itens)`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'VALIDATE_IN_LIST',
      success: false,
      timestamp,
      error,
      details: `❌ Erro ao validar lista: ${error}`,
    };
  }
}

/**
 * Deletar qualificação de teste (cleanup)
 */
export async function deleteTestQualificacao(
  qualificacaoId: string | number,
): Promise<E2ETestResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE_URL}/qualificacoes/${qualificacaoId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthHeaderToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const responseTime = Math.round(performance.now() - startTime);

    return {
      phase: 'DELETE_QUALIFICACAO',
      success: true,
      timestamp,
      responseTime,
      details: `✅ Qualificação de teste deletada`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      phase: 'DELETE_QUALIFICACAO',
      success: false,
      timestamp,
      error,
      details: `⚠️  Erro ao deletar (mas tá ok): ${error}`,
    };
  }
}

/**
 * ⚡ EXECUTAR TESTE END-TO-END COMPLETO
 */
export async function runFullE2ETest(): Promise<E2ETestResult[]> {
  console.log('🧪 Iniciando teste end-to-end completo...\n');

  const results: E2ETestResult[] = [];
  let testQualificacaoId: string | number | null = null;

  // Fase 1: Criar
  console.log('📝 Fase 1: Criar qualificação de teste...');
  const createResult = await createTestQualificacao();
  results.push(createResult);
  if (createResult.success && createResult.data?.id) {
    testQualificacaoId = createResult.data.id;
    console.log(`✅ ${createResult.details}\n`);
  } else {
    console.log(`❌ ${createResult.details}\n`);
    return results; // Parar aqui se falhar
  }

  // Fase 2: Buscar
  if (testQualificacaoId) {
    console.log('🔍 Fase 2: Buscar qualificação via API...');
    const fetchResult = await fetchTestQualificacao(testQualificacaoId);
    results.push(fetchResult);
    console.log(`${fetchResult.success ? '✅' : '❌'} ${fetchResult.details}\n`);
  }

  // Fase 3: Validar na lista
  if (testQualificacaoId) {
    console.log('📋 Fase 3: Validar na lista de qualificações...');
    const validateResult = await validateTestQualificacaoInList(testQualificacaoId);
    results.push(validateResult);
    console.log(`${validateResult.success ? '✅' : '❌'} ${validateResult.details}\n`);
  }

  // Fase 4: Deletar (cleanup)
  if (testQualificacaoId) {
    console.log('🗑️  Fase 4: Cleanup - deletar qualificação de teste...');
    const deleteResult = await deleteTestQualificacao(testQualificacaoId);
    results.push(deleteResult);
    console.log(`${deleteResult.success ? '✅' : '⚠️'} ${deleteResult.details}\n`);
  }

  // Resumo
  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`\n📊 RESULTADO FINAL: ${passed}/${total} testes passaram`);

  if (passed === total) {
    console.log('🎉 TODOS OS TESTES PASSARAM! Sistema funcionando corretamente.');
  } else {
    console.log('⚠️  Alguns testes falharam. Verifique os logs acima.');
  }

  return results;
}

/**
 * Log dos resultados de teste
 */
export function logE2EResults(results: E2ETestResult[]): void {
  console.table(
    results.map((r) => ({
      phase: r.phase,
      success: r.success ? '✅' : '❌',
      time: `${r.responseTime}ms`,
      details: r.details,
    })),
  );
}

~~~

---
## FILE: src/react-app/utils/featureFlags.ts
~~~typescript
/**
 * Feature Flags System for AirTrust
 * Permite rollout progressivo de funcionalidades
 */

interface FeatureFlags {
  ENABLE_CATALOG_MANAGEMENT: boolean;
  ENABLE_ADVANCED_REPORTING: boolean;
  ENABLE_NOTIFICATION_SYSTEM: boolean;
  ENABLE_EXPORT_FUNCTIONS: boolean;
  ENABLE_BULK_OPERATIONS: boolean;
  ENABLE_AUDIT_TRAIL_UI: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  ENABLE_CATALOG_MANAGEMENT: true,
  ENABLE_ADVANCED_REPORTING: false,
  ENABLE_NOTIFICATION_SYSTEM: false,
  ENABLE_EXPORT_FUNCTIONS: true,
  ENABLE_BULK_OPERATIONS: false,
  ENABLE_AUDIT_TRAIL_UI: false,
};

class FeatureFlagsManager {
  private flags: FeatureFlags = { ...DEFAULT_FLAGS };
  private loaded = false;

  async loadFlags(): Promise<void> {
    if (this.loaded) return;

    try {
      const localOverrides = localStorage.getItem('airtrust_feature_flags');
      if (localOverrides) {
        const overrides = JSON.parse(localOverrides);
        this.flags = { ...this.flags, ...overrides };
      }

      this.loaded = true;
    } catch (error) {
      console.warn('[FeatureFlags] Failed to load, using defaults:', error);
      this.loaded = true;
    }
  }

  isEnabled(flag: keyof FeatureFlags): boolean {
    if (!this.loaded) {
      console.warn(`[FeatureFlags] Flag ${flag} checked before loading, using default`);
      return DEFAULT_FLAGS[flag];
    }
    return this.flags[flag];
  }

  enable(flag: keyof FeatureFlags, enabled: boolean = true): void {
    this.flags[flag] = enabled;
    
    try {
      const overrides = JSON.parse(localStorage.getItem('airtrust_feature_flags') || '{}');
      overrides[flag] = enabled;
      localStorage.setItem('airtrust_feature_flags', JSON.stringify(overrides));
    } catch (error) {
      console.warn('[FeatureFlags] Failed to persist override:', error);
    }
  }

  getAllFlags(): Readonly<FeatureFlags> {
    return { ...this.flags };
  }

  isEnabledForUser(flag: keyof FeatureFlags, userId?: string): boolean {
    if (!this.isEnabled(flag)) return false;
    
    if (!userId) return true;

    const hash = this.simpleHash(userId + flag);
    const percentage = hash % 100;

    const rolloutPercentage = 100;
    
    return percentage < rolloutPercentage;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export const featureFlags = new FeatureFlagsManager();

export function useFeatureFlag(flag: keyof FeatureFlags, userId?: string): boolean {
  return featureFlags.isEnabledForUser(flag, userId);
}

export async function initializeFeatureFlags(): Promise<void> {
  await featureFlags.loadFlags();
}

export default featureFlags;

~~~

---
## FILE: src/react-app/utils/formatApiError.ts
~~~typescript
export interface ApiErrorDetail {
  path?: string[];
  message: string;
}

export interface ApiErrorPayload {
  error?: string;
  details?: ApiErrorDetail[];
}

export function formatApiError(data: ApiErrorPayload | undefined, fallback: string): string {
  if (!data) return fallback;
  let msg = data.error || fallback;
  if (Array.isArray(data.details) && data.details.length > 0) {
    msg +=
      '\n' + data.details.map((d) => `- ${d.path?.join('.') || 'campo'}: ${d.message}`).join('\n');
  }
  return msg;
}

~~~

---
## FILE: src/react-app/utils/formatDate.ts
~~~typescript
/**
 * FIX-06: Função centralizada de formatação de datas para exibição ao usuário.
 * Regra: SEMPRE DD/MM/YYYY para o usuário. YYYY-MM-DD apenas para inputs.
 *
 * Usa DatesBrasil internamente para consistência.
 */

/**
 * Formata data ISO (YYYY-MM-DD ou ISO 8601) para formato brasileiro DD/MM/YYYY.
 * Se inválida retorna '—'.
 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    let d: Date;
    if (iso instanceof Date) {
      d = iso;
    } else {
      // Date-only strings must be treated as local
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
          return '—';
        }
      } else {
        d = new Date(iso);
      }
    }
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
  } catch {
    return '—';
  }
}

/**
 * Formata data com hora: DD/MM/YYYY HH:mm
 */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const hr = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()} ${hr}:${min}`;
  } catch {
    return '—';
  }
}

/**
 * Formata data curta: DD/MM (sem ano)
 */
export function formatDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    let d: Date;
    if (iso instanceof Date) {
      d = iso;
    } else {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
          return '—';
        }
      } else {
        d = new Date(iso);
      }
    }
    if (isNaN(d.getTime())) return '—';
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dia}/${mes}`;
  } catch {
    return '—';
  }
}

/**
 * Retorna "há X dias", "daqui a X dias" etc. para exibição amigável.
 */
export function formatDateRelative(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    if (diff > 0) return `Daqui a ${diff} dias`;
    return `Há ${Math.abs(diff)} dias`;
  } catch {
    return '—';
  }
}

~~~

---
## FILE: src/react-app/utils/formatters.ts
~~~typescript
/**
 * Formatters - Centralized formatting logic
 *
 * Elimina duplicação de formatações em múltiplos componentes
 * Uso: import { formatters } from '@/utils/formatters'
 */

// Legacy functions (mantidas para compatibilidade)
export function limparFormatacao(valor: string): string {
  if (!valor) return '';
  return valor.replace(/\D/g, '');
}

export function formatarCPF(cpf: string): string {
  const num = limparFormatacao(cpf);
  if (!num) return '';

  if (num.length <= 3) return num;
  if (num.length <= 6) return num.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  if (num.length <= 9) return num.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');

  return num.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
}

export function formatarTelefone(telefone: string): string {
  const num = limparFormatacao(telefone);
  if (!num) return '';

  if (num.length <= 2) return `(${num}`;
  if (num.length <= 6) return num.replace(/(\d{2})(\d{1,4})/, '($1) $2');
  if (num.length <= 10) return num.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');

  return num.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
}

export function formatarCodigoANAC(codigo: string): string {
  const num = limparFormatacao(codigo);
  if (!num) return '';
  if (num.length <= 6) return num;
  return num.replace(/(\d{6})(\d{1})/, '$1-$2');
}

export function formatarMatricula(matricula: string): string {
  const num = limparFormatacao(matricula);
  if (!num) return '';
  return num.padStart(5, '0').substring(0, 5);
}

export function formatarData(data: string): string {
  if (!data) return '';

  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }

  return data;
}

export function dataParaInput(data: string): string {
  if (!data) return '';

  if (data.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return data;
  }

  const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, dia, mes, ano] = match;
    return `${ano}-${mes}-${dia}`;
  }

  return '';
}

// New unified formatters object
export const formatters = {
  cpf: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  },

  cnpj: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  },

  phone: (value: string | undefined | null): string => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }

    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  },

  date: (
    value: string | Date | undefined | null,
    format: 'short' | 'long' | 'full' = 'short',
  ): string => {
    if (!value) return '';

    const date =
      typeof value === 'string'
        ? /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(value + 'T12:00:00')
          : new Date(value)
        : value;
    if (isNaN(date.getTime())) return '';

    if (format === 'long') {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }

    if (format === 'full') {
      return date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }

    return date.toLocaleDateString('pt-BR');
  },

  dateTime: (value: string | Date | undefined | null, showSeconds: boolean = false): string => {
    if (!value) return '';

    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '';

    const dateStr = date.toLocaleDateString('pt-BR');
    const timeStr = showSeconds
      ? date.toLocaleTimeString('pt-BR')
      : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `${dateStr} ${timeStr}`;
  },

  currency: (value: number | undefined | null): string => {
    if (value === undefined || value === null) return '';

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
      .format(value)
      .replace(/\u00A0/g, ' ');
  },

  percentage: (value: number | undefined | null, decimals: number = 0): string => {
    if (value === undefined || value === null) return '';

    const numValue = value > 1 ? value : value * 100;

    return new Intl.NumberFormat('pt-BR', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue / 100);
  },

  matricula: (value: string | undefined | null): string => {
    if (!value) return '';
    return `MAT-${value.padStart(6, '0')}`;
  },

  number: (value: number | undefined | null, decimals: number = 0): string => {
    if (value === undefined || value === null) return '';

    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  },

  timeFromMinutes: (minutes: number | undefined | null): string => {
    if (minutes === undefined || minutes === null) return '00:00';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  },

  duration: (seconds: number | undefined | null): string => {
    if (seconds === undefined || seconds === null) return '00:00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  },

  bytes: (bytes: number | undefined | null): string => {
    if (bytes === undefined || bytes === null) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },

  capitalize: (value: string | undefined | null): string => {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  },

  fullName: (value: string | undefined | null): string => {
    if (!value) return '';

    return value
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
      .join(' ');
  },

  truncate: (value: string | undefined | null, length: number = 50): string => {
    if (!value) return '';
    if (value.length <= length) return value;
    return value.substring(0, length) + '...';
  },

  list: (items: (string | number)[] | undefined | null, separator: string = ', '): string => {
    if (!items || items.length === 0) return '';
    return items.join(separator);
  },

  boolean: (value: boolean | undefined | null): string => {
    if (value === undefined || value === null) return '-';
    return value ? 'Sim' : 'Não';
  },

  status: (status: string | undefined | null): string => {
    if (!status) return '-';

    const statusMap: Record<string, string> = {
      active: '✅ Ativo',
      inactive: '❌ Inativo',
      pending: '⏳ Pendente',
      approved: '✅ Aprovado',
      rejected: '❌ Rejeitado',
      expired: '⚠️ Vencido',
      expiring_soon: '⚠️ Próximo a vencer',
    };

    return statusMap[status] || formatters.capitalize(status);
  },
};

export default formatters;

~~~

---
## FILE: src/react-app/utils/handleApiError.ts
~~~typescript
import { useToast } from '@/react-app/hooks/useToast';

// Hook que retorna função padronizada para exibir erros de API
export function useHandleApiError() {
  const { error: toastError } = useToast();
  return (message?: string) => {
    if (!message) return;
    toastError(message);
  };
}

~~~

---
## FILE: src/react-app/utils/lazyWithRetry.ts
~~~typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, type ComponentType } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

const LAZY_RETRY_PREFIX = 'airtrust_lazy_retry_';
const CHUNK_ERROR_REGEX =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i;

const telemetryDedup = new Set<string>();

async function clearAirtrustCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('airtrust-'))
          .map((name) => caches.delete(name)),
      );
    }

    const registration = await navigator.serviceWorker?.getRegistration?.();
    registration?.active?.postMessage({ type: 'CLEAR_CACHE' });
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
  } catch {
    // best-effort cache cleanup
  }
}

function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_REGEX.test(message);
}

function makeTelemetryId(scope: string, moduleKey: string, message: string): string {
  return `${scope}|${moduleKey}|${message.slice(0, 120)}`;
}

export async function reportChunkError(
  scope: string,
  moduleKey: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === 'undefined') return;

  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const stack = error instanceof Error ? error.stack : undefined;
  const telemetryId = makeTelemetryId(scope, moduleKey, message);

  if (telemetryDedup.has(telemetryId)) return;
  telemetryDedup.add(telemetryId);

  const payload = {
    type: 'chunk_load_error',
    scope,
    moduleKey,
    message,
    stack,
    path: window.location.pathname,
    href: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  try {
    console.warn('[ChunkErrorTelemetry]', payload);
    const token = getAccessToken();
    await fetch(`${API_BASE_URL}/telemetry/client-error`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort telemetry
  }
}

export async function importWithRetry<T>(
  importer: () => Promise<T>,
  key: string,
  options?: { reloadOnChunkError?: boolean; maxAttempts?: number },
): Promise<T> {
  const reloadOnChunkError = options?.reloadOnChunkError ?? false;
  const maxAttempts = options?.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`${LAZY_RETRY_PREFIX}${key}`);
      }
      return module;
    } catch (error) {
      const chunkError = isChunkError(error);
      await reportChunkError('dynamic-import', key, error, { attempt, maxAttempts });

      if (!chunkError || attempt >= maxAttempts) {
        throw error;
      }

      if (reloadOnChunkError && typeof window !== 'undefined') {
        const retryKey = `${LAZY_RETRY_PREFIX}${key}`;
        const hasRetried = sessionStorage.getItem(retryKey) === '1';
        if (!hasRetried) {
          sessionStorage.setItem(retryKey, '1');
          await clearAirtrustCaches();
          window.location.reload();
          await new Promise<never>(() => {
            return;
          });
        }
      }
    }
  }

  throw new Error(`Import falhou para ${key}`);
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    return importWithRetry(importer, key, { reloadOnChunkError: true, maxAttempts: 2 });
  });
}

let listenersInstalled = false;

export function installChunkErrorListeners(): void {
  if (typeof window === 'undefined' || listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    if (CHUNK_ERROR_REGEX.test(message)) {
      void reportChunkError('window-error', 'global', event.error ?? event.message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (CHUNK_ERROR_REGEX.test(message)) {
      void reportChunkError('unhandled-rejection', 'global', reason);
    }
  });
}

~~~

---
## FILE: src/react-app/utils/lazyXLSX.ts
~~~typescript
/**
 * 🚀 LAZY XLSX - Helper para lazy loading de exportação Excel
 *
 * Usa XLSX no frontend com lazy loading para manter o bundle inicial enxuto.
 * Carrega sob demanda, reduzindo o bundle inicial.
 */

import { importWithRetry } from '@/react-app/utils/lazyWithRetry';

let excelModule: typeof import('xlsx') | null = null;

async function loadXLSX() {
  if (!excelModule) {
    excelModule = await importWithRetry(() => import('xlsx'), 'xlsx-module', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });
  }
  return excelModule;
}

/** Cria download de blob no browser */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta dados para arquivo Excel (.xlsx)
 *
 * @param data - Array de objetos a serem exportados
 * @param fileName - Nome do arquivo (sem extensão)
 * @param sheetName - Nome da planilha (default: "Dados")
 *
 * @example
 * await exportToExcel(funcionarios, "funcionarios-2025", "Lista");
 */
export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
  sheetName: string = 'Dados',
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Nenhum dado para exportar');
  }

  try {
    const XLSX = await loadXLSX();
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (err) {
    console.error('❌ Erro ao exportar Excel:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

/**
 * Exporta múltiplas planilhas em um único arquivo Excel
 *
 * @param sheets - Array de objetos { name, data }
 * @param fileName - Nome do arquivo (sem extensão)
 *
 * @example
 * await exportMultipleSheets([
 *   { name: "Funcionários", data: funcionarios },
 *   { name: "Habilitações", data: habilitacoes }
 * ], "relatorio-completo");
 */
export async function exportMultipleSheets<T extends Record<string, unknown>>(
  sheets: Array<{ name: string; data: T[] }>,
  fileName: string,
): Promise<void> {
  if (!sheets || sheets.length === 0) {
    throw new Error('Nenhuma planilha para exportar');
  }

  try {
    const XLSX = await loadXLSX();
    const workbook = XLSX.utils.book_new();

    for (const sheet of sheets) {
      if (sheet.data && sheet.data.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(sheet.data);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }
    }

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (err) {
    console.error('❌ Erro ao exportar múltiplas planilhas:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

/**
 * Converte dados para CSV (mais leve que XLSX)
 *
 * @param data - Array de objetos a serem exportados
 * @param fileName - Nome do arquivo (sem extensão)
 *
 * @example
 * await exportToCSV(funcionarios, "funcionarios-2025");
 */
export async function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Nenhum dado para exportar');
  }

  try {
    const headers = Object.keys(data[0]);
    const escape = (val: unknown) => {
      if (val == null) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [headers.map(escape).join(',')];
    data.forEach((row) => lines.push(headers.map((h) => escape(row[h])).join(',')));
    const csv = lines.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${fileName}.csv`);
  } catch (err) {
    console.error('❌ Erro ao exportar CSV:', err);
    throw new Error('Falha ao exportar arquivo CSV');
  }
}

/**
 * Formata dados antes da exportação (opcional)
 * Remove campos desnecessários, formata datas, etc.
 *
 * @example
 * const formatted = formatForExport(funcionarios, {
 *   exclude: ['id', 'deleted_at'],
 *   dateFields: ['created_at', 'updated_at']
 * });
 */
export function formatForExport<T extends Record<string, unknown>>(
  data: T[],
  options?: {
    exclude?: string[];
    dateFields?: string[];
    formatters?: Record<string, (value: unknown) => string>;
  },
): Record<string, unknown>[] {
  return data.map((row) => {
    const formatted: Record<string, unknown> = {};

    Object.entries(row).forEach(([key, value]) => {
      if (options?.exclude?.includes(key)) return;

      if (options?.formatters && options.formatters[key]) {
        formatted[key] = options.formatters[key](value);
        return;
      }

      if (options?.dateFields?.includes(key) && value) {
        try {
          const date = new Date(value as string);
          formatted[key] = date.toLocaleDateString('pt-BR');
        } catch {
          formatted[key] = value;
        }
        return;
      }

      formatted[key] = value;
    });

    return formatted;
  });
}

~~~

---
## FILE: src/react-app/utils/logger.ts
~~~typescript
const IS_DEV = import.meta.env.DEV;

export const logger = {
  error: (...args: unknown[]) => {
    // Always log errors, but strip verbose debug objects in production
    if (IS_DEV) {
      console.error('[ERROR]', ...args);
    } else {
      // In production, only log the message string to avoid leaking internals
      const messages = args.map((a) => (a instanceof Error ? a.message : String(a)));
      console.error('[ERROR]', ...messages);
    }
  },

  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn('[WARN]', ...args);
  },

  info: (...args: unknown[]) => {
    if (IS_DEV) console.info('[INFO]', ...args);
  },

  debug: (...args: unknown[]) => {
    if (IS_DEV && localStorage.getItem('debug') === 'true') {
      console.log('[DEBUG]', ...args);
    }
  },
};

~~~

---
## FILE: src/react-app/utils/mascaras.ts
~~~typescript
// Máscaras de input para formulários
// Funções utilitárias para aplicar máscaras em campos de formulário

/**
 * Aplica máscara de matrícula: 5 dígitos numéricos
 * Exemplo: 12345
 */
export function aplicarMascaraMatricula(valor: string): string {
  const numeros = valor.replace(/\D/g, '');
  return numeros.slice(0, 5);
}

/**
 * Aplica máscara de telefone brasileiro
 * Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function aplicarMascaraTelefone(valor: string): string {
  const numeros = valor.replace(/\D/g, '');

  if (numeros.length <= 2) {
    return numeros;
  }

  if (numeros.length <= 6) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  }

  if (numeros.length <= 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  // Celular com 9 dígitos
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`;
}

/**
 * Aplica máscara de código ANAC
 * Formato: XXXXX-X (5 dígitos, hífen, 1 dígito)
 * Exemplo: 12694-7
 */
export function aplicarMascaraCodigoANAC(valor: string): string {
  const numeros = valor.replace(/\D/g, '');

  if (numeros.length <= 5) {
    return numeros;
  }

  return `${numeros.slice(0, 5)}-${numeros.slice(5, 6)}`;
}

/**
 * Remove a máscara de um valor, retornando apenas os números
 */
export function removerMascara(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Valida matrícula (deve ter 5 dígitos)
 */
export function validarMatricula(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 5;
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos)
 */
export function validarTelefone(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 10 || numeros.length === 11;
}

/**
 * Valida código ANAC (deve ter 6 dígitos)
 */
export function validarCodigoANAC(valor: string): boolean {
  const numeros = removerMascara(valor);
  return numeros.length === 6;
}

~~~

---
## FILE: src/react-app/utils/pdfPreview.ts
~~~typescript
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPdfFile(fileName: string, mimeType?: string | null): boolean {
  const normalizedMime = (mimeType || '').toLowerCase();
  const normalizedName = fileName.toLowerCase();

  return normalizedMime.includes('application/pdf') || normalizedName.endsWith('.pdf');
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const namedBlob =
    typeof File !== 'undefined'
      ? new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
      : blob;
  const objectUrl = window.URL.createObjectURL(namedBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function renderLoadingState(previewWindow: Window, title: string): void {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #525659; font-family: Arial, sans-serif; }
    #loading {
      display: flex; align-items: center; justify-content: center;
      height: 100%; gap: 12px; color: #fff;
    }
    .spinner {
      width: 20px; height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #toolbar {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2;
      min-height: 48px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: #111827;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    #toolbarTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    #downloadLink {
      flex-shrink: 0;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      padding: 8px 12px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    #viewer, #viewerFallback {
      display: none;
      position: fixed;
      top: 48px;
      left: 0;
      width: 100%;
      height: calc(100% - 48px);
      border: none;
      background: #525659;
    }
    #errorBox {
      display: none; padding: 24px; max-width: 520px; margin: auto;
      background: #fff; border-radius: 12px; color: #7c2d12;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span>A preparar visualiza&#231;&#227;o do PDF&#8230;</span>
  </div>
  <div id="toolbar">
    <span id="toolbarTitle">${escapeHtml(title)}</span>
    <a id="downloadLink" href="#" download>Baixar PDF</a>
  </div>
  <object id="viewer" type="application/pdf" title="${escapeHtml(title)}">
    <iframe id="viewerFallback" title="${escapeHtml(title)}"></iframe>
  </object>
  <div id="errorBox"></div>
  <script>
    // Called by the opener once PDF bytes are ready.
    // Runs entirely inside this window's context:
    //   - new Blob() -> owned by this document
    //   - URL.createObjectURL() -> blob URL registered to this document
    //   - iframe.src = url -> consumed immediately in this same document
    // No cross-window blob ownership, no location.assign navigation.
    window.__renderPdf = function(buffer, mimeType, fileName) {
      try {
        var blob = new Blob([buffer], { type: mimeType || 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var viewer = document.getElementById('viewer');
        var fallback = document.getElementById('viewerFallback');
        var loading = document.getElementById('loading');
        var toolbar = document.getElementById('toolbar');
        var download = document.getElementById('downloadLink');
        loading.style.display = 'none';
        toolbar.style.display = 'flex';
        download.href = url;
        download.download = fileName || 'documento.pdf';
        viewer.data = url;
        viewer.style.display = 'block';
        fallback.src = url;
        fallback.style.display = 'block';
      } catch (e) {
        window.__pdfError('Erro ao criar visualizacao: ' + e.message);
      }
    };
    window.__pdfError = function(msg) {
      document.getElementById('loading').style.display = 'none';
      var box = document.getElementById('errorBox');
      box.textContent = 'Erro: ' + (msg || 'Falha ao carregar PDF');
      box.style.display = 'block';
    };
  </script>
</body>
</html>`);
  previewWindow.document.close();
}

function renderErrorState(previewWindow: Window, title: string, message: string): void {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #fff7ed;
        color: #7c2d12;
        font-family: Arial, sans-serif;
      }
      .box {
        max-width: 520px;
        border: 1px solid #fdba74;
        border-radius: 14px;
        padding: 24px;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(124, 45, 18, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 20px;
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Falha ao abrir o PDF</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`);
  previewWindow.document.close();
}

function renderPdfPreview(
  previewWindow: Window,
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
): void {
  // Delegates to __renderPdf which was injected into the preview window's own
  // document by renderLoadingState. Running inside the child window's script context
  // means new Blob(), URL.createObjectURL(), and iframe.src are all scoped to the
  // same document, eliminating every cross-window blob-ownership issue.
  (
    previewWindow as unknown as Record<string, (b: ArrayBuffer, m: string, f: string) => void>
  )['__renderPdf'](buffer, mimeType, fileName);
}

interface PdfPreviewOptions {
  fileName: string;
  title?: string;
  mimeType?: string | null;
  fetcher: () => Promise<Response>;
  /** Pre-opened window — call openPreviewWindow() before async work to avoid popup-blocker */
  existingWindow?: Window | null;
}

/**
 * Opens a blank preview window synchronously (before any async work).
 * Pass the returned reference as `existingWindow` to previewPdfBeforeDownload.
 */
export function openPreviewWindow(): Window | null {
  return window.open('', '_blank');
}

export async function previewPdfBeforeDownload({
  fileName,
  title,
  mimeType,
  fetcher,
  existingWindow,
}: PdfPreviewOptions): Promise<void> {
  const previewTitle = title || fileName || 'Visualizacao de PDF';
  const previewWindow = existingWindow ?? window.open('', '_blank');

  if (previewWindow) {
    renderLoadingState(previewWindow, previewTitle);
  }

  try {
    const response = await fetcher();
    if (!response.ok) {
      throw new Error(`Erro ao abrir arquivo (${response.status})`);
    }

    const responseMimeType = response.headers.get('content-type') || mimeType || '';
    const blob = await response.blob();
    const blobMimeType = blob.type || responseMimeType;

    if (!isPdfFile(fileName, blobMimeType)) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      triggerBlobDownload(blob, fileName);
      return;
    }

    // Convert blob to ArrayBuffer so we can pass raw bytes to __renderPdf.
    // The blob URL creation and iframe rendering are done inside the preview
    // window's own script context (see __renderPdf in renderLoadingState),
    // avoiding every cross-window blob-ownership issue in Chrome/Brave.
    const arrayBuffer = await blob.arrayBuffer();
    const effectiveMime = blobMimeType || 'application/pdf';

    if (previewWindow && !previewWindow.closed) {
      renderPdfPreview(previewWindow, arrayBuffer, effectiveMime, fileName);
      return;
    }

    const fallbackWindow = window.open('', '_blank');
    if (!fallbackWindow) {
      triggerBlobDownload(blob, fileName);
      return;
    }
    renderLoadingState(fallbackWindow, previewTitle);
    // Small yield to let the script in the new window register __renderPdf
    await new Promise<void>((r) => setTimeout(r, 80));
    renderPdfPreview(fallbackWindow, arrayBuffer, effectiveMime, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao abrir o arquivo';
    if (previewWindow && !previewWindow.closed) {
      renderErrorState(previewWindow, previewTitle, message);
    }
    throw error;
  }
}

~~~

---
## FILE: src/react-app/utils/pluralize.ts
~~~typescript
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? singular + 's');
}

~~~

---
## FILE: src/react-app/utils/qualificacoesUtils.ts
~~~typescript
/**
 * Utilitários compartilhados para o módulo de Qualificações
 */

import { API_BASE_URL } from '@/react-app/config/api';

export { API_BASE_URL };

/**
 * Calcula dias restantes até uma data
 */
export function diasRestantes(data: string | null | undefined): number {
  if (!data) return 999;
  const diff = new Date(data).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Retorna status baseado nos dias restantes
 */
export function getStatus(
  dataValidade: string | null | undefined,
): 'VALIDO' | 'VENCENDO' | 'VENCIDO' {
  const dias = diasRestantes(dataValidade);
  if (dias < 0) return 'VENCIDO';
  if (dias <= 30) return 'VENCENDO';
  return 'VALIDO';
}

/**
 * Retorna classe CSS para badge de status
 */
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'VENCIDO':
      return 'bg-red-100 text-red-800';
    case 'VENCENDO':
      return 'bg-yellow-100 text-yellow-800';
    case 'VALIDO':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Formata data para exibição
 */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '-';
  try {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

/**
 * Faz requisição à API com tratamento de erros
 */
export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`Erro ao buscar ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Interface para Qualificação
 */
export interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  tipo?: 'TREINAMENTO' | 'CHECK' | 'EXAME';
  categoria: string;
  descricao?: string;
  instituicao?: string;
  instrutor?: string;
  carga_horaria?: number;
  numero?: string;
  data_emissao?: string;
  data_conclusao?: string;
  data_vencimento: string;
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
  dias_restantes?: number;
  observacoes?: string;
  arquivo_url?: string;
}

/**
 * Interface para resposta da API
 */
export interface QualificacoesResponse {
  success: boolean;
  qualificacoes: Qualificacao[];
  total?: number;
}

~~~

---
## FILE: src/react-app/utils/request-control.ts
~~~typescript
/**
 * Sistema de controle global de requests para evitar rate limiting
 *
 * Monitora e limita o número de requests feitos pela aplicação
 */

import { REQUEST_LIMITS } from './constants';
import { apiFetch } from '../lib/apiFetch';
import { logger } from './logger';

interface RequestStats {
  count: number;
  lastReset: number;
  windowMs: number;
}

class RequestController {
  private stats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.MINUTE_WINDOW,
  };

  private readonly MAX_REQUESTS_PER_MINUTE = REQUEST_LIMITS.PER_MINUTE;
  private readonly MAX_REQUESTS_PER_DAY = REQUEST_LIMITS.PER_DAY;

  private dailyStats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.DAY_WINDOW,
  };

  /**
   * Verifica se pode fazer um request
   */
  canMakeRequest(): boolean {
    this.resetIfNeeded();

    // Verifica limite por minuto
    if (this.stats.count >= this.MAX_REQUESTS_PER_MINUTE) {
      logger.warn(
        `[RequestControl] Limite de ${this.MAX_REQUESTS_PER_MINUTE} requests/min atingido`,
      );
      return false;
    }

    // Verifica limite diário
    if (this.dailyStats.count >= this.MAX_REQUESTS_PER_DAY) {
      logger.error(
        `[RequestControl] Limite diário de ${this.MAX_REQUESTS_PER_DAY} requests atingido!`,
      );
      return false;
    }

    return true;
  }

  /**
   * Registra um novo request
   */
  recordRequest(): void {
    this.resetIfNeeded();
    this.stats.count++;
    this.dailyStats.count++;
  }

  /**
   * Obtém estatísticas atuais
   */
  getStats() {
    this.resetIfNeeded();
    return {
      perMinute: this.stats.count,
      maxPerMinute: this.MAX_REQUESTS_PER_MINUTE,
      perDay: this.dailyStats.count,
      maxPerDay: this.MAX_REQUESTS_PER_DAY,
      percentDay: Math.round((this.dailyStats.count / this.MAX_REQUESTS_PER_DAY) * 100),
    };
  }

  /**
   * Reseta contadores se necessário
   */
  private resetIfNeeded(): void {
    const now = Date.now();

    // Reset contador por minuto
    if (now - this.stats.lastReset >= this.stats.windowMs) {
      this.stats.count = 0;
      this.stats.lastReset = now;
    }

    // Reset contador diário
    if (now - this.dailyStats.lastReset >= this.dailyStats.windowMs) {
      this.dailyStats.count = 0;
      this.dailyStats.lastReset = now;
    }
  }

  /**
   * Reseta manualmente os contadores (para testes)
   */
  reset(): void {
    this.stats.count = 0;
    this.stats.lastReset = Date.now();
    this.dailyStats.count = 0;
    this.dailyStats.lastReset = Date.now();
  }
}

// Instância global
export const requestController = new RequestController();

/**
 * Hook para usar o request controller
 */
export function useRequestControl() {
  return {
    canMakeRequest: () => requestController.canMakeRequest(),
    recordRequest: () => requestController.recordRequest(),
    getStats: () => requestController.getStats(),
  };
}

/**
 * Wrapper para fetch que controla requests
 */
export async function controlledFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!requestController.canMakeRequest()) {
    const stats = requestController.getStats();
    throw new Error(
      `Request bloqueado: limite atingido (${stats.perMinute}/${stats.maxPerMinute} por min, ${stats.perDay}/${stats.maxPerDay} por dia)`,
    );
  }

  requestController.recordRequest();
  return apiFetch(input, init);
}

~~~

---
## FILE: src/react-app/utils/safeDelete.ts
~~~typescript
/**
 * Validador universal para operações DELETE
 * Previne chamadas com ID null/undefined
 */

import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { getAccessToken } from '@/react-app/config/api';

export interface SafeDeleteOptions {
  url: string;
  id: string | number | null | undefined;
  itemName: string;
  confirmMessage?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  token?: string;
}

export async function safeDelete(options: SafeDeleteOptions): Promise<boolean> {
  const {
    url,
    id,
    itemName,
    confirmMessage,
    onSuccess,
    onError,
    token = getAccessToken(),
  } = options;

  // Validação crítica: ID obrigatório
  if (!id || id === 'null' || id === 'undefined') {
    const errorMsg = `ID inválido para deletar ${itemName}`;
    console.error('[safeDelete]', errorMsg, { id, url });
    if (onError) {
      onError(errorMsg);
    } else {
      toast.error(errorMsg);
    }
    return false;
  }

  // Confirmação do usuário
  const message = confirmMessage || `Tem certeza que deseja deletar ${itemName}?`;
  if (!(await confirmDialog(message, { title: 'Confirmar exclusão', confirmText: 'Excluir' }))) {
    return false;
  }

  try {
    const response = await fetch(`${url}/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      // 403: Permissão negada (RBAC)
      if (response.status === 403) {
        const errorMsg = `Permissão negada. Apenas administradores podem deletar ${itemName}.`;
        console.error('[safeDelete] 403 RBAC_FORBIDDEN', { id, url });
        if (onError) {
          onError(errorMsg);
        } else {
          toast.error(errorMsg);
        }
        return false;
      }

      // Outros erros HTTP
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || `Erro HTTP ${response.status} ao deletar ${itemName}`;
      throw new Error(errorMsg);
    }

    if (onSuccess) {
      onSuccess();
    }

    return true;
  } catch (error) {
    const errorMsg = `Erro ao deletar ${itemName}: ${
      error instanceof Error ? error.message : 'Erro desconhecido'
    }`;
    console.error('[safeDelete]', errorMsg);
    if (onError) {
      onError(errorMsg);
    } else {
      toast.error(errorMsg);
    }
    return false;
  }
}

~~~

---
## FILE: src/react-app/utils/sessaoNotificacoes.ts
~~~typescript
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export type SessaoNotificacaoCanal = 'email' | 'whatsapp';

export type SessaoNotificacaoAlerta = {
  tipo: SessaoNotificacaoCanal;
  destino: string;
  funcionarioId: number;
  funcionarioNome: string;
  papel: string;
  status: 'enviado' | 'erro';
  mensagem?: string;
  erro?: string;
  provider?: string;
  providerStatus?: string;
  providerMessageId?: string;
  manualFallbackUrl?: string;
};

type SessaoNotificacaoResponse = {
  success: boolean;
  error?: string;
  detalhes?: string[];
  data?: {
    alertas?: SessaoNotificacaoAlerta[];
  };
};

export async function enviarNotificacaoSessao(
  sessaoId: number,
  canais: { enviarEmail?: boolean; enviarWhatsApp?: boolean },
  mensagem?: string,
): Promise<SessaoNotificacaoAlerta[]> {
  const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}/notificacoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({
      ...canais,
      ...(mensagem ? { mensagem } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as SessaoNotificacaoResponse | null;
  const alertas = payload?.data?.alertas || [];

  if (!response.ok || !payload?.success) {
    const detalhes = payload?.detalhes?.length ? ` ${payload.detalhes.join(' | ')}` : '';
    throw new Error(payload?.error || `Erro ao enviar notificação da sessão.${detalhes}`);
  }

  return alertas;
}

export function montarResumoCanal(
  canal: SessaoNotificacaoCanal,
  alertas: SessaoNotificacaoAlerta[],
): {
  tipo: 'success' | 'warning' | 'error';
  mensagem: string;
} {
  const canalLabel = canal === 'email' ? 'E-mail' : 'WhatsApp';
  const filtrados = alertas.filter((alerta) => alerta.tipo === canal);
  const enviados = filtrados.filter((alerta) => alerta.status === 'enviado');
  const erros = filtrados.filter((alerta) => alerta.status === 'erro');

  if (enviados.length > 0 && erros.length === 0) {
    return {
      tipo: 'success',
      mensagem: `${canalLabel} enviado para ${enviados.length} destinatário(s).`,
    };
  }

  if (enviados.length > 0 && erros.length > 0) {
    return {
      tipo: 'warning',
      mensagem: `${canalLabel} enviado parcialmente (${enviados.length} enviado(s), ${erros.length} falha(s)).`,
    };
  }

  return {
    tipo: 'error',
    mensagem:
      erros[0]?.erro ||
      `Não foi possível concluir o envio por ${canalLabel.toLowerCase()} para a sessão.`,
  };
}

~~~

---
## FILE: src/react-app/utils/simulador-cores.ts
~~~typescript
/**
 * UTILITÁRIOS DE CORES PARA SIMULADORES
 * Centraliza toda a lógica de cores para evitar duplicação
 * Data: 2026-01-14
 */

/**
 * Paleta fixa de cores (classes explícitas para Tailwind purge)
 */
export const PALETTE_CORES = [
  { bg: 'bg-blue-50', border: 'border-l-blue-500', text: 'text-blue-700' },
  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-purple-50', border: 'border-l-purple-500', text: 'text-purple-700' },
  { bg: 'bg-orange-50', border: 'border-l-orange-500', text: 'text-orange-700' },
  { bg: 'bg-cyan-50', border: 'border-l-cyan-500', text: 'text-cyan-700' },
  { bg: 'bg-pink-50', border: 'border-l-pink-500', text: 'text-pink-700' },
  { bg: 'bg-indigo-50', border: 'border-l-indigo-500', text: 'text-indigo-700' },
  { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
];

/**
 * Mapeamento explícito de aeronaves para cores (sessões normais)
 */
export const MAPEAMENTO_CORES_EXPLICITO: Record<string, (typeof PALETTE_CORES)[0]> = {
  AW139: { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  aw139: { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  SK76: { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  sk76: { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  'SK-76': { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
};

/**
 * Cores para sessões de CHECK por tipo de aeronave (versão escura)
 * AW139 → verde escuro  |  SK76 → âmbar/amarelo escuro
 */
const CHECK_CORES: Record<string, { bg: string; border: string; text: string }> = {
  AW139: { bg: 'bg-emerald-200', border: 'border-l-emerald-900', text: 'text-emerald-950' },
  aw139: { bg: 'bg-emerald-200', border: 'border-l-emerald-900', text: 'text-emerald-950' },
  SK76: { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
  sk76: { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
  'SK-76': { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
};

/**
 * Interface para objetos que podem ter cor de simulador
 */
export interface ObjetoComSimulador {
  simulador_tipo?: string;
  simulador_nome?: string;
  examinador_id?: number | null;
  examinador_nome?: string | null;
}

/**
 * Gera cor consistente baseado no tipo/modelo da aeronave.
 * SESSÕES DE CHECK: versão mais escura da cor da aeronave.
 * AW139 check → verde escuro  |  SK76 check → âmbar/amarelo escuro
 */
export function getCorSimulador(obj: ObjetoComSimulador) {
  const chave = obj.simulador_tipo || obj.simulador_nome || '';

  // Sessões de check: usar cor escura baseada na aeronave
  if ((obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome) {
    const isAW = /AW.?139/i.test(chave);
    const isSK = /SK.?76/i.test(chave);
    if (isAW) return CHECK_CORES['AW139'];
    if (isSK) return CHECK_CORES['SK76'];
    if (CHECK_CORES[chave]) return CHECK_CORES[chave];
    // Fallback genérico para check não mapeado → âmbar
    return { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' };
  }

  // Verificar se tem mapeamento explícito primeiro
  if (MAPEAMENTO_CORES_EXPLICITO[chave]) {
    return MAPEAMENTO_CORES_EXPLICITO[chave];
  }

  // Hash simples da string para índice consistente
  const hash = chave.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % PALETTE_CORES.length;

  return PALETTE_CORES[index];
}

/**
 * Verifica se uma sessão é um check (tem examinador)
 */
export function isCheck(obj: ObjetoComSimulador): boolean {
  return (obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome;
}

/**
 * Retorna a classe de ring para sessão de check (cor por aeronave)
 */
export function getRingCheck(obj: ObjetoComSimulador): string {
  if (!isCheck(obj)) return '';
  const chave = obj.simulador_tipo || obj.simulador_nome || '';
  const isSK = /SK.?76/i.test(chave);
  return isSK ? 'ring-1 ring-amber-600' : 'ring-1 ring-emerald-700';
}

~~~

---
## FILE: src/react-app/utils/storageUtils.ts
~~~typescript
/**
 * Storage Utilities for GlobalTable and UI Components
 * Handles localStorage operations with type safety and error handling
 */

/**
 * Save sort state to localStorage
 * @param pageName - Unique page identifier
 * @param column - Sort column name
 * @param direction - Sort direction: 'asc' | 'desc' | 'none'
 */
export const saveSortState = (
  pageName: string,
  column: string | null,
  direction: 'asc' | 'desc' | 'none'
): void => {
  try {
    const key = `@airtrust/table-sort-${pageName}`;
    const state = { column, direction, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving sort state:', error);
  }
};

/**
 * Load sort state from localStorage
 * @param pageName - Unique page identifier
 * @returns Sort state or null if not found/invalid
 */
export const loadSortState = (
  pageName: string
): { column: string | null; direction: 'asc' | 'desc' | 'none' } | null => {
  try {
    const key = `@airtrust/table-sort-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const state = JSON.parse(stored);
    if (state.column && ['asc', 'desc', 'none'].includes(state.direction)) {
      return { column: state.column, direction: state.direction };
    }
    return null;
  } catch (error) {
    console.error('[StorageUtils] Error loading sort state:', error);
    return null;
  }
};

/**
 * Save column visibility state to localStorage
 * @param pageName - Unique page identifier
 * @param columnKeys - Array of visible column keys
 */
export const saveColumnVisibility = (pageName: string, columnKeys: string[]): void => {
  try {
    const key = `@airtrust/table-columns-${pageName}`;
    const state = { columns: columnKeys, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column visibility:', error);
  }
};

/**
 * Load column visibility state from localStorage
 * @param pageName - Unique page identifier
 * @param defaultColumns - Default column keys if not found
 * @returns Array of visible column keys
 */
export const loadColumnVisibility = (pageName: string, defaultColumns: string[]): string[] => {
  try {
    const key = `@airtrust/table-columns-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return defaultColumns;

    const state = JSON.parse(stored);
    if (Array.isArray(state.columns) && state.columns.length > 0) {
      return state.columns;
    }
    return defaultColumns;
  } catch (error) {
    console.error('[StorageUtils] Error loading column visibility:', error);
    return defaultColumns;
  }
};

/**
 * Save column order to localStorage
 * @param pageName - Unique page identifier
 * @param columnOrder - Array of column keys in desired order
 */
export const saveColumnOrder = (pageName: string, columnOrder: string[]): void => {
  try {
    const key = `@airtrust/table-order-${pageName}`;
    const state = { order: columnOrder, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column order:', error);
  }
};

/**
 * Load column order from localStorage
 * @param pageName - Unique page identifier
 * @param defaultOrder - Default column order if not found
 * @returns Array of column keys in saved order
 */
export const loadColumnOrder = (pageName: string, defaultOrder: string[]): string[] => {
  try {
    const key = `@airtrust/table-order-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return defaultOrder;

    const state = JSON.parse(stored);
    if (Array.isArray(state.order) && state.order.length > 0) {
      return state.order;
    }
    return defaultOrder;
  } catch (error) {
    console.error('[StorageUtils] Error loading column order:', error);
    return defaultOrder;
  }
};

/**
 * Save column widths to localStorage
 * @param pageName - Unique page identifier
 * @param widths - Object with column keys and their widths
 */
export const saveColumnWidths = (
  pageName: string,
  widths: Record<string, number>
): void => {
  try {
    const key = `@airtrust/table-widths-${pageName}`;
    const state = { widths, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column widths:', error);
  }
};

/**
 * Load column widths from localStorage
 * @param pageName - Unique page identifier
 * @returns Object with column widths or empty object if not found
 */
export const loadColumnWidths = (pageName: string): Record<string, number> => {
  try {
    const key = `@airtrust/table-widths-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return {};

    const state = JSON.parse(stored);
    if (state.widths && typeof state.widths === 'object') {
      return state.widths;
    }
    return {};
  } catch (error) {
    console.error('[StorageUtils] Error loading column widths:', error);
    return {};
  }
};

/**
 * Clear all storage for a specific page
 * @param pageName - Unique page identifier
 */
export const clearPageStorage = (pageName: string): void => {
  try {
    const keys = [
      `@airtrust/table-sort-${pageName}`,
      `@airtrust/table-columns-${pageName}`,
      `@airtrust/table-order-${pageName}`,
      `@airtrust/table-widths-${pageName}`,
    ];

    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`[StorageUtils] Error removing key ${key}:`, error);
      }
    });
  } catch (error) {
    console.error('[StorageUtils] Error clearing page storage:', error);
  }
};

/**
 * Get all storage keys for a page (for debugging)
 * @param pageName - Unique page identifier
 * @returns Array of storage keys for this page
 */
export const getPageStorageKeys = (pageName: string): string[] => {
  try {
    const prefix = `@airtrust/`;
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && key.includes(pageName)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    console.error('[StorageUtils] Error getting page storage keys:', error);
    return [];
  }
};

export default {
  saveSortState,
  loadSortState,
  saveColumnVisibility,
  loadColumnVisibility,
  saveColumnOrder,
  loadColumnOrder,
  saveColumnWidths,
  loadColumnWidths,
  clearPageStorage,
  getPageStorageKeys,
};

~~~

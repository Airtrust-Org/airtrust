// Escalas — query key factory, API helpers, and shared infrastructure
// Split from useEscalasQuery.ts for maintainability.

import { useState, useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { httpClient } from '@/react-app/services/http-client';

export class ApiRequestError extends Error {
  statusCode?: string | number;
  apiCode?: string | number;
  details?: unknown;

  constructor(
    message: string,
    options?: {
      statusCode?: string | number;
      apiCode?: string | number;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = options?.statusCode;
    this.apiCode = options?.apiCode;
    this.details = options?.details;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY KEYS — hierarchical for targeted invalidation
// ─────────────────────────────────────────────────────────────────────────────

export const escalasKeys = {
  all: ['escalas'] as const,
  lists: () => [...escalasKeys.all, 'list'] as const,
  list: (filtros?: Record<string, unknown>) => [...escalasKeys.lists(), filtros] as const,
  details: () => [...escalasKeys.all, 'detail'] as const,
  detail: (id: string) => [...escalasKeys.details(), id] as const,
  calendarios: (id: string) => [...escalasKeys.detail(id), 'calendario'] as const,
  calendario: (id: string, continuo?: boolean) =>
    [...escalasKeys.detail(id), 'calendario', { continuo }] as const,
  conflitos: (id: string) => [...escalasKeys.detail(id), 'conflitos'] as const,
  alocacoes: (id: string, filtros?: Record<string, unknown>) =>
    [...escalasKeys.detail(id), 'alocacoes', filtros] as const,
  cobertura: (id: string, aeronaveId?: string | number | null) =>
    [...escalasKeys.detail(id), 'cobertura', aeronaveId] as const,
  coberturaTripulantes: (id: string) =>
    [...escalasKeys.detail(id), 'cobertura-tripulantes'] as const,
  padroes: () => ['escalas-padroes'] as const,
  pilotos: (
    aeronaveId?: string | number | null,
    escalaId?: string | number | null,
    quinzena?: string | null,
  ) => ['escalas-pilotos', aeronaveId, escalaId, quinzena] as const,
  tripulantesOperacionais: (
    aeronaveId?: string | number | null,
    escalaId?: string | number | null,
    incluirBloqueados?: boolean,
  ) => ['escalas-tripulantes-operacionais', aeronaveId, escalaId, incluirBloqueados] as const,
  aeronaves: () => ['aeronaves'] as const,
  quinzenas: (ano: number) => ['escalas-quinzenas', ano] as const,
  tiposEventoRoot: () => ['escalas-tipos-evento'] as const,
  tiposEvento: (ativo?: 0 | 1 | null) =>
    [...escalasKeys.tiposEventoRoot(), { ativo: ativo ?? null }] as const,
  situacaoTipos: () => ['situacao-tipos'] as const,
  templates: (aeronave?: string | null, quinzena?: number) =>
    ['escalas-templates', aeronave, quinzena] as const,
  templatesAll: () => ['escalas-templates'] as const,
  cmaStatus: (ids: string) => ['escalas-cma', ids] as const,
  disponibilidade: (ids: string, di?: string, df?: string) =>
    ['escalas-disponibilidade', ids, di, df] as const,
  notificacoes: () => ['escalas-notificacoes'] as const,
  preferencias: () => ['escalas-preferencias'] as const,
  funcionarioFerias: (funcionarioId: string) => ['funcionarios', funcionarioId, 'ferias'] as const,
};

export const escalasLookupKeys = {
  pilotos: ['escalas-pilotos'] as const,
  tripulantesOperacionais: ['escalas-tripulantes-operacionais'] as const,
};

export async function refreshEscalaLookupQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: escalasLookupKeys.pilotos }),
    qc.invalidateQueries({ queryKey: escalasLookupKeys.tripulantesOperacionais }),
  ]);

  await Promise.all([
    qc.refetchQueries({ queryKey: escalasLookupKeys.pilotos, type: 'active' }),
    qc.refetchQueries({ queryKey: escalasLookupKeys.tripulantesOperacionais, type: 'active' }),
  ]);
}

export async function refreshEscalasModuleQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: escalasKeys.all }),
    qc.invalidateQueries({ queryKey: escalasKeys.preferencias() }),
    qc.invalidateQueries({ queryKey: escalasKeys.tiposEventoRoot() }),
    qc.invalidateQueries({ queryKey: escalasKeys.templatesAll() }),
    qc.invalidateQueries({ queryKey: ['escalas-quinzenas'] }),
    qc.invalidateQueries({ queryKey: escalasKeys.aeronaves() }),
  ]);

  await Promise.all([
    qc.refetchQueries({ queryKey: escalasKeys.all, type: 'active' }),
    qc.refetchQueries({ queryKey: escalasKeys.preferencias(), type: 'active' }),
    qc.refetchQueries({ queryKey: escalasKeys.tiposEventoRoot(), type: 'active' }),
    qc.refetchQueries({ queryKey: escalasKeys.templatesAll(), type: 'active' }),
    qc.refetchQueries({ queryKey: ['escalas-quinzenas'], type: 'active' }),
    qc.refetchQueries({ queryKey: escalasKeys.aeronaves(), type: 'active' }),
  ]);

  await refreshEscalaLookupQueries(qc);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL FETCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchApi<T>(url: string): Promise<T> {
  const res = await httpClient.get<unknown>(url);

  if (!res.success) {
    if (res.code === 401) {
      localStorage.removeItem('airtrust_token');
      window.location.href = '/login';
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const apiBody = res.data as Record<string, unknown> | undefined;
    throw new Error((apiBody?.error as string) || res.error || 'Erro na requisição');
  }

  const body = res.data as Record<string, unknown>;

  if (body && body.success === false) {
    throw new Error((body.error as string) || 'Erro desconhecido');
  }

  if (body && body.success !== undefined && body.data !== undefined) {
    if (body.pagination || body.stats || body.meta) {
      return body as T;
    }
    return body.data as T;
  }

  return body as T;
}

export async function mutateApi<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  let res;
  switch (method) {
    case 'POST':
      res = await httpClient.post<unknown>(url, body);
      break;
    case 'PUT':
      res = await httpClient.put<unknown>(url, body);
      break;
    case 'PATCH':
      res = await httpClient.patch<unknown>(url, body);
      break;
    case 'DELETE':
      res = await httpClient.delete<unknown>(url);
      break;
  }

  if (!res.success) {
    if (res.code === 401) {
      localStorage.removeItem('airtrust_token');
      window.location.href = '/login';
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const apiBody = res.data as Record<string, unknown> | undefined;
    const details = res.details ?? apiBody;
    const detailsObj =
      details && typeof details === 'object' ? (details as Record<string, unknown>) : null;
    const serverMessage = (apiBody?.error as string) || res.error;
    const fallbackMessage =
      res.code === 403
        ? 'Acesso negado. Verifique suas permissões.'
        : res.code === 409
          ? 'Conflito detectado. A operação não pode ser concluída com os dados atuais.'
          : res.code === 422
            ? 'Dados inválidos. Verifique os campos e tente novamente.'
            : res.code != null && res.code >= 500
              ? 'Erro interno do servidor. Tente novamente em instantes.'
              : 'Erro na requisição';
    throw new ApiRequestError(serverMessage || fallbackMessage, {
      statusCode: res.code,
      apiCode: (detailsObj?.code as string | number | undefined) ?? undefined,
      details,
    });
  }

  const resBody = res.data as Record<string, unknown>;
  if (resBody && resBody.success === false) {
    throw new ApiRequestError((resBody.error as string) || 'Erro desconhecido', {
      statusCode: res.code,
      apiCode: (resBody.code as string | number | undefined) ?? undefined,
      details: resBody,
    });
  }

  return (resBody?.data ?? resBody) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL MUTATION STATE (shared loading/error for backward compat)
// ─────────────────────────────────────────────────────────────────────────────

export function useManualMutation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

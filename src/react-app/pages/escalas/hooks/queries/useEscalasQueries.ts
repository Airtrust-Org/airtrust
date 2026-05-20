// Escalas — all TanStack useQuery hooks (read-only)
// Split from useEscalasQuery.ts for maintainability.

import { useQuery } from '@tanstack/react-query';
import { escalasKeys, fetchApi } from './escalas-infra';
import { normalizeLegacyQuinzenas } from '../../utils/quinzenas';
import type {
  StatusEscala,
  EscalaMensal,
  CalendarioData,
  ConflitosData,
  PadraoEscala,
  PilotosDisponiveisResponse,
  TripulantesOperacionaisResponse,
  EscalaAlocacoesResponse,
  EscalaCoberturaResponse,
  EscalaCoberturaTripulantesResponse,
  SituacaoTipo,
  FuncionarioFeriasItem,
  Aeronave,
  QuinzenaEscala,
  EscalaPreferenciasResponse,
  TipoEventoConfig,
  TemplateTripulacao,
  CMAStatus,
  DisponibilidadeEvento,
  NotificacoesResponse,
} from './escalas-types';

// ─────────────────────────────────────────────────────────────────────────────
// CORE QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export function useEscalasQuery(filtros?: { mes?: number; ano?: number; status?: StatusEscala }) {
  const params = new URLSearchParams();
  if (filtros?.mes) params.set('mes', String(filtros.mes));
  if (filtros?.ano) params.set('ano', String(filtros.ano));
  if (filtros?.status) params.set('status', filtros.status);
  const query = params.toString();
  const url = `/api/escalas${query ? `?${query}` : ''}`;

  const result = useQuery<EscalaMensal[]>({
    queryKey: escalasKeys.list(filtros as Record<string, unknown>),
    queryFn: () => fetchApi<EscalaMensal[]>(url),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useEscalaCalendarioQuery(id: string | null, continuo = false) {
  const params = new URLSearchParams({
    incluir_mes_anterior: continuo ? 'true' : 'false',
    incluir_mes_seguinte: continuo ? 'true' : 'false',
  });
  const url = id ? `/api/escalas/${id}/calendario?${params}` : '';

  const result = useQuery<CalendarioData>({
    queryKey: escalasKeys.calendario(id || '__none__', continuo),
    queryFn: () => fetchApi<CalendarioData>(url),
    enabled: !!id,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useEscalaConflitosQuery(id: string | null) {
  const url = id ? `/api/escalas/${id}/conflitos` : '';

  const result = useQuery<ConflitosData>({
    queryKey: escalasKeys.conflitos(id || '__none__'),
    queryFn: () => fetchApi<ConflitosData>(url),
    enabled: !!id,
    staleTime: 15 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function usePadroesEscalaQuery() {
  const result = useQuery<PadraoEscala[]>({
    queryKey: escalasKeys.padroes(),
    queryFn: () => fetchApi<PadraoEscala[]>('/api/escalas/padroes'),
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREW QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export function usePilotosDisponiveisQuery(
  aeronaveId?: string | number | null,
  escalaId?: string | number | null,
  quinzena?: 'primeira' | 'segunda' | null,
) {
  const params = new URLSearchParams();
  if (aeronaveId !== undefined && aeronaveId !== null && String(aeronaveId) !== '') {
    params.set('aeronave_id', String(aeronaveId));
  }
  if (escalaId) params.set('escala_id', String(escalaId));
  if (quinzena) params.set('quinzena', quinzena);
  params.set('incluir_bloqueados', 'true');
  const q = params.toString() ? `?${params.toString()}` : '';

  const result = useQuery<PilotosDisponiveisResponse>({
    queryKey: escalasKeys.pilotos(aeronaveId, escalaId, quinzena ?? null),
    queryFn: async () => {
      const response = await fetchApi<TripulantesOperacionaisResponse>(
        `/api/escalas/tripulantes-operacionais${q}`,
      );

      return {
        pilotos: response.tripulantes.map((tripulante) => ({
          id: tripulante.funcionario_id,
          nome: tripulante.nome,
          matricula: tripulante.matricula,
          cargo: tripulante.role,
          funcao: tripulante.role,
          is_comandante: /PIC|COMANDANTE/i.test(tripulante.role) ? 1 : 0,
          cma_valido: tripulante.cma_valido,
          cma_validade_fim: tripulante.cma_validade_fim,
          cma_status: !tripulante.cma_validade_fim
            ? 'sem_cma'
            : tripulante.cma_valido
              ? tripulante.cma_dias_restantes !== null && tripulante.cma_dias_restantes <= 30
                ? 'vencendo'
                : 'ok'
              : 'expirado',
          frms_score: tripulante.frms_score,
          frms_status: tripulante.frms_status,
          status_operacional: tripulante.status_operacional,
          pode_ser_alocado: tripulante.pode_ser_alocado,
          habilitacoes: tripulante.habilitacoes,
          simuladores_pendentes: tripulante.simuladores_pendentes,
          ja_alocado: tripulante.ja_alocado_nesta_escala ? 1 : 0,
          quinzena: tripulante.quinzena ?? null,
        })),
        modelo: response.aeronave.modelo,
        total: response.tripulantes.length,
        aviso: response.resumo.sem_habilitacao,
      };
    },
    enabled: !!aeronaveId,
    staleTime: 15 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useTripulantesOperacionaisQuery(
  aeronaveId?: string | number | null,
  escalaId?: string | number | null,
  incluirBloqueados = true,
  funcao?: string | null,
  dataInicio?: string | null,
  dataFim?: string | null,
  quinzena?: 'primeira' | 'segunda' | 'personalizada' | null,
) {
  const params = new URLSearchParams();
  if (aeronaveId) params.set('aeronave_id', String(aeronaveId));
  if (escalaId) params.set('escala_id', String(escalaId));
  if (incluirBloqueados) params.set('incluir_bloqueados', 'true');
  if (funcao) params.set('funcao', funcao);
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);
  if (quinzena) params.set('quinzena', quinzena);

  const url = `/api/escalas/tripulantes-operacionais${params.toString() ? `?${params}` : ''}`;

  const result = useQuery<TripulantesOperacionaisResponse>({
    queryKey: [
      ...escalasKeys.tripulantesOperacionais(aeronaveId, escalaId, incluirBloqueados),
      funcao,
      dataInicio,
      dataFim,
      quinzena,
    ],
    queryFn: () => fetchApi<TripulantesOperacionaisResponse>(url),
    enabled: aeronaveId !== undefined && aeronaveId !== null && String(aeronaveId) !== '',
    staleTime: 15 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALOCAÇÕES & COBERTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useEscalaAlocacoesQuery(
  escalaId: string | null,
  filtros?: { aeronave_id?: string | number | null; funcao?: string | null; data?: string | null },
) {
  const params = new URLSearchParams();
  if (filtros?.aeronave_id) params.set('aeronave_id', String(filtros.aeronave_id));
  if (filtros?.funcao) params.set('funcao', filtros.funcao);
  if (filtros?.data) params.set('data', filtros.data);

  const query = params.toString();
  const url = escalaId ? `/api/escalas/${escalaId}/alocacoes${query ? `?${query}` : ''}` : '';

  const result = useQuery<EscalaAlocacoesResponse>({
    queryKey: escalasKeys.alocacoes(escalaId || '__none__', filtros as Record<string, unknown>),
    queryFn: () => fetchApi<EscalaAlocacoesResponse>(url),
    enabled: !!escalaId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useEscalaCoberturaQuery(
  escalaId: string | null,
  aeronaveId?: string | number | null,
) {
  const params = new URLSearchParams();
  if (aeronaveId) params.set('aeronave_id', String(aeronaveId));
  const url = escalaId
    ? `/api/escalas/${escalaId}/cobertura${params.toString() ? `?${params}` : ''}`
    : '';

  const result = useQuery<EscalaCoberturaResponse>({
    queryKey: escalasKeys.cobertura(escalaId || '__none__', aeronaveId),
    queryFn: () => fetchApi<EscalaCoberturaResponse>(url),
    enabled: !!escalaId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useEscalaCoberturaTriplantesQuery(escalaId: string | null) {
  const url = escalaId ? `/api/escalas/${escalaId}/cobertura/tripulantes` : '';

  const result = useQuery<EscalaCoberturaTripulantesResponse>({
    queryKey: escalasKeys.coberturaTripulantes(escalaId || '__none__'),
    queryFn: () => fetchApi<EscalaCoberturaTripulantesResponse>(url),
    enabled: !!escalaId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export const useEscalaCoberturaTripulantesQuery = useEscalaCoberturaTriplantesQuery;

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE DATA (situacao, ferias, aeronaves, quinzenas, preferencias)
// ─────────────────────────────────────────────────────────────────────────────

export function useSituacaoTiposQuery() {
  const result = useQuery<SituacaoTipo[]>({
    queryKey: escalasKeys.situacaoTipos(),
    queryFn: () => fetchApi<SituacaoTipo[]>('/api/escalas/situacao-tipos'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useFuncionarioFeriasQuery(funcionarioId?: string | null) {
  const result = useQuery<FuncionarioFeriasItem[]>({
    queryKey: escalasKeys.funcionarioFerias(funcionarioId || '__none__'),
    queryFn: () => fetchApi<FuncionarioFeriasItem[]>(`/api/funcionarios/${funcionarioId}/ferias`),
    enabled: !!funcionarioId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useAeronavesQuery() {
  const result = useQuery<Aeronave[]>({
    queryKey: escalasKeys.aeronaves(),
    queryFn: () => fetchApi<Aeronave[]>('/api/aeronaves?somente_ativas=1'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useQuinzenasQuery(ano: number) {
  const result = useQuery<QuinzenaEscala[]>({
    queryKey: escalasKeys.quinzenas(ano),
    queryFn: () => fetchApi<QuinzenaEscala[]>(`/api/escalas/quinzenas?ano=${ano}`),
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 60 * 1000,
  });

  return {
    data: normalizeLegacyQuinzenas(result.data),
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useEscalaPreferenciasQuery() {
  const result = useQuery<EscalaPreferenciasResponse>({
    queryKey: escalasKeys.preferencias(),
    queryFn: () => fetchApi<EscalaPreferenciasResponse>('/api/escalas/preferencias'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG QUERIES (tipos evento, templates, CMA, disponibilidade)
// ─────────────────────────────────────────────────────────────────────────────

export function useTiposEventoConfigQuery(options?: { ativoOnly?: boolean }) {
  const ativo = options?.ativoOnly ? 1 : null;
  const query = options?.ativoOnly
    ? '/api/escalas/tipos-evento-config?ativo=1'
    : '/api/escalas/tipos-evento-config';
  const result = useQuery<TipoEventoConfig[]>({
    queryKey: escalasKeys.tiposEvento(ativo),
    queryFn: () => fetchApi<TipoEventoConfig[]>(query),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return {
    data: result.data ?? [],
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useTemplatesQuery(aeronave?: string | null, quinzena?: number) {
  const params = new URLSearchParams();
  if (aeronave) params.set('aeronave', aeronave);
  if (quinzena !== undefined) params.set('quinzena', String(quinzena));
  const q = params.toString();
  const url = `/api/escalas/templates${q ? `?${q}` : ''}`;

  const result = useQuery<TemplateTripulacao[]>({
    queryKey: escalasKeys.templates(aeronave, quinzena),
    queryFn: () => fetchApi<TemplateTripulacao[]>(url),
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 60 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useCMAStatusQuery(funcionarioIds: string[]) {
  const ids = funcionarioIds.filter(Boolean).slice(0, 50).join(',');

  const result = useQuery<CMAStatus[]>({
    queryKey: escalasKeys.cmaStatus(ids),
    queryFn: () =>
      fetchApi<CMAStatus[]>(`/api/escalas/funcionarios/cma-status?ids=${encodeURIComponent(ids)}`),
    enabled: !!ids,
    staleTime: 2 * 60 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

export function useDisponibilidadeQuery(
  funcionarioIds: string[],
  dataInicio?: string,
  dataFim?: string,
) {
  const ids = funcionarioIds.filter(Boolean).join(',');
  const enabled = !!ids && !!dataInicio && !!dataFim;
  const q = enabled
    ? `?funcionarios=${encodeURIComponent(ids)}&data_inicio=${dataInicio}&data_fim=${dataFim}`
    : '';
  const url = enabled ? `/api/escalas/disponibilidade${q}` : '';

  const result = useQuery<DisponibilidadeEvento[]>({
    queryKey: escalasKeys.disponibilidade(ids, dataInicio, dataFim),
    queryFn: () => fetchApi<DisponibilidadeEvento[]>(url),
    enabled,
    staleTime: 15 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

export function useNotificacoesEscalaQuery() {
  const result = useQuery<NotificacoesResponse>({
    queryKey: escalasKeys.notificacoes(),
    queryFn: () => fetchApi<NotificacoesResponse>('/api/escalas/notificacoes'),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  return {
    data: result.data ?? null,
    loading: result.isLoading,
    isLoading: result.isLoading,
    error: result.error?.message ?? null,
    refetch: result.refetch,
  };
}

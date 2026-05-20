// Escalas — all TanStack useMutation hooks (write operations)
// Split from useEscalasQuery.ts for maintainability.

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  escalasKeys,
  refreshEscalaLookupQueries,
  refreshEscalasModuleQueries,
  mutateApi,
  useManualMutation,
} from './escalas-infra';
import { normalizeTipoCodigo } from '../../constants/tiposEvento';
import type {
  StatusEscala,
  TipoEvento,
  EscalaAlocacao,
  EscalaPreferenciasResponse,
  NovaSituacaoInput,
  TipoEventoConfig,
  TemplateTripulacao,
} from './escalas-types';

// ─────────────────────────────────────────────────────────────────────────────
// CORE MUTATIONS (CRUD escalas, tripulações, eventos, alocações)
// ─────────────────────────────────────────────────────────────────────────────

export function useEscalaMutations() {
  const qc = useQueryClient();
  const { execute, loading, error } = useManualMutation();

  const refreshEscalaData = useCallback(
    async (
      escalaId: string,
      options?: { includeLists?: boolean; includeNotifications?: boolean },
    ) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: escalasKeys.detail(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) }),
      ]);

      await Promise.all([
        qc.refetchQueries({ queryKey: escalasKeys.detail(escalaId), type: 'active' }),
        qc.refetchQueries({ queryKey: escalasKeys.calendarios(escalaId), type: 'active' }),
        qc.refetchQueries({ queryKey: escalasKeys.conflitos(escalaId), type: 'active' }),
        qc.refetchQueries({ queryKey: escalasKeys.alocacoes(escalaId), type: 'active' }),
        qc.refetchQueries({ queryKey: escalasKeys.cobertura(escalaId), type: 'active' }),
        qc.refetchQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId), type: 'active' }),
      ]);

      if (options?.includeLists) {
        await qc.invalidateQueries({ queryKey: escalasKeys.lists() });
        await qc.refetchQueries({ queryKey: escalasKeys.lists(), type: 'active' });
      }

      if (options?.includeNotifications) {
        await qc.invalidateQueries({ queryKey: escalasKeys.notificacoes() });
        await qc.refetchQueries({ queryKey: escalasKeys.notificacoes(), type: 'active' });
      }

      await refreshEscalaLookupQueries(qc);
    },
    [qc],
  );

  const normalizeTipoEvento = (tipoEvento: string | undefined): TipoEvento | undefined => {
    if (!tipoEvento) return undefined;
    return normalizeTipoCodigo(tipoEvento) ?? (tipoEvento.trim().toLowerCase() as TipoEvento);
  };

  const criarEscala = useCallback(
    (body: { mes: number; ano: number; titulo?: string; observacoes?: string }) =>
      execute(async () => {
        const result = await mutateApi('/api/escalas', 'POST', body);
        await qc.invalidateQueries({ queryKey: escalasKeys.lists() });
        return result;
      }),
    [execute, qc],
  );

  const alterarStatus = useCallback(
    (id: string, status: StatusEscala, justificativa?: string, _ano?: number) =>
      execute(async () => {
        void _ano;
        const result = await mutateApi(`/api/escalas/${id}/status`, 'PATCH', {
          status,
          justificativa,
        });
        await refreshEscalaData(id, { includeLists: true, includeNotifications: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const adicionarTripulacao = useCallback(
    (
      escalaId: string,
      body: {
        pic_id: string;
        sic_id?: string;
        data_inicio: string;
        data_fim: string;
        padrao_escala_id?: string;
        aeronave?: string;
        base?: string;
        observacoes?: string;
      },
    ) =>
      execute(async () => {
        const result = await mutateApi<{ id: string; eventos_gerados?: number }>(
          `/api/escalas/${escalaId}/tripulacoes`,
          'POST',
          body,
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const atualizarTripulacao = useCallback(
    (
      escalaId: string,
      tripulacaoId: string,
      body: {
        pic_id?: string;
        sic_id?: string | null;
        data_inicio?: string;
        data_fim?: string;
        padrao_escala_id?: string | null;
        aeronave?: string | null;
        base?: string | null;
        observacoes?: string | null;
      },
    ) =>
      execute(async () => {
        const result = await mutateApi(
          `/api/escalas/${escalaId}/tripulacoes/${tripulacaoId}`,
          'PUT',
          body,
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const removerTripulacao = useCallback(
    (escalaId: string, tripulacaoId: string) =>
      execute(async () => {
        const result = await mutateApi(
          `/api/escalas/${escalaId}/tripulacoes/${tripulacaoId}`,
          'DELETE',
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const regenerarEventosTripulacao = useCallback(
    (escalaId: string, tripulacaoId: string) =>
      execute(async () => {
        const result = await mutateApi(
          `/api/escalas/${escalaId}/tripulacoes/${tripulacaoId}/regenerar-eventos`,
          'POST',
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const adicionarEvento = useCallback(
    (
      escalaId: string,
      body: {
        funcionario_id: string;
        tipo_evento: TipoEvento;
        data_inicio: string;
        data_fim: string;
        turno?: string;
        local?: string;
        aeronave?: string;
        observacoes?: string;
      },
    ) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/${escalaId}/eventos`, 'POST', {
          ...body,
          tipo_evento: normalizeTipoEvento(body.tipo_evento) ?? body.tipo_evento,
        });
        // includeLists: true so the escala card in the list view also reflects new events
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const removerEvento = useCallback(
    (escalaId: string, eventoId: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/${escalaId}/eventos/${eventoId}`, 'DELETE');
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const atualizarEvento = useCallback(
    (
      escalaId: string,
      eventoId: string,
      body: Partial<{
        tipo_evento: TipoEvento;
        data_inicio: string;
        data_fim: string;
        turno: string;
        local: string;
        observacoes: string;
        status: string;
      }>,
    ) =>
      execute(async () => {
        const result = await mutateApi(
          `/api/escalas/${escalaId}/eventos/${eventoId}`,
          'PUT',
          body.tipo_evento
            ? {
                ...body,
                tipo_evento: normalizeTipoEvento(body.tipo_evento),
              }
            : body,
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const adicionarAlocacaoOperacional = useCallback(
    (
      escalaId: string,
      body: {
        funcionario_id: string;
        aeronave_id?: number | null;
        funcao: 'PIC' | 'SIC' | 'PIC_CHK' | 'SIC_CHK' | 'INSTRUTOR' | 'FLEX';
        data_inicio: string;
        data_fim: string;
        quinzena_id?: number | null;
        padrao_escala_id?: string | null;
        base?: string | null;
        observacoes?: string | null;
        cma_override?: 0 | 1;
        conflito_override?: 0 | 1;
        modelo_aeronave?: string | null;
      },
    ) =>
      execute(async () => {
        const result = await mutateApi<{
          alocacao: EscalaAlocacao | null;
          eventos_gerados: number;
          folga_auto_id: string | null;
          alertas: Array<{ tipo: string; detalhe: string }>;
        }>(`/api/escalas/${escalaId}/alocacoes`, 'POST', body);
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const salvarLoteAlocacoesOperacionais = useCallback(
    (
      escalaId: string,
      body: {
        itens: Array<{
          slot_key?: string | null;
          alocacao_id?: string | null;
          funcionario_id: string;
          aeronave_id?: number | null;
          modelo_aeronave?: string | null;
          funcao: 'PIC' | 'SIC' | 'PIC_CHK' | 'SIC_CHK' | 'INSTRUTOR' | 'FLEX';
          data_inicio: string;
          data_fim: string;
          quinzena_id?: number | null;
          padrao_escala_id?: string | null;
          base?: string | null;
          observacoes?: string | null;
          cma_override?: 0 | 1;
          conflito_override?: 0 | 1;
        }>;
      },
    ) =>
      execute(async () => {
        const result = await mutateApi<{
          alocacoes: EscalaAlocacao[];
          eventos_gerados: number;
          alertas: Array<{ tipo: string; detalhe: string }>;
          total: number;
        }>(`/api/escalas/${escalaId}/alocacoes/lote`, 'POST', body);
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const atualizarAlocacaoOperacional = useCallback(
    (
      escalaId: string,
      alocacaoId: string,
      body: Partial<{
        funcionario_id: string;
        funcao: 'PIC' | 'SIC' | 'PIC_CHK' | 'SIC_CHK' | 'INSTRUTOR' | 'FLEX';
        data_inicio: string;
        data_fim: string;
        status: 'planejado' | 'confirmado' | 'cancelado';
        base: string | null;
        observacoes: string | null;
        quinzena_id: number | null;
        padrao_escala_id: string | null;
        conflito_override: 0 | 1;
      }>,
    ) =>
      execute(async () => {
        const result = await mutateApi<EscalaAlocacao | null>(
          `/api/escalas/${escalaId}/alocacoes/${alocacaoId}`,
          'PUT',
          body,
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const removerAlocacaoOperacional = useCallback(
    (escalaId: string, alocacaoId: string) =>
      execute(async () => {
        const result = await mutateApi(
          `/api/escalas/${escalaId}/alocacoes/${alocacaoId}`,
          'DELETE',
        );
        await refreshEscalaData(escalaId, { includeLists: true });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const recalcularCoberturaOperacional = useCallback(
    (escalaId: string, aeronaveId?: string | number | null) =>
      execute(async () => {
        const query = aeronaveId ? `?aeronave_id=${encodeURIComponent(String(aeronaveId))}` : '';
        const result = await mutateApi<{
          message: string;
          aeronaves_processadas?: number;
          total_dias_calculados?: number;
          gaps_detectados?: number;
        }>(`/api/escalas/${escalaId}/cobertura/recalcular${query}`, 'POST');
        await refreshEscalaData(escalaId, { includeLists: false });
        return result;
      }),
    [execute, refreshEscalaData],
  );

  const deletarEscala = useCallback(
    (escalaId: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/${escalaId}`, 'DELETE');
        await qc.invalidateQueries({ queryKey: escalasKeys.lists() });
        return result;
      }),
    [execute, qc],
  );

  return {
    criarEscala,
    alterarStatus,
    adicionarTripulacao,
    atualizarTripulacao,
    removerTripulacao,
    regenerarEventosTripulacao,
    adicionarEvento,
    removerEvento,
    atualizarEvento,
    adicionarAlocacaoOperacional,
    salvarLoteAlocacoesOperacionais,
    atualizarAlocacaoOperacional,
    removerAlocacaoOperacional,
    recalcularCoberturaOperacional,
    deletarEscala,
    loading,
    error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function useAdicionarSituacaoMutation(escalaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NovaSituacaoInput) =>
      mutateApi<EscalaAlocacao | null>(`/api/escalas/${escalaId}/situacoes`, 'POST', body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.lists() }),
      ]);
    },
  });
}

export function useAtualizarSituacaoMutation(escalaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ situacaoId, body }: { situacaoId: string; body: Partial<NovaSituacaoInput> }) =>
      mutateApi<EscalaAlocacao | null>(
        `/api/escalas/${escalaId}/situacoes/${situacaoId}`,
        'PUT',
        body,
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.lists() }),
      ]);
    },
  });
}

export function useRemoverSituacaoMutation(escalaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (situacaoId: string) =>
      mutateApi(`/api/escalas/${escalaId}/situacoes/${situacaoId}`, 'DELETE'),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
        qc.invalidateQueries({ queryKey: escalasKeys.lists() }),
      ]);
    },
  });
}

export function useRegistrarFuncionarioFeriasMutation(funcionarioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      data_inicio: string;
      data_fim: string;
      tipo: string;
      observacoes?: string | null;
    }) => mutateApi(`/api/funcionarios/${funcionarioId}/ferias`, 'POST', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: escalasKeys.funcionarioFerias(funcionarioId) });
      await qc.invalidateQueries({ queryKey: escalasKeys.all });
    },
  });
}

export function useRemoverFuncionarioFeriasMutation(funcionarioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feriasId: string) =>
      mutateApi(`/api/funcionarios/${funcionarioId}/ferias/${feriasId}`, 'DELETE'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: escalasKeys.funcionarioFerias(funcionarioId) });
      await qc.invalidateQueries({ queryKey: escalasKeys.all });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFERÊNCIAS MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function useEscalaPreferenciasMutations() {
  const qc = useQueryClient();
  const { execute, loading, error } = useManualMutation();

  const salvarExibirNome = useCallback(
    (valor: 'completo' | 'guerra') =>
      execute(async () => {
        const result = await mutateApi<EscalaPreferenciasResponse>(
          '/api/escalas/preferencias/exibir-nome',
          'PUT',
          { valor },
        );
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const salvarPreferencias = useCallback(
    (body: Partial<EscalaPreferenciasResponse>) =>
      execute(async () => {
        const result = await mutateApi<EscalaPreferenciasResponse>(
          '/api/escalas/preferencias',
          'PUT',
          body,
        );
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  return { salvarExibirNome, salvarPreferencias, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE EVENTO CONFIG MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function useTiposEventoConfigMutations() {
  const qc = useQueryClient();
  const { execute, loading, error } = useManualMutation();

  const criar = useCallback(
    (body: Omit<TipoEventoConfig, 'id'>) =>
      execute(async () => {
        const result = await mutateApi('/api/escalas/tipos-evento-config', 'POST', body);
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const atualizar = useCallback(
    (id: string, body: Partial<Omit<TipoEventoConfig, 'id'>>) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/tipos-evento-config/${id}`, 'PUT', body);
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const remover = useCallback(
    (id: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/tipos-evento-config/${id}`, 'DELETE');
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  return { criar, atualizar, remover, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES DE TRIPULAÇÃO MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function useTemplatesMutations() {
  const qc = useQueryClient();
  const { execute, loading, error } = useManualMutation();

  const criar = useCallback(
    (body: Omit<TemplateTripulacao, 'id' | 'pic_nome' | 'sic_nome' | 'usos'>) =>
      execute(async () => {
        const result = await mutateApi('/api/escalas/templates', 'POST', body);
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const atualizar = useCallback(
    (
      id: string,
      body: Partial<Omit<TemplateTripulacao, 'id' | 'pic_nome' | 'sic_nome' | 'usos'>>,
    ) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/templates/${id}`, 'PUT', body);
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const remover = useCallback(
    (id: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/templates/${id}`, 'DELETE');
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  const registrarUso = useCallback(
    (id: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/templates/${id}/usar`, 'POST', {});
        await refreshEscalasModuleQueries(qc);
        return result;
      }),
    [execute, qc],
  );

  return { criar, atualizar, remover, registrarUso, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function useNotificacoesMutations() {
  const qc = useQueryClient();
  const { execute, loading, error } = useManualMutation();

  const marcarLida = useCallback(
    (id: string) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/notificacoes/${id}/lida`, 'PATCH', {});
        await qc.invalidateQueries({ queryKey: escalasKeys.notificacoes() });
        return result;
      }),
    [execute, qc],
  );

  const marcarTodasLidas = useCallback(
    () =>
      execute(async () => {
        const result = await mutateApi('/api/escalas/notificacoes/marcar-todas-lidas', 'PATCH', {});
        await qc.invalidateQueries({ queryKey: escalasKeys.notificacoes() });
        return result;
      }),
    [execute, qc],
  );

  const notificarTripulantes = useCallback(
    (escalaId: string, body: { mensagem?: string; excluidos?: string[] }) =>
      execute(async () => {
        const result = await mutateApi(`/api/escalas/${escalaId}/notificar`, 'POST', body);
        await qc.invalidateQueries({ queryKey: escalasKeys.notificacoes() });
        return result;
      }),
    [execute, qc],
  );

  return { marcarLida, marcarTodasLidas, notificarTripulantes, loading, error };
}

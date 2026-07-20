import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/react-app/services/apiClient';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

// ---- Status types ----

export type CvFlightStatus =
  | 'planejado'
  | 'liberado_operacionalmente'
  | 'em_andamento'
  | 'pousado'
  | 'concluido_operacionalmente'
  | 'cancelado'
  | 'alternado_divergido';

export type CvRdvStatus = 'rascunho' | 'preenchimento_finalizado' | 'cancelado';

export type CvRdvWorkflowStatus =
  | 'rascunho'
  | 'enviado'
  | 'em_revisao'
  | 'aprovado_coordenacao'
  | 'finalizado'
  | 'cancelado';

// ---- Entity types ----

export interface CvVoo {
  id: number;
  empresa_id: number;
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: CvFlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CvRdv {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
  status: CvRdvStatus;
  responsavel_preenchimento_id: number | null;
  preenchido_em: string | null;
  finalizado_operacionalmente_por: number | null;
  finalizado_operacionalmente_em: string | null;
  workflow_status: CvRdvWorkflowStatus;
  versao: number;
  enviado_por: number | null;
  enviado_em: string | null;
  revisao_iniciada_por: number | null;
  revisao_iniciada_em: string | null;
  aprovado_coordenacao_por: number | null;
  aprovado_coordenacao_em: string | null;
  finalizado_workflow_em: string | null;
  reaberto_por: number | null;
  reaberto_em: string | null;
  motivo_devolucao: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface CvRdvAlerta {
  id: number;
  tipo: string;
  severidade: 'INFORMATIVO' | 'ATENCAO' | 'IMPEDE_ENVIO' | 'IMPEDE_APROVACAO';
  mensagem: string;
  regra: string;
}

export interface CvRdvRevisao {
  id: number;
  versao: number;
  entidade: string;
  registro_id: number | null;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario_id: number | null;
  justificativa: string | null;
  estado_anterior: string | null;
  estado_novo: string | null;
  created_at: string;
}

export interface CvRdvAprovacao {
  id: number;
  versao: number;
  tipo_aprovacao: 'COORDENACAO' | 'CONTRATANTE' | 'COMERCIAL';
  status: string;
  usuario_id: number | null;
  funcionario_id: number | null;
  observacao: string | null;
  justificativa: string | null;
  created_at: string;
}

export interface CvRdvFilaItem {
  id: number;
  voo_id: number;
  numero: string;
  data_voo: string;
  status: CvRdvStatus;
  workflow_status: CvRdvWorkflowStatus;
  versao: number;
  responsavel_preenchimento_id: number | null;
  enviado_em: string | null;
  aprovado_coordenacao_em: string | null;
  finalizado_workflow_em: string | null;
  motivo_devolucao: string | null;
  prefixo: string;
  aeronave_id: number | null;
  data_programacao: string;
}

export interface CvTripulante {
  id: number;
  voo_id: number;
  etapa_id: number | null;
  funcionario_id: number;
  funcao: 'PIC' | 'SIC' | 'COM' | 'MEC' | 'OUTRO';
  horario_apresentacao: string | null;
  horario_dispensa: string | null;
  observacoes: string | null;
  funcionario_nome: string | null;
  funcionario_codigo_anac: string | null;
}

export interface CvAbastecimento {
  id: number;
  voo_id: number;
  etapa_id: number | null;
  fornecedor: string | null;
  localidade: string | null;
  combustivel_solicitado: number | null;
  unidade: string;
  combustivel_abastecido: number | null;
  numero_ce: string | null;
  anexo_r2_key: string | null;
  responsavel_id: number | null;
  data_hora: string;
  observacoes: string | null;
}

export interface CvAeroporto {
  id: number;
  codigo: string;
  codigo_icao: string;
  codigo_iata: string;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvTipoVoo {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvNaturezaVoo {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvDashboardTotais {
  voos: number;
  voos_planejados: number;
  voos_liberados_operacionalmente: number;
  voos_em_andamento: number;
  voos_pousados: number;
  voos_concluidos_operacionalmente: number;
  voos_cancelados: number;
  voos_alternados_divergidos: number;
  rdvs_rascunho: number;
  rdvs_preenchimento_finalizado: number;
  voos_sem_rdv: number;
}

export interface CvDashboard {
  uso_operacional_interno: boolean;
  nao_regulado: boolean;
  periodo: { data_inicio: string; data_fim: string };
  totais: CvDashboardTotais;
  voos_por_status: Record<string, number>;
  proximos_voos: CvVoo[];
  alertas_operacionais: {
    voos_sem_tripulacao: number;
    voos_sem_aeronave: number;
    voos_concluidos_sem_rdv: number;
  };
}

export interface CvPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RdvInput {
  numero?: string;
  data_voo?: string;
  horario_decolagem_real?: string | null;
  horario_pouso_real?: string | null;
  horas_voadas?: number | null;
  numero_pousos?: number | null;
  ciclos?: number | null;
  combustivel_decolagem?: number | null;
  combustivel_pouso?: number | null;
  combustivel_consumo?: number | null;
  pob?: number | null;
  carga_kg?: number | null;
  ocorrencias?: string | null;
  divergencias?: string | null;
}

// ---- Internal helper ----
// http-client wraps backend JSON into response.data.
// Backend returns { success, data: T, ... } — so response.data IS the full backend body.

type HttpOk = { success: boolean; data?: unknown; error?: string };

function extractPayload<T>(response: unknown, fallback: T): T {
  const r = response as HttpOk;
  if (!r.success) throw new Error(r.error || 'Erro de API');
  const body = r.data as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && 'data' in body) return body.data as T;
  return (r.data as T) ?? fallback;
}

function extractBody<T>(response: unknown): T {
  const r = response as HttpOk;
  if (!r.success) throw new Error(r.error || 'Erro de API');
  return r.data as T;
}

const API = '/controle-voos';

// ---- Query hooks ----

export function useControleVoosDashboard(data?: string) {
  return useQuery({
    queryKey: ['cv-dashboard', data ?? 'today'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (data) params.set('data', data);
      const response = await apiClient.get<unknown>(`${API}/dashboard?${params.toString()}`);
      return extractPayload<CvDashboard>(response, {} as CvDashboard);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosVoos(filtros?: {
  status?: CvFlightStatus;
  data_inicio?: string;
  data_fim?: string;
  aeronave_id?: number;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['cv-voos', filtros],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros?.status) params.set('status', filtros.status);
      if (filtros?.data_inicio) params.set('data_inicio', filtros.data_inicio);
      if (filtros?.data_fim) params.set('data_fim', filtros.data_fim);
      if (filtros?.aeronave_id) params.set('aeronave_id', String(filtros.aeronave_id));
      if (filtros?.page) params.set('page', String(filtros.page));
      if (filtros?.limit) params.set('limit', String(filtros.limit));
      const qs = params.toString();
      const response = await apiClient.get<unknown>(`${API}/voos${qs ? `?${qs}` : ''}`);
      const body = extractBody<{ success: boolean; data: CvVoo[]; pagination: CvPagination }>(response);
      return { voos: body.data || [], pagination: body.pagination };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosVoo(id: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-voo', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${id}`);
      return extractPayload<CvVoo>(response, null as unknown as CvVoo);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosRdv(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-rdv', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/rdv`);
      return extractPayload<CvRdv | null>(response, null);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosAeroportos() {
  return useQuery({
    queryKey: ['cv-catalogo-aeroportos'],
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/catalogos/aeroportos`);
      return extractPayload<CvAeroporto[]>(response, []);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

// ---- Mutation hooks ----

export function useSalvarRdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vooId, dados }: { vooId: string | number; dados: RdvInput }) => {
      const response = await apiClient.put<unknown>(`${API}/voos/${vooId}/rdv`, dados);
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-rdv', vars.vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv', String(vars.vooId)] });
      void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
    },
  });
}

export function useFinalizarPreenchimentoRdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vooId: string | number) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/rdv/finalizar-preenchimento`, {});
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vooId) => {
      void qc.invalidateQueries({ queryKey: ['cv-rdv', vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv', String(vooId)] });
      void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
    },
  });
}

// ===========================================================================
// Fluxo Piloto -> Coordenação (workflow do RDV)
// ===========================================================================

function invalidateRdvQueries(qc: ReturnType<typeof useQueryClient>, vooId: string | number) {
  void qc.invalidateQueries({ queryKey: ['cv-rdv', vooId] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv', String(vooId)] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-alertas', vooId] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-alertas', String(vooId)] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-revisoes', vooId] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-revisoes', String(vooId)] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-aprovacoes', vooId] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-aprovacoes', String(vooId)] });
  void qc.invalidateQueries({ queryKey: ['cv-rdv-fila'] });
  void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
}

export function useMeusVoos() {
  return useQuery({
    queryKey: ['cv-meus-voos'],
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/meus`);
      return extractPayload<CvVoo[]>(response, []);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useRdvAlertas(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-rdv-alertas', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/rdv/alertas`);
      return extractPayload<CvRdvAlerta[]>(response, []);
    },
    staleTime: 10_000,
    retry: 1,
  });
}

export function useRdvRevisoes(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-rdv-revisoes', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/rdv/revisoes`);
      return extractPayload<CvRdvRevisao[]>(response, []);
    },
    staleTime: 10_000,
    retry: 1,
  });
}

export function useRdvAprovacoes(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-rdv-aprovacoes', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/rdv/aprovacoes`);
      return extractPayload<CvRdvAprovacao[]>(response, []);
    },
    staleTime: 10_000,
    retry: 1,
  });
}

export function useRdvFila(filtros?: {
  status?: CvRdvWorkflowStatus;
  data_inicio?: string;
  data_fim?: string;
  aeronave_id?: number;
  piloto_funcionario_id?: number;
}) {
  return useQuery({
    queryKey: ['cv-rdv-fila', filtros],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros?.status) params.set('status', filtros.status);
      if (filtros?.data_inicio) params.set('data_inicio', filtros.data_inicio);
      if (filtros?.data_fim) params.set('data_fim', filtros.data_fim);
      if (filtros?.aeronave_id) params.set('aeronave_id', String(filtros.aeronave_id));
      if (filtros?.piloto_funcionario_id) params.set('piloto_funcionario_id', String(filtros.piloto_funcionario_id));
      const qs = params.toString();
      const response = await apiClient.get<unknown>(`${API}/rdv/fila${qs ? `?${qs}` : ''}`);
      return extractPayload<CvRdvFilaItem[]>(response, []);
    },
    staleTime: 15_000,
    retry: 1,
  });
}

function useRdvWorkflowAction<TBody extends Record<string, unknown> = Record<string, unknown>>(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vooId, body }: { vooId: string | number; body?: TBody }) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/rdv/${action}`, body || {});
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vars) => invalidateRdvQueries(qc, vars.vooId),
  });
}

export function useEnviarRdv() {
  return useRdvWorkflowAction<{ versao?: number }>('enviar');
}

export function useIniciarRevisaoRdv() {
  return useRdvWorkflowAction<{ versao?: number }>('iniciar-revisao');
}

export function useDevolverRdv() {
  return useRdvWorkflowAction<{ versao?: number; justificativa: string }>('devolver');
}

export function useAprovarRdv() {
  return useRdvWorkflowAction<{ versao?: number; observacao?: string }>('aprovar');
}

export function useFinalizarRdv() {
  return useRdvWorkflowAction<{ versao?: number }>('finalizar');
}

export function useReabrirRdv() {
  return useRdvWorkflowAction<{ versao?: number; justificativa: string }>('reabrir');
}

export function useCancelarRdv() {
  return useRdvWorkflowAction<{ versao?: number; justificativa: string }>('cancelar');
}

export function useCorrigirRdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      vooId,
      versao,
      justificativa,
      campos,
    }: {
      vooId: string | number;
      versao?: number;
      justificativa: string;
      campos: RdvInput;
    }) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/rdv/corrigir`, {
        versao,
        justificativa,
        campos,
      });
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vars) => invalidateRdvQueries(qc, vars.vooId),
  });
}

// ===========================================================================
// Tripulação
// ===========================================================================

export function useTripulantes(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-tripulantes', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/tripulantes`);
      return extractPayload<CvTripulante[]>(response, []);
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export function useCriarTripulante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      vooId,
      funcionario_id,
      funcao,
      etapa_id,
      horario_apresentacao,
      horario_dispensa,
      observacoes,
    }: {
      vooId: string | number;
      funcionario_id: number;
      funcao: CvTripulante['funcao'];
      etapa_id?: number | null;
      horario_apresentacao?: string | null;
      horario_dispensa?: string | null;
      observacoes?: string | null;
    }) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/tripulantes`, {
        funcionario_id,
        funcao,
        etapa_id,
        horario_apresentacao,
        horario_dispensa,
        observacoes,
      });
      return extractPayload<{ id: number }>(response, { id: 0 });
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-tripulantes', vars.vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv-alertas', vars.vooId] });
    },
  });
}

export function useRemoverTripulante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vooId, tripulanteId }: { vooId: string | number; tripulanteId: number }) => {
      const response = await apiClient.delete<unknown>(`${API}/voos/${vooId}/tripulantes/${tripulanteId}`);
      return extractPayload<{ id: number }>(response, { id: 0 });
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-tripulantes', vars.vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv-alertas', vars.vooId] });
    },
  });
}

// ===========================================================================
// Abastecimentos
// ===========================================================================

export function useAbastecimentos(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-abastecimentos', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/abastecimentos`);
      return extractPayload<CvAbastecimento[]>(response, []);
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export function useCriarAbastecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      vooId,
      ...dados
    }: {
      vooId: string | number;
      data_hora: string;
      fornecedor?: string;
      localidade?: string;
      combustivel_solicitado?: number;
      unidade?: string;
      combustivel_abastecido?: number;
      numero_ce?: string;
      etapa_id?: number | null;
      observacoes?: string;
    }) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/abastecimentos`, dados);
      return extractPayload<{ id: number }>(response, { id: 0 });
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-abastecimentos', vars.vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv-alertas', vars.vooId] });
    },
  });
}

export function useRemoverAbastecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vooId, abastecimentoId }: { vooId: string | number; abastecimentoId: number }) => {
      const response = await apiClient.delete<unknown>(`${API}/voos/${vooId}/abastecimentos/${abastecimentoId}`);
      return extractPayload<{ id: number }>(response, { id: 0 });
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-abastecimentos', vars.vooId] });
    },
  });
}

// ===========================================================================
// Relatório Petrobras (PDF fictício, marca d'água TESTE)
// ===========================================================================

export async function abrirRelatorioPetrobrasPdf(vooId: string | number): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE_URL}${API}/voos/${vooId}/rdv/relatorio-petrobras`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Falha ao gerar relatorio' }));
    throw new Error(body.error || 'Falha ao gerar relatorio');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

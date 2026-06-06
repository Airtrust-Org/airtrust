import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';

export type TreinamentoPlanejadoStatus =
  | 'PLANEJADO'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO';

export interface TreinamentoPlanejadoParticipante {
  id: number;
  treinamento_id: number;
  funcionario_id: number;
  funcionario_nome?: string | null;
  funcionario_guerra?: string | null;
  funcionario_matricula?: string | null;
  funcionario_email?: string | null;
  funcionario_setor?: string | null;
  funcionario_funcao?: string | null;
  confirmado: boolean;
  presente: boolean | null;
  aprovado: boolean | null;
  nota: number | null;
  observacoes?: string | null;
  qualificacao_historico_id?: number | null;
  status_participacao?: string | null;
  resultado?: 'APROVADO' | 'REPROVADO' | 'INCOMPLETO' | 'CANCELADO' | null;
  conceito?: string | null;
  data_conclusao_efetiva?: string | null;
  concluido_em?: string | null;
}

export interface TreinamentoPlanejadoDia {
  id: number;
  treinamento_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  local?: string | null;
  instrutor_id?: number | null;
  instrutor_nome?: string | null;
  simulador_id?: number | null;
  aeronave_id?: number | null;
  sessao_id?: number | null;
  status: 'ATIVO' | 'CANCELADO' | 'SUBSTITUIDO';
  observacoes?: string | null;
  presencas?: Array<{
    participante_id: number;
    funcionario_id: number;
    status: 'PENDENTE' | 'PRESENTE' | 'AUSENTE' | 'PARCIAL' | 'DISPENSADO';
    minutos_presentes?: number | null;
    observacoes?: string | null;
  }>;
}

export interface TreinamentoPlanejadoAuditoria {
  id: number;
  acao: string;
  usuario_nome?: string | null;
  created_at: string;
  dados_antes?: string | null;
  dados_depois?: string | null;
}

export interface TreinamentoPlanejadoConvocacaoItem {
  id: number;
  convocacao_id: number;
  funcionario_id: number;
  funcionario_nome?: string | null;
  funcionario_matricula?: string | null;
  email_destino?: string | null;
  status: string;
  erro_mensagem?: string | null;
  provider_message_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreinamentoPlanejadoConvocacaoEvent {
  id: number;
  treinamento_id: number;
  empresa_id: number;
  disparado_por?: number | null;
  disparado_por_nome?: string | null;
  assunto: string;
  destinatarios_total: number;
  enviados_sucesso: number;
  enviados_falha: number;
  created_at: string;
  cc: string[];
  avisos: string[];
  itens: TreinamentoPlanejadoConvocacaoItem[];
}

export interface TreinamentoPlanejadoConvocacaoPreviewParticipant {
  funcionario_id: number;
  nome: string;
  matricula?: string | null;
  email?: string | null;
  status: 'ready' | 'missing_email' | 'invalid_email';
  motivo?: string | null;
}

export interface TreinamentoPlanejadoConvocacaoPreview {
  treinamento_id: number;
  treinamento_nome: string;
  data_inicio: string;
  data_fim: string;
  horario: string;
  local: string;
  link_acesso?: string | null;
  modalidade: 'Presencial' | 'EAD' | 'Simulador';
  instrutor: string;
  destinatarios_total: number;
  destinatarios_validos: number;
  gestores_cc: Array<{
    id: number;
    nome: string;
    email: string;
    cargo?: string | null;
    empresa?: string | null;
    ativo: boolean;
  }>;
  participantes: TreinamentoPlanejadoConvocacaoPreviewParticipant[];
  ausentes_email: TreinamentoPlanejadoConvocacaoPreviewParticipant[];
  invalidos_email: TreinamentoPlanejadoConvocacaoPreviewParticipant[];
  ultima_convocacao_em?: string | null;
  avisos: string[];
  config?: {
    assunto_padrao: string;
    reply_to?: string | null;
  };
}

export interface TreinamentoPlanejadoConvocacaoResultado {
  convocacao_id: number;
  enviados_sucesso: number;
  enviados_falha: number;
  itens: Array<{
    funcionario_id: number;
    nome: string;
    email?: string | null;
    status: 'sucesso' | 'falha' | 'ignorado';
    erro_mensagem?: string | null;
  }>;
}

export interface TreinamentoPlanejado {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_nome?: string | null;
  qualificacao_codigo?: string | null;
  data_prevista: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  status: TreinamentoPlanejadoStatus;
  instrutor_id?: number | null;
  instrutor_nome?: string | null;
  instrutor_guerra?: string | null;
  local?: string | null;
  carga_horaria_prevista?: number | null;
  titulo?: string | null;
  descricao?: string | null;
  observacoes?: string | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  codigo_turma?: string | null;
  modalidade?:
    | 'TEORICO'
    | 'SALA'
    | 'PRATICO'
    | 'MISTO'
    | 'EAD'
    | 'SIMULADOR'
    | 'AERONAVE'
    | 'VOO'
    | 'CHEQUE'
    | 'OUTRO';
  data_inicio?: string | null;
  data_fim?: string | null;
  base?: string | null;
  sala?: string | null;
  equipamento_descricao?: string | null;
  limite_participantes?: number | null;
  convocados_total: number;
  confirmados_total: number;
  presentes_total: number;
  participantes: TreinamentoPlanejadoParticipante[];
  dias?: TreinamentoPlanejadoDia[];
  instrutores?: Array<{
    funcionario_id: number;
    nome?: string | null;
    guerra?: string | null;
    papel: string;
    principal: boolean;
  }>;
  auditoria?: TreinamentoPlanejadoAuditoria[];
  convocacoes_email?: TreinamentoPlanejadoConvocacaoEvent[];
}

export interface TreinamentosPlanejadosListResponse {
  items: TreinamentoPlanejado[];
  total: number;
}

export interface TreinamentosPlanejadosCalendarioResponse {
  periodo: {
    inicio?: string | null;
    fim?: string | null;
  };
  items: TreinamentoPlanejado[];
}

export interface TreinamentosPlanejadosAuditoriaResponse {
  items: TreinamentoPlanejado[];
  resumo: {
    total_eventos: number;
    total_convocados: number;
    total_confirmados: number;
    total_presentes: number;
    prontos_para_auditoria: number;
  };
}

export interface TreinamentoPlanejadoFiltros {
  status?: string;
  inicio?: string;
  fim?: string;
  instrutor_id?: number | null;
  funcionario_id?: number | null;
  busca?: string;
}

export interface TreinamentoPlanejadoInput {
  qualificacao_tipo_id: number;
  titulo: string;
  descricao?: string | null;
  observacoes?: string | null;
  local?: string | null;
  data_prevista: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  instrutor_id?: number | null;
  carga_horaria_prevista?: number | null;
  status?: TreinamentoPlanejadoStatus;
  participante_ids?: number[];
  codigo_turma?: string | null;
  modalidade?:
    | 'TEORICO'
    | 'SALA'
    | 'PRATICO'
    | 'MISTO'
    | 'EAD'
    | 'SIMULADOR'
    | 'AERONAVE'
    | 'VOO'
    | 'CHEQUE'
    | 'OUTRO';
  data_inicio?: string;
  data_fim?: string;
  base?: string | null;
  sala?: string | null;
  equipamento_descricao?: string | null;
  limite_participantes?: number | null;
  instrutor_ids?: number[];
  dias?: Array<{
    data: string;
    hora_inicio: string;
    hora_fim: string;
    local?: string | null;
    instrutor_id?: number | null;
    simulador_id?: number | null;
    aeronave_id?: number | null;
    sessao_id?: number | null;
    observacoes?: string | null;
  }>;
}

export interface TreinamentoPlanejadoPresencaInput {
  funcionario_id: number;
  confirmado?: boolean;
  presente?: boolean | null;
  aprovado?: boolean | null;
  nota?: number | null;
  observacoes?: string | null;
}

export type TreinamentoPlanejadoPresencaDiaStatus =
  | 'PENDENTE'
  | 'PRESENTE'
  | 'AUSENTE'
  | 'PARCIAL'
  | 'DISPENSADO';

export interface TreinamentoPlanejadoPresencaDiaInput {
  funcionario_id: number;
  status: TreinamentoPlanejadoPresencaDiaStatus;
  minutos_presentes?: number | null;
  observacoes?: string | null;
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function buildQueryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await apiFetch(`/api/treinamentos${path}`, {
    ...init,
    headers,
  });

  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || `HTTP ${response.status}`);
  }

  return json.data as T;
}

const KEYS = {
  list: (filters: TreinamentoPlanejadoFiltros) =>
    ['treinamentos-planejados', 'list', filters] as const,
  calendario: (filters: TreinamentoPlanejadoFiltros & { mes?: string }) =>
    ['treinamentos-planejados', 'calendario', filters] as const,
  auditoria: (filters: TreinamentoPlanejadoFiltros) =>
    ['treinamentos-planejados', 'auditoria', filters] as const,
  detail: (id?: number | null) => ['treinamentos-planejados', 'detail', id ?? 'none'] as const,
};

function invalidateTreinamentosPlanejados(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['treinamentos-planejados'] }),
    queryClient.invalidateQueries({ queryKey: ['solicitacoes-treinamento'] }),
    queryClient.invalidateQueries({ queryKey: ['qualificacoes-historico'] }),
  ]);
}

export function useTreinamentosPlanejados(filters: TreinamentoPlanejadoFiltros = {}) {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: () =>
      request<TreinamentosPlanejadosListResponse>(`/planejados${buildQueryString(filters)}`),
    staleTime: 60 * 1000,
  });
}

export function useTreinamentosPlanejadosCalendario(
  filters: TreinamentoPlanejadoFiltros & { mes?: string } = {},
) {
  return useQuery({
    queryKey: KEYS.calendario(filters),
    queryFn: () =>
      request<TreinamentosPlanejadosCalendarioResponse>(
        `/planejados/calendario${buildQueryString(filters)}`,
      ),
    staleTime: 60 * 1000,
  });
}

export function useTreinamentosPlanejadosAuditoria(filters: TreinamentoPlanejadoFiltros = {}) {
  return useQuery({
    queryKey: KEYS.auditoria(filters),
    queryFn: () =>
      request<TreinamentosPlanejadosAuditoriaResponse>(
        `/planejados/auditoria${buildQueryString(filters)}`,
      ),
    staleTime: 60 * 1000,
  });
}

export function useTreinamentoPlanejadoDetalhe(id?: number | null) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => request<TreinamentoPlanejado>(`/planejados/${id}`),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

export function useCriarTreinamentoPlanejado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TreinamentoPlanejadoInput) =>
      request<{ id: number }>('/planejados', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await invalidateTreinamentosPlanejados(queryClient);
    },
  });
}

export function useAtualizarTreinamentoPlanejado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<TreinamentoPlanejadoInput> }) =>
      request<{ id: number }>(`/planejados/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useAtualizarConvocadosTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, participante_ids }: { id: number; participante_ids: number[] }) =>
      request<{ id: number; participante_ids: number[] }>(`/planejados/${id}/participantes`, {
        method: 'POST',
        body: JSON.stringify({ participante_ids }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useAtualizarPresencaTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TreinamentoPlanejadoPresencaInput }) =>
      request<{ id: number; funcionario_id: number }>(`/planejados/${id}/presenca`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useAtualizarPresencaDiaTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      diaId,
      input,
    }: {
      id: number;
      diaId: number;
      input: TreinamentoPlanejadoPresencaDiaInput;
    }) =>
      request<{ treinamento_id: number; dia_id: number; participante_id: number }>(
        `/planejados/${id}/dias/${diaId}/presencas`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useConcluirParticipanteTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: {
        funcionario_id: number;
        resultado: 'APROVADO' | 'REPROVADO' | 'INCOMPLETO' | 'CANCELADO';
        data_conclusao_efetiva: string | null;
        nota?: number | null;
        conceito?: string | null;
        observacoes?: string | null;
      };
    }) =>
      request<{
        treinamento_id: number;
        funcionario_id: number;
        resultado: string;
        qualificacao_historico_id: number | null;
      }>(`/planejados/${id}/participantes/conclusao`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useExcluirTreinamentoPlanejado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      request<{ id: number }>(`/planejados/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: async (_, id) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(id) }),
      ]);
    },
  });
}

export function usePreviewConvocacaoTreinamento() {
  return useMutation({
    mutationFn: ({ id, gestores_cc_ids }: { id: number; gestores_cc_ids?: number[] }) =>
      request<TreinamentoPlanejadoConvocacaoPreview>(`/planejados/${id}/convocacoes/preview`, {
        method: 'POST',
        body: JSON.stringify({ gestores_cc_ids }),
      }),
  });
}

export function useEnviarConvocacaoTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      force_resend,
      skip_missing_email,
      gestores_cc_ids,
    }: {
      id: number;
      force_resend?: boolean;
      skip_missing_email?: boolean;
      gestores_cc_ids?: number[];
    }) =>
      request<TreinamentoPlanejadoConvocacaoResultado>(`/planejados/${id}/convocacoes`, {
        method: 'POST',
        body: JSON.stringify({ force_resend, skip_missing_email, gestores_cc_ids }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

export function useReenviarConvocacaoTreinamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      funcionario_id,
      gestores_cc_ids,
    }: {
      id: number;
      funcionario_id: number;
      gestores_cc_ids?: number[];
    }) =>
      request<{
        funcionario_id: number;
        nome: string;
        email?: string | null;
        status: 'sucesso' | 'falha' | 'ignorado';
        erro_mensagem?: string | null;
      }>(`/planejados/${id}/convocacoes/reenvio`, {
        method: 'POST',
        body: JSON.stringify({ funcionario_id, gestores_cc_ids }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        invalidateTreinamentosPlanejados(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.id) }),
      ]);
    },
  });
}

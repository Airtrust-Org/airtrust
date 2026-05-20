/**
 * useSolicitacoesTreinamento — React Query hooks para o módulo de Solicitações de Treinamento
 * Backend: /api/treinamentos/solicitacoes (PRG-OPS-001)
 * Workflow: SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA | REJEITADA
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';

export type SolicitacaoStatus =
  | 'SOLICITADA'
  | 'APROVADA_GESTOR'
  | 'APROVADA_OPS'
  | 'AGENDADA'
  | 'CONCLUIDA'
  | 'REJEITADA';

export type PrioridadeType = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export type TipoTreinamentoType = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export interface Solicitacao {
  id: string;
  empresa_id: number;
  solicitante_id: number;
  solicitante_nome?: string;
  solicitante_guerra?: string;
  qualificacao_id?: number;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  tipo_treinamento: TipoTreinamentoType;
  titulo: string;
  descricao?: string;
  justificativa?: string;
  prioridade: PrioridadeType;
  data_prevista?: string;
  status: SolicitacaoStatus;
  aprovado_gestor_em?: string;
  aprovado_ops_em?: string;
  rejeitado_em?: string;
  motivo_rejeicao?: string;
  data_agendada?: string;
  data_realizada?: string;
  sessao_simulador_id?: number;
  treinamento_planejado_id?: number | null;
  status_pre_agendamento?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolicitacaoStats {
  total: number;
  solicitadas: number;
  aprovadas_gestor: number;
  aprovadas_ops: number;
  agendadas: number;
  concluidas: number;
  rejeitadas: number;
}

export interface CreateSolicitacaoDTO {
  solicitante_id: number;
  qualificacao_id?: number;
  tipo_treinamento: TipoTreinamentoType;
  titulo: string;
  descricao?: string;
  justificativa?: string;
  prioridade?: PrioridadeType;
  data_prevista?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/treinamentos${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data as T;
}

const KEYS = {
  list: (status?: string) => ['solicitacoes-treinamento', 'list', status ?? 'all'] as const,
  detail: (id: string) => ['solicitacoes-treinamento', 'detail', id] as const,
  stats: () => ['solicitacoes-treinamento', 'stats'] as const,
};

function invalidateSolicitacoesIntegradas(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['solicitacoes-treinamento'] }),
    queryClient.invalidateQueries({ queryKey: ['treinamentos-planejados'] }),
    queryClient.invalidateQueries({ queryKey: ['qualificacoes-historico'] }),
  ]);
}

export function useSolicitacoesList(status?: string) {
  return useQuery({
    queryKey: KEYS.list(status),
    queryFn: () => request<Solicitacao[]>(`/solicitacoes${status ? `?status=${status}` : ''}`),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSolicitacaoDetail(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => request<Solicitacao>(`/solicitacoes/${id}`),
    enabled: Boolean(id),
    staleTime: 1 * 60 * 1000,
  });
}

export function useSolicitacoesStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: () => request<SolicitacaoStats>('/solicitacoes/stats'),
    staleTime: 2 * 60 * 1000,
  });
}

function useSolicitacaoActionMutation(action: string, invalidateId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; body?: Record<string, unknown> }) =>
      request(`/solicitacoes/${params.id}/${action}`, {
        method: 'POST',
        body: params.body ? JSON.stringify(params.body) : undefined,
      }),
    onSuccess: async (_, params) => {
      await Promise.all([
        invalidateSolicitacoesIntegradas(queryClient),
        queryClient.invalidateQueries({ queryKey: KEYS.detail(params.id) }),
      ]);
    },
  });
}

export function useCreateSolicitacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSolicitacaoDTO) =>
      request('/solicitacoes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: async () => {
      await invalidateSolicitacoesIntegradas(queryClient);
    },
  });
}

export const useAprovarGestor = () => useSolicitacaoActionMutation('aprovar-gestor');
export const useAprovarOps = () => useSolicitacaoActionMutation('aprovar-ops');
export const useRejeitar = () => useSolicitacaoActionMutation('rejeitar');
export const useAgendar = () => useSolicitacaoActionMutation('agendar');
export const useConcluir = () => useSolicitacaoActionMutation('concluir');

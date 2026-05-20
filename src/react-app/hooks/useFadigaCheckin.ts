import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';

export interface FadigaCheckinItem {
  id: string;
  funcionario_id: number;
  funcionario_nome?: string;
  data_checkin: string;
  hora_checkin: string;
  kss_score: number;
  horas_sono: number;
  qualidade_sono: number;
  score_fadiga: number;
  nivel_fadiga: 'VERDE' | 'AMARELO' | 'LARANJA' | 'VERMELHO';
  status_operacional: 'APTO' | 'APTO_COM_RESSALVA' | 'INAPTO';
  requires_frat_review: number;
  frat_sugerido_nivel: string | null;
  associado_frat_avaliacao_id: string | null;
  observacoes: string | null;
}

export interface CheckinFormData {
  data_checkin?: string;
  hora_dormiu: string;
  hora_acordou: string;
  qualidade_sono: number;
  kss_score: number;
  sintomas?: Record<string, number | string>;
  apto: number;
  motivo_inaptidao?: string;
  meds_ult_12h?: number;
  alcool_ult_12h?: number;
  risco_autoavaliado?: number;
  observacoes?: string;
  jornada_inicio_prevista?: string;
  aceite_termos: true;
  aceite_privacidade: true;
}

export interface FadigaHistoricoResponse {
  data: FadigaCheckinItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  resumo: {
    media_kss: number;
    media_sono_horas: number;
    media_score_fadiga: number;
    distribuicao_niveis: { VERDE: number; AMARELO: number; LARANJA: number; VERMELHO: number };
    total_checkins: number;
  };
}

export interface FadigaAnalyticsResponse {
  evolucao_diaria: Array<{
    data: string;
    media_kss: number;
    media_sono: number;
    media_score: number;
    total_checkins: number;
  }>;
  distribuicao_niveis_periodo: {
    VERDE: number;
    AMARELO: number;
    LARANJA: number;
    VERMELHO: number;
  };
  ranking_atencao: Array<{
    nome: string;
    cargo: string;
    ocorrencias_laranja_vermelho: number;
    media_kss: number;
  }>;
  correlacao_sono_kss: Array<{ horas_sono: number; kss_score: number }>;
  correlacao_score_effectiveness: Array<{
    data: string;
    score_fadiga: number;
    effectiveness_pct: number;
    tripulante_nome: string;
  }>;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await response.json()) as { success: boolean; data?: T; error?: string };
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${response.status}`);
  }
  return json.data as T;
}

export function useCheckinHoje() {
  return useQuery({
    queryKey: ['fadiga-checkin-hoje'],
    queryFn: () => fetchJson<FadigaCheckinItem | null>('/frms/fadiga-checkin/hoje'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CheckinFormData) =>
      fetchJson('/frms/fadiga-checkin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fadiga-checkin-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-historico'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
      queryClient.invalidateQueries({ queryKey: ['frms-ficha'] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
    },
  });
}

export function useFadigaPainel(data?: string) {
  return useQuery({
    queryKey: ['fadiga-painel', data || 'hoje'],
    queryFn: () =>
      fetchJson<Array<Record<string, unknown>>>(
        `/frms/fadiga-checkin/painel-gestor${data ? `?data=${data}` : ''}`,
      ),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useFadigaHistorico(filters: {
  data_inicio?: string;
  data_fim?: string;
  funcionario_id?: number;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters.data_inicio) params.set('data_inicio', filters.data_inicio);
  if (filters.data_fim) params.set('data_fim', filters.data_fim);
  if (filters.funcionario_id) params.set('funcionario_id', String(filters.funcionario_id));
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));

  return useQuery({
    queryKey: ['fadiga-historico', filters],
    queryFn: () => fetchJson<FadigaHistoricoResponse>(`/frms/fadiga-checkin/historico?${params}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFadigaAnalytics(data_inicio: string, data_fim: string) {
  return useQuery({
    queryKey: ['fadiga-analytics', data_inicio, data_fim],
    queryFn: () =>
      fetchJson<FadigaAnalyticsResponse>(
        `/frms/fadiga-checkin/analytics?data_inicio=${data_inicio}&data_fim=${data_fim}`,
      ),
    staleTime: 10 * 60 * 1000,
  });
}

// Compat aliases para páginas já existentes
export function useFadigaCheckinMe(date?: string) {
  return useQuery({
    queryKey: ['fadiga-checkin-me', date || 'hoje'],
    queryFn: () =>
      fetchJson<FadigaCheckinItem | null>(
        `/frms/fadiga-checkin/me${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useFadigaMutation() {
  return useMutation({
    mutationFn: ({ path, options }: { path: string; options: RequestInit }) =>
      fetchJson(path.replace('/api', ''), options),
  });
}

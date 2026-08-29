import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';

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
  reference_date?: string;
  data_checkin?: string;
  hora_dormiu?: string;
  hora_acordou?: string;
  wake_time?: string;
  horas_sono_24h?: number;
  horas_sono_48h?: number;
  qualidade_sono?: number;
  kss_score?: number;
  subjective_fatigue_level?: number;
  sleepiness_level?: number;
  sintomas?: Record<string, number | string>;
  apto?: number;
  fit_for_duty?: boolean;
  motivo_inaptidao?: string;
  meds_ult_12h?: boolean | number | null;
  alcool_ult_12h?: boolean | number | null;
  risco_autoavaliado?: number;
  free_text_notes?: string;
  observacoes?: string;
  jornada_inicio_prevista?: string;
  aceite_termos?: true;
  aceite_privacidade?: true;
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

export interface FadigaPainelEquipeItem {
  [key: string]: unknown;
  id: string;
  funcionario_id: number;
  funcionario_nome?: string;
  cargo?: string | null;
  data: string;
  status:
    | 'normal'
    | 'attention'
    | 'critical'
    | 'unfit_for_duty'
    | 'not_submitted'
    | 'no_duty';
  data_source: 'crew_reported' | 'default_estimate' | 'not_applicable';
  kss_score: number | null;
  score_fadiga: number | null;
  nivel_fadiga: string | null;
  status_operacional: string | null;
  hora_checkin?: string | null;
  horas_sono?: number | null;
  wake_time?: string | null;
  requires_operational_review?: number;
}

type DailyFatigueTeamPayload = {
  date?: string;
  items?: Array<Record<string, unknown>>;
};

export function normalizeFadigaPainelDate(value?: string): string {
  const raw = String(value || 'hoje').trim();
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  return raw;
}

export function buildFadigaPainelRequestPath(data?: string): string {
  const date = normalizeFadigaPainelDate(data);
  return `/frms/daily-fatigue?date=${encodeURIComponent(date)}&scope=team`;
}

export function normalizeFadigaPainelPayload(
  payload: DailyFatigueTeamPayload | Array<Record<string, unknown>> | null | undefined,
  data?: string,
): FadigaPainelEquipeItem[] {
  const requestedDate = normalizeFadigaPainelDate(data);
  const items = Array.isArray(payload) ? payload : payload?.items;

  if (!Array.isArray(items)) {
    if (payload && typeof payload === 'object' && 'funcionario_id' in payload) {
      throw new Error('Endpoint de fadiga diária retornou escopo individual; a aba Equipe exige scope=team.');
    }
    throw new Error('Formato inesperado no painel de fadiga da equipe.');
  }

  return items
    .filter((item) => String(item.status || '') !== 'no_duty')
    .map<FadigaPainelEquipeItem>((item) => ({
      id: String(item.checkin_id || `daily-fatigue-${item.funcionario_id || 'unknown'}-${item.date || requestedDate}`),
      funcionario_id: Number(item.funcionario_id || 0),
      funcionario_nome: String(item.funcionario_nome || item.funcionario_id || '-'),
      cargo: item.cargo == null ? null : String(item.cargo),
      data: String(item.date || requestedDate || ''),
      status: String(item.status || 'normal') as FadigaPainelEquipeItem['status'],
      data_source: String(item.data_source || 'not_applicable') as FadigaPainelEquipeItem['data_source'],
      kss_score: item.kss_score == null ? null : Number(item.kss_score),
      score_fadiga: item.score_fadiga == null ? null : Number(item.score_fadiga),
      nivel_fadiga: item.nivel_fadiga == null ? null : String(item.nivel_fadiga),
      status_operacional: item.status_operacional == null ? null : String(item.status_operacional),
      hora_checkin: item.hora_checkin == null ? null : String(item.hora_checkin),
      horas_sono: item.sleep_hours_24h == null ? null : Number(item.sleep_hours_24h),
      wake_time: item.wake_time == null ? null : String(item.wake_time),
      requires_operational_review:
        item.requires_operational_review == null ? 0 : Number(item.requires_operational_review),
    }));
}

export function mergeFadigaPainelHistory(
  items: FadigaPainelEquipeItem[],
  history: FadigaCheckinItem[],
): FadigaPainelEquipeItem[] {
  const canonical = new Map<string, FadigaCheckinItem>();
  for (const row of history) {
    canonical.set(`${row.funcionario_id}:${row.data_checkin}`, row);
  }

  return items.map((item) => {
    if (item.kss_score != null) return item;
    const row = canonical.get(`${item.funcionario_id}:${item.data}`);
    if (!row || row.kss_score == null || !Number.isFinite(Number(row.kss_score))) return item;

    return {
      ...item,
      kss_score: Number(row.kss_score),
      score_fadiga: item.score_fadiga ?? Number(row.score_fadiga),
      nivel_fadiga: item.nivel_fadiga ?? row.nivel_fadiga,
      status_operacional: item.status_operacional ?? row.status_operacional,
      hora_checkin: item.hora_checkin ?? row.hora_checkin,
      horas_sono: item.horas_sono ?? Number(row.horas_sono),
    };
  });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await apiFetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders },
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
  const normalizedDate = normalizeFadigaPainelDate(data);
  return useQuery({
    queryKey: ['fadiga-painel', 'team', normalizedDate],
    queryFn: async () => {
      const payload = await fetchJson<DailyFatigueTeamPayload>(buildFadigaPainelRequestPath(normalizedDate));
      const normalized = normalizeFadigaPainelPayload(payload, normalizedDate);

      // O endpoint daily-fatigue historicamente omitiu KSS no SELECT da visão de equipe.
      // Enquanto clientes antigos ainda coexistem, reconciliamos o mesmo check-in pela fonte
      // canônica de histórico para nunca mostrar "—" quando o valor realmente existe.
      try {
        const history = await fetchJson<FadigaHistoricoResponse>(
          `/frms/fadiga-checkin/historico?data_inicio=${encodeURIComponent(normalizedDate)}&data_fim=${encodeURIComponent(normalizedDate)}&page=1&limit=500`,
        );
        return mergeFadigaPainelHistory(normalized, Array.isArray(history.data) ? history.data : []);
      } catch {
        return normalized;
      }
    },
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';
import { submitPendingFrmsRecoveryActivity } from '@/react-app/hooks/useFrmsRecovery';

export interface FadigaCheckinItem {
  id: string;
  funcionario_id: number;
  funcionario_nome?: string;
  data_checkin: string;
  hora_checkin: string;
  kss_score: number;
  kss_provenance?: 'CREW_REPORTED' | 'DERIVED' | 'DEFAULTED' | null;
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
  late_submission_acknowledged?: true;
  hora_dormiu?: string;
  hora_acordou?: string;
  wake_time?: string;
  hora_apresentacao?: string;
  horas_sono_24h?: number;
  oportunidade_sono_horas_24h?: number;
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
  readiness?: {
    duration_ms: number;
    trials: Array<{
      sequence: number;
      scheduledAtMs: number;
      stimulusAtMs: number;
      responseAtMs: number | null;
      reactionTimeMs: number | null;
      outcome: 'response' | 'lapse' | 'false_start' | 'missed';
    }>;
    protocol_version?: string;
  };
}

export interface FadigaHistoricoResponse {
  data: FadigaCheckinItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  resumo: {
    media_kss: number | null;
    media_sono_horas: number;
    media_score_fadiga: number;
    distribuicao_niveis: { VERDE: number; AMARELO: number; LARANJA: number; VERMELHO: number };
    total_checkins: number;
  };
}

export interface FadigaAnalyticsResponse {
  evolucao_diaria: Array<{
    data: string;
    media_kss: number | null;
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
    media_kss: number | null;
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
    | 'incomplete_checkin'
    | 'no_duty';
  data_source: 'crew_reported' | 'missing_checkin' | 'default_estimate' | 'not_applicable';
  kss_score: number | null;
  kss_provenance?: 'CREW_REPORTED' | 'DERIVED' | 'DEFAULTED' | null;
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

export type FadigaVisibleRequest = 'team-checkins-load' | 'daily-checkin-submit';

const TEAM_PANEL_TIMEOUT_MS = 15_000;
export const TEAM_PANEL_TIMEOUT_MESSAGE = 'A consulta dos check-ins da equipe demorou além do esperado. Tente novamente.';

export function safeFadigaVisibleErrorMessage(
  request: FadigaVisibleRequest,
  _technicalDetail?: unknown,
): string {
  switch (request) {
    case 'team-checkins-load':
      return 'Não foi possível carregar os check-ins da equipe.';
    case 'daily-checkin-submit':
      if (_technicalDetail instanceof Error) {
        const incidentId = (_technicalDetail as Error & { incidentId?: string }).incidentId;
        const reference = typeof incidentId === 'string' && /^[a-f0-9-]{36}$/i.test(incidentId)
          ? ` Referência: ${incidentId.slice(0, 8)}.`
          : '';
        const code = _technicalDetail.message;
        if (code === 'FRMS_CHECKIN_COMMITTED_POST_PROCESSING_FAILED') {
          return `O check-in foi gravado, mas houve falha nas atualizações operacionais. Não envie novamente; informe a coordenação para verificar o processamento e os alertas.${reference}`;
        }
        // A rejection before the D1 batch is not a transient connection failure:
        // repeating the same PVT payload cannot make it valid as pre-flight evidence.
        if (code === 'post_presentation_readiness_not_allowed') {
          return 'A hora de apresentação informada já passou. O teste de atenção feito agora não pode ser aceito como avaliação pré-jornada. O check-in não foi registrado; procure a coordenação para regularizar o registro tardio. Não altere o horário de apresentação para contornar a regra.';
        }
        if (code === 'late_submission_not_confirmed_by_server') {
          return 'O horário de apresentação não confere com o relógio operacional do servidor. O check-in não foi registrado. Verifique a data/hora automática do aparelho e procure a coordenação; não altere o horário de apresentação.';
        }
        if (code === 'retrospective_readiness_not_allowed') {
          return 'O teste de atenção de hoje não pode ser usado como avaliação de um dia anterior. O check-in não foi registrado; procure a coordenação para orientar o registro retrospectivo.';
        }
        if (code === 'invalid_readiness_protocol') {
          return 'A versão do teste de atenção não é compatível com o protocolo atual. Atualize o AirTrust e refaça o teste somente antes da apresentação; caso a jornada já tenha começado, procure a coordenação.';
        }
        if (['invalid_trial_sequence', 'invalid_trial_timing', 'invalid_duration', 'readiness_trials_required'].includes(code)) {
          return 'Os dados do teste de atenção não passaram na validação. O check-in não foi registrado. Atualize o AirTrust e refaça o teste antes da apresentação; caso a jornada já tenha começado, procure a coordenação.';
        }
        return `Não foi possível confirmar o registro do check-in. Consulte seu Histórico antes de reenviar e informe à coordenação.${reference}`;
      }
      return 'Não foi possível confirmar o registro do check-in. Consulte seu Histórico antes de reenviar e informe à coordenação.';
  }
}

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

  // The team endpoint must supply an explicit operational classification and
  // provenance for every row. Missing fields must not become green/normal or
  // "not applicable" through a frontend default.
  const validStatuses = new Set<FadigaPainelEquipeItem['status']>([
    'normal', 'attention', 'critical', 'unfit_for_duty',
    'not_submitted', 'incomplete_checkin', 'no_duty',
  ]);
  const validSources = new Set<FadigaPainelEquipeItem['data_source']>([
    'crew_reported', 'missing_checkin', 'default_estimate', 'not_applicable',
  ]);
  return items.map<FadigaPainelEquipeItem>((item) => {
    const status = item.status as FadigaPainelEquipeItem['status'];
    const source = item.data_source as FadigaPainelEquipeItem['data_source'];
    if (!validStatuses.has(status) || !validSources.has(source)) {
      throw new Error('FRMS_TEAM_CLASSIFICATION_OR_PROVENANCE_MISSING');
    }
    // A stale/cached NORMAL from an older Worker must not become a green
    // panel row without verified crew KSS. Never weaken an existing alert.
    const validKss = item.kss_provenance === 'CREW_REPORTED' &&
      Number.isInteger(item.kss_score) && Number(item.kss_score) >= 1 && Number(item.kss_score) <= 9;
    const kss = validKss ? Number(item.kss_score) : null;
    const safeStatus = status === 'normal' && source === 'crew_reported'
      ? kss == null ? 'incomplete_checkin' : kss >= 8 ? 'critical' : kss >= 7 ? 'attention' : status
      : status;
    const riskReconciledFromEvidence = safeStatus !== status;
    const requiresReview = ['not_submitted', 'incomplete_checkin', 'attention', 'critical', 'unfit_for_duty'].includes(safeStatus);
    const serverReview = item.requires_operational_review === 1 || item.requires_operational_review === '1';
    return {
      id: String(item.checkin_id || `daily-fatigue-${item.funcionario_id || 'unknown'}-${item.date || requestedDate}`),
      funcionario_id: Number(item.funcionario_id || 0),
      funcionario_nome: String(item.funcionario_nome || item.funcionario_id || '-'),
      cargo: item.cargo == null ? null : String(item.cargo),
      data: String(item.date || requestedDate || ''),
      status: safeStatus,
      data_source: source,
      risk_reconciled_from_evidence: riskReconciledFromEvidence,
      kss_score: kss,
      kss_provenance: validKss ? 'CREW_REPORTED' : null,
      score_fadiga: riskReconciledFromEvidence || item.score_fadiga == null ? null : Number(item.score_fadiga),
      nivel_fadiga: riskReconciledFromEvidence || item.nivel_fadiga == null ? null : String(item.nivel_fadiga),
      status_operacional: riskReconciledFromEvidence || item.status_operacional == null ? null : String(item.status_operacional),
      hora_checkin: item.hora_checkin == null ? null : String(item.hora_checkin),
      horas_sono: item.sleep_hours_24h == null ? null : Number(item.sleep_hours_24h),
      wake_time: item.wake_time == null ? null : String(item.wake_time),
      requires_operational_review: requiresReview || serverReview ? 1 : 0,
    };
  });
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
    if (item.kss_score != null && item.kss_provenance === 'CREW_REPORTED') return item;
    const row = canonical.get(`${item.funcionario_id}:${item.data}`);
    const historicalKssValid = row?.kss_provenance === 'CREW_REPORTED' &&
      Number.isInteger(row.kss_score) && row.kss_score >= 1 && row.kss_score <= 9;
    const safeStatus = item.status === 'normal' ? 'incomplete_checkin' : item.status;

    // Historical KSS may enrich what was entered, but the history endpoint
    // must never reintroduce APTO, VERDE or a computed score that the daily
    // canonical snapshot withheld for incomplete/unverified evidence.
    return {
      ...item,
      status: safeStatus,
      requires_operational_review: safeStatus !== item.status ? 1 : item.requires_operational_review,
      risk_reconciled_from_evidence: safeStatus !== item.status ||
        item.risk_reconciled_from_evidence === true,
      kss_score: historicalKssValid ? row!.kss_score : null,
      kss_provenance: historicalKssValid ? 'CREW_REPORTED' : null,
      score_fadiga: safeStatus !== item.status ? null : item.score_fadiga,
      nivel_fadiga: safeStatus !== item.status ? null : item.nivel_fadiga,
      status_operacional: safeStatus !== item.status ? null : item.status_operacional,
      hora_checkin: item.hora_checkin ?? row?.hora_checkin ?? null,
      horas_sono: item.horas_sono ?? row?.horas_sono ?? null,
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
  const json = (await response.json()) as {
    success: boolean; data?: T; error?: unknown; incident_id?: unknown;
  };
  if (!response.ok || !json.success) {
    const error: Error & { incidentId?: string } =
      new Error(typeof json.error === 'string' ? json.error : `Erro HTTP ${response.status}`);
    if (typeof json.incident_id === 'string' && /^[a-f0-9-]{36}$/i.test(json.incident_id)) {
      error.incidentId = json.incident_id;
    }
    throw error;
  }
  return json.data as T;
}

async function fetchTeamPanelJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TEAM_PANEL_TIMEOUT_MS);

  try {
    return await fetchJson<T>(path, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(TEAM_PANEL_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Read the exact operational date; /hoje uses the Worker's UTC clock. */
export function buildCheckinHojePath(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('FRMS_INVALID_OPERATIONAL_DATE');
  return `/frms/fadiga-checkin/me?date=${encodeURIComponent(date)}`;
}

export function useCheckinHoje(date: string) {
  return useQuery({
    queryKey: ['fadiga-checkin-hoje', date],
    queryFn: () => fetchJson<FadigaCheckinItem | null>(buildCheckinHojePath(date)),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CheckinFormData) => {
      const assessmentDate = String(data.reference_date || data.data_checkin || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate)) {
        // A classificação do dia anterior faz parte do mesmo fluxo de check-in.
        // Ela só é persistida quando o usuário aciona o envio final do formulário.
        await submitPendingFrmsRecoveryActivity(assessmentDate);
      }

      try {
        return await fetchJson('/frms/fadiga-checkin', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'FRMS_CHECKIN_COMMITTED_POST_PROCESSING_FAILED') {
          // D1 confirmed the submission: refresh the persisted state, do not suggest resubmission.
          void queryClient.invalidateQueries({ queryKey: ['fadiga-checkin-hoje'] });
          void queryClient.invalidateQueries({ queryKey: ['fadiga-historico'] });
          void queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
        }
        console.error('[FRMS fadiga] Falha ao registrar check-in diário', error);
        throw new Error(safeFadigaVisibleErrorMessage('daily-checkin-submit', error));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fadiga-checkin-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-historico'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
      queryClient.invalidateQueries({ queryKey: ['frms-ficha'] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['frms-recovery-context'] });
    },
  });
}

export function useFadigaPainel(data?: string) {
  const normalizedDate = normalizeFadigaPainelDate(data);
  return useQuery({
    queryKey: ['fadiga-painel', 'team', normalizedDate],
    queryFn: async () => {
      let normalized: FadigaPainelEquipeItem[];
      try {
        const payload = await fetchTeamPanelJson<DailyFatigueTeamPayload>(
          buildFadigaPainelRequestPath(normalizedDate),
        );
        normalized = normalizeFadigaPainelPayload(payload, normalizedDate);
      } catch (error) {
        console.error('[FRMS fadiga] Falha ao carregar check-ins da equipe', error);
        if (error instanceof Error && error.message === TEAM_PANEL_TIMEOUT_MESSAGE) {
          throw error;
        }
        throw new Error(safeFadigaVisibleErrorMessage('team-checkins-load', error));
      }

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

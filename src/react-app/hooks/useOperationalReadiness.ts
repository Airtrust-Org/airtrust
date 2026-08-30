import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient, type ApiResponse } from '@/react-app/services/http-client';
import type { VigilanceTrial } from '@/react-app/pages/frms/operationalReadiness';

export type ReadinessClassification =
  | 'baseline_building'
  | 'preserved'
  | 'attention'
  | 'operational_review';

export type ReadinessBaseline = {
  sessions: number;
  minimum_sessions: number;
  ready: boolean;
};

export type ReadinessSubmissionResult = {
  assessmentId: string;
  classification: ReadinessClassification;
  baselineSessions: number;
  baselineReady: boolean;
  baselineMedianRtMs: number | null;
  baselineLapseRate: number | null;
  medianRtDeltaPct: number | null;
  lapseRateDelta: number | null;
  warningSignals: string[];
  criticalSignals: string[];
};

export type ReadinessToday = {
  id: string;
  reference_date: string;
  protocol_version: string;
  scoring_version: string;
  classification: ReadinessClassification;
  baseline_sessions: number;
  baseline_ready: number;
  baseline_median_rt_ms: number | null;
  baseline_lapse_rate: number | null;
  median_rt_delta_pct: number | null;
  lapse_rate_delta: number | null;
  duration_ms: number;
  valid_trials: number;
  lapse_count: number;
  lapse_rate: number;
  false_start_count: number;
  missed_count: number;
  median_rt_ms: number | null;
  mean_rt_ms: number | null;
  p90_rt_ms: number | null;
  sd_rt_ms: number | null;
  response_speed: number | null;
  warning_signals_json: string | null;
  critical_signals_json: string | null;
  created_at: string;
};

export type ReadinessTeamItem = {
  funcionario_id: number;
  reference_date: string;
  classification: ReadinessClassification;
  baseline_sessions: number;
  baseline_ready: number;
  median_rt_delta_pct: number | null;
  lapse_rate_delta: number | null;
  warning_signals_json: string | null;
  critical_signals_json: string | null;
  created_at: string;
};

type ReadinessEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

type OperationalReadinessRequestKind = 'load' | 'submit';

export function safeOperationalReadinessError(kind: OperationalReadinessRequestKind): string {
  return kind === 'submit'
    ? 'Não foi possível registrar o teste de prontidão. Tente novamente.'
    : 'Não foi possível carregar a prontidão operacional. Tente novamente.';
}

function unwrapReadinessResponse<T>(response: ApiResponse<ReadinessEnvelope<T>>): T {
  if (!response.success) {
    throw new Error(response.error || 'Falha ao comunicar com o serviço de prontidão operacional.');
  }
  const payload = response.data;
  if (!payload?.success) {
    throw new Error(payload?.message || payload?.error || 'Resposta inválida do serviço de prontidão operacional.');
  }
  return payload.data as T;
}

async function getReadiness<T>(path: string): Promise<T> {
  try {
    return unwrapReadinessResponse<T>(await httpClient.get<ReadinessEnvelope<T>>(path));
  } catch (error) {
    console.error('[FRMS readiness] GET failed', { path, error });
    throw new Error(safeOperationalReadinessError('load'));
  }
}

async function postReadiness<T>(path: string, input: unknown): Promise<T> {
  try {
    return unwrapReadinessResponse<T>(await httpClient.post<ReadinessEnvelope<T>>(path, input));
  } catch (error) {
    console.error('[FRMS readiness] POST failed', { path, error });
    throw new Error(safeOperationalReadinessError('submit'));
  }
}

export function useReadinessBaseline(referenceDate?: string) {
  return useQuery({
    queryKey: ['frms-readiness-baseline', referenceDate || null],
    queryFn: () =>
      getReadiness<ReadinessBaseline>(
        referenceDate
          ? `/frms/readiness/baseline?date=${encodeURIComponent(referenceDate)}`
          : '/frms/readiness/baseline',
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReadinessToday(referenceDate: string) {
  return useQuery({
    queryKey: ['frms-readiness-today', referenceDate],
    queryFn: () =>
      getReadiness<ReadinessToday | null>(
        `/frms/readiness/today?date=${encodeURIComponent(referenceDate)}`,
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useReadinessTeam(referenceDate: string) {
  return useQuery({
    queryKey: ['frms-readiness-team', referenceDate],
    queryFn: () =>
      getReadiness<ReadinessTeamItem[]>(
        `/frms/readiness/team?date=${encodeURIComponent(referenceDate)}`,
      ),
    staleTime: 60 * 1000,
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(referenceDate),
  });
}

export function useSubmitReadiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      reference_date: string;
      duration_ms: number;
      trials: VigilanceTrial[];
      protocol_version?: string;
    }) => postReadiness<ReadinessSubmissionResult>('/frms/readiness', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-today', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-team', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
    },
  });
}

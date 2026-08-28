import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '@/react-app/services/http-client';
import type { VigilanceTrial } from '@/react-app/pages/frms/operationalReadiness';

export type ReadinessBaseline = {
  sessions: number;
  minimum_sessions: number;
  ready: boolean;
};

export type ReadinessSubmissionResult = {
  assessmentId: string;
  classification: 'baseline_building' | 'preserved' | 'attention' | 'operational_review';
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
  classification: ReadinessSubmissionResult['classification'];
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

type ReadinessEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

function unwrapReadinessResponse<T>(
  response: Awaited<ReturnType<typeof httpClient.get<ReadinessEnvelope<T>>>>,
): T {
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
  return unwrapReadinessResponse<T>(await httpClient.get<ReadinessEnvelope<T>>(path));
}

async function postReadiness<T>(path: string, input: unknown): Promise<T> {
  const response = await httpClient.post<ReadinessEnvelope<T>>(path, input);
  if (!response.success) {
    throw new Error(response.error || 'Falha ao comunicar com o serviço de prontidão operacional.');
  }
  const payload = response.data;
  if (!payload?.success) {
    throw new Error(payload?.message || payload?.error || 'Resposta inválida do serviço de prontidão operacional.');
  }
  return payload.data as T;
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

export function useSubmitReadiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reference_date: string; duration_ms: number; trials: VigilanceTrial[] }) =>
      postReadiness<ReadinessSubmissionResult>('/frms/readiness', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-today', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await apiFetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    ...init,
  });
  const json = (await response.json()) as { success: boolean; data?: T; error?: string; message?: string };
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || `Erro HTTP ${response.status}`);
  }
  return json.data as T;
}

export function useReadinessBaseline() {
  return useQuery({
    queryKey: ['frms-readiness-baseline'],
    queryFn: () => fetchJson<ReadinessBaseline>('/frms/readiness/baseline'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReadinessToday(referenceDate: string) {
  return useQuery({
    queryKey: ['frms-readiness-today', referenceDate],
    queryFn: () =>
      fetchJson<ReadinessToday | null>(
        `/frms/readiness/today?date=${encodeURIComponent(referenceDate)}`,
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubmitReadiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reference_date: string; duration_ms: number; trials: VigilanceTrial[] }) =>
      fetchJson<ReadinessSubmissionResult>('/frms/readiness', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-today', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
    },
  });
}

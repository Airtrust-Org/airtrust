import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { getAccessToken } from '@/react-app/config/api';

export type RecoveryActivityType =
  | 'OFF_DUTY'
  | 'STANDBY_HOME_HOTEL'
  | 'STANDBY_ONSITE'
  | 'ADMIN_TRAINING'
  | 'DUTY_TRAVEL'
  | 'MIXED'
  | 'OTHER'
  | 'FLIGHT_NOT_IN_SOURCE'
  | 'UNKNOWN';

export interface RecoveryFlightSummary {
  detected: boolean;
  sectorCount: number;
  landingCount: number;
  canonicalFlightMinutes: number;
  source: 'SIGVOOS' | 'NONE_FOUND';
}

export interface RecoveryContextData {
  reference_date: string;
  assessment_date?: string;
  schema_ready: boolean;
  flight: RecoveryFlightSummary;
  requires_activity_classification: boolean;
  activity: Record<string, unknown> | null;
  assessment: Record<string, unknown> | null;
  prompt_reason?: 'FLIGHT_DETECTED' | 'NO_FLIGHT_FOUND_IN_SIGVOOS';
}

export interface RecoveryActivitySegmentInput {
  activity_type: Exclude<RecoveryActivityType, 'MIXED' | 'FLIGHT_NOT_IN_SOURCE' | 'UNKNOWN'>;
  start_time?: string | null;
  end_time?: string | null;
  location_kind?: 'HOME' | 'HOTEL' | 'BASE_AIRPORT' | 'TRAVEL' | 'OTHER' | null;
  immediate_callout_required?: boolean | null;
}

export interface RecoveryActivityInput {
  reference_date: string;
  activity_type: RecoveryActivityType;
  standby_location?: 'HOME' | 'HOTEL' | 'BASE_AIRPORT' | 'OTHER' | null;
  immediate_callout_required?: boolean | null;
  duty_start_time?: string | null;
  duty_end_time?: string | null;
  notes?: string | null;
  segments?: RecoveryActivitySegmentInput[];
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await apiFetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    ...init,
  });
  const json = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  };
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || `Erro HTTP ${response.status}`);
  }
  return json.data as T;
}

export function previousOperationalDate(dateYmd?: string): string {
  const base = dateYmd ? new Date(`${dateYmd}T12:00:00Z`) : new Date();
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

export function useFrmsRecoveryContext(referenceDate?: string) {
  const date = referenceDate || previousOperationalDate();
  return useQuery({
    queryKey: ['frms-recovery-context', date],
    queryFn: () =>
      fetchJson<RecoveryContextData>(
        `/frms/readiness/recovery/context?date=${encodeURIComponent(date)}`,
      ),
    staleTime: 60_000,
  });
}

export function useSubmitFrmsRecoveryActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecoveryActivityInput) =>
      fetchJson<{
        activity: Record<string, unknown>;
        assessment: Record<string, unknown>;
        flight: RecoveryFlightSummary;
        source_discrepancy: boolean;
      }>('/frms/readiness/recovery/activity', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frms-recovery-context', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['frms-ficha'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
    },
  });
}

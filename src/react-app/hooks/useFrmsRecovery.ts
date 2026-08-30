import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient, type ApiResponse } from '@/react-app/services/http-client';

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

export interface RecoveryActivityResult {
  activity: Record<string, unknown>;
  assessment: Record<string, unknown>;
  flight: RecoveryFlightSummary;
  source_discrepancy: boolean;
}

type RecoveryEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

type FrmsRecoveryRequestKind = 'load' | 'submit';

export function safeFrmsRecoveryError(kind: FrmsRecoveryRequestKind): string {
  return kind === 'submit'
    ? 'Não foi possível registrar a atividade de recuperação. Tente novamente.'
    : 'Não foi possível carregar o contexto de recuperação do FRMS. Tente novamente.';
}

function unwrapRecoveryResponse<T>(response: ApiResponse<RecoveryEnvelope<T>>): T {
  if (!response.success) {
    throw new Error(response.error || 'Falha ao comunicar com o serviço de recuperação FRMS.');
  }
  const payload = response.data;
  if (!payload?.success) {
    throw new Error(
      payload?.message || payload?.error || 'Resposta inválida do serviço de recuperação FRMS.',
    );
  }
  return payload.data as T;
}

async function getRecovery<T>(path: string): Promise<T> {
  try {
    return unwrapRecoveryResponse<T>(await httpClient.get<RecoveryEnvelope<T>>(path));
  } catch (error) {
    console.error('[FRMS recovery] GET failed', { path, error });
    throw new Error(safeFrmsRecoveryError('load'));
  }
}

async function postRecovery<T>(path: string, input: unknown): Promise<T> {
  try {
    return unwrapRecoveryResponse<T>(await httpClient.post<RecoveryEnvelope<T>>(path, input));
  } catch (error) {
    console.error('[FRMS recovery] POST failed', { path, error });
    throw new Error(safeFrmsRecoveryError('submit'));
  }
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
      getRecovery<RecoveryContextData>(
        `/frms/readiness/recovery/context?date=${encodeURIComponent(date)}`,
      ),
    staleTime: 60_000,
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
}

export function useSubmitFrmsRecoveryActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecoveryActivityInput) =>
      postRecovery<RecoveryActivityResult>('/frms/readiness/recovery/activity', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['frms-recovery-context', variables.reference_date],
      });
      queryClient.invalidateQueries({ queryKey: ['frms-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['frms-ficha'] });
      queryClient.invalidateQueries({ queryKey: ['fadiga-painel'] });
    },
  });
}

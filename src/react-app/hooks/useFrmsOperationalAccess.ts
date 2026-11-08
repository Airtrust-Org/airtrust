import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient, type ApiResponse } from '@/react-app/services/http-client';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

export type FrmsWorkforceProfile = 'flight' | 'maintenance' | 'other';

export type FrmsOperationalAccess = {
  administrative_role: string | null;
  enabled: boolean;
  domains: string[];
  setor_ids: number[];
  actions: Record<string, string[]>;
  frms_profile: FrmsWorkforceProfile;
  employee: {
    id: number;
    nome: string | null;
    cargo: string | null;
    funcao: string | null;
    setor_id: number | null;
  } | null;
  can_manage_maintenance: boolean;
  can_checkin: boolean;
  maintenance_setor_ids: number[];
};

export type FrmsMaintenanceTeamItem = {
  funcionario_id: number;
  funcionario_nome: string;
  cargo: string | null;
  funcao: string | null;
  setor_id: number;
  setor_nome: string | null;
  checkin_id: string | null;
  hora_checkin: string | null;
  checkin_submitted_at?: string | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  kss_score: number | null;
  score_fadiga: number | null;
  nivel_fadiga: string | null;
  status_operacional: string | null;
  computed_risk_level: string | null;
  requires_operational_review: number | null;
  readiness_id: string | null;
  readiness_classification: string | null;
  baseline_sessions: number | null;
  baseline_ready: number | null;
  median_rt_delta_pct: number | null;
  lapse_rate_delta: number | null;
  readiness_created_at: string | null;
};

export type FrmsMaintenanceTeam = {
  date: string;
  items: FrmsMaintenanceTeamItem[];
  meta: {
    scope: 'maintenance';
    setor_ids: number[];
    access_source: string;
  };
};

export type FrmsMaintenanceCheckinInput = {
  reference_date: string;
  wake_time: string;
  sleep_hours_24h: number;
  sleep_quality: number;
  kss_score: number;
  fit_for_duty: boolean;
  notes?: string;
};

export type FrmsMaintenanceCheckinResult = {
  checkin: {
    id: string;
    funcionario_id: number;
    cargo: string | null;
    reference_date: string;
    wake_time: string;
    sleep_hours_24h: number;
    sleep_quality: number;
    kss_score: number;
    fit_for_duty: boolean;
    score_fadiga: number;
    nivel_fadiga: string;
    status_operacional: string;
    computed_risk_level: string;
    requires_operational_review: number;
    reasons: string[];
    recommendation: string;
    scoring_version: string;
  };
  readiness_required: boolean;
};

type EndpointEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
};

type FrmsOperationalRequestKind = 'access' | 'maintenance-team' | 'maintenance-checkin';

export function safeFrmsOperationalRequestError(kind: FrmsOperationalRequestKind): string {
  switch (kind) {
    case 'access':
      return 'Não foi possível validar o acesso operacional ao FRMS. Tente novamente.';
    case 'maintenance-team':
      return 'Não foi possível carregar a equipe de manutenção. Tente novamente.';
    case 'maintenance-checkin':
      return 'Não foi possível registrar o check-in de manutenção. Tente novamente.';
  }
}

function unwrap<T>(response: ApiResponse<EndpointEnvelope<T>>): T {
  if (!response.success) {
    throw new Error(response.error || 'Falha ao consultar o escopo operacional do FRMS.');
  }
  const payload = response.data;
  if (!payload?.success || payload.data === undefined) {
    throw new Error(payload?.message || payload?.error || 'Resposta inválida do escopo operacional do FRMS.');
  }
  return payload.data;
}

async function getEndpoint<T>(path: string, kind: FrmsOperationalRequestKind): Promise<T> {
  try {
    return unwrap<T>(await httpClient.get<EndpointEnvelope<T>>(path));
  } catch (error) {
    console.error('[FRMS operational access] GET failed', { path, error });
    throw new Error(safeFrmsOperationalRequestError(kind));
  }
}

async function postEndpoint<T>(
  path: string,
  input: unknown,
  kind: FrmsOperationalRequestKind,
): Promise<T> {
  try {
    return unwrap<T>(await httpClient.post<EndpointEnvelope<T>>(path, input));
  } catch (error) {
    console.error('[FRMS operational access] POST failed', { path, error });
    throw new Error(safeFrmsOperationalRequestError(kind));
  }
}

// A request that never settles must not leave the coordinator indefinitely
// looking at a spinner. This is UI fail-closed, NOT a permission bypass or a
// fallback to an assumed operational role.
export async function withFrmsAccessTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('FRMS_ACCESS_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Align the FRMS bootstrap with the canonical authenticated transport used
 * by successful session-profile selection. The generic client appended
 * extra cache-bypass headers and generated a distinct browser preflight.
 * This is not an authorization fallback.
 */
export async function requestFrmsOperationalAccess(signal: AbortSignal): Promise<FrmsOperationalAccess> {
  const response = await fetchWithAuth(API_BASE_URL + '/me/operational-access', {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('FRMS_ACCESS_HTTP_UNAVAILABLE');
  const payload = (await response.json()) as EndpointEnvelope<FrmsOperationalAccess>;
  if (payload?.success !== true || !payload.data) {
    throw new Error('FRMS_ACCESS_RESPONSE_INVALID');
  }
  return payload.data;
}

async function fetchFrmsOperationalAccess(): Promise<FrmsOperationalAccess> {
  try {
    return await withFrmsAccessTimeout(requestFrmsOperationalAccess);
  } catch {
    throw new Error(safeFrmsOperationalRequestError('access'));
  }
}

export function useFrmsOperationalAccess() {
  return useQuery({
    queryKey: ['frms-operational-access'],
    queryFn: fetchFrmsOperationalAccess,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });
}

export function useFrmsMaintenanceTeam(referenceDate: string, enabled = true) {
  return useQuery({
    queryKey: ['frms-maintenance-team', referenceDate],
    queryFn: () =>
      getEndpoint<FrmsMaintenanceTeam>(
        `/me/operational-access/frms-maintenance-team?date=${encodeURIComponent(referenceDate)}`,
        'maintenance-team',
      ),
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate),
    staleTime: 60 * 1000,
  });
}

export function useSubmitFrmsMaintenanceCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FrmsMaintenanceCheckinInput) =>
      postEndpoint<FrmsMaintenanceCheckinResult>(
        '/me/operational-access/frms-maintenance-checkin',
        input,
        'maintenance-checkin',
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frms-maintenance-team', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-today', variables.reference_date] });
      queryClient.invalidateQueries({ queryKey: ['frms-readiness-baseline'] });
    },
  });
}

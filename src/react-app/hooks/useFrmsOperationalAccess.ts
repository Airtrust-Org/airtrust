import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient, type ApiResponse } from '@/react-app/services/http-client';

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

export function useFrmsOperationalAccess() {
  return useQuery({
    queryKey: ['frms-operational-access'],
    queryFn: () => getEndpoint<FrmsOperationalAccess>('/me/operational-access', 'access'),
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

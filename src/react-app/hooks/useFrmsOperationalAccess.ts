import { useQuery } from '@tanstack/react-query';
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

type EndpointEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
};

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

async function getEndpoint<T>(path: string): Promise<T> {
  return unwrap<T>(await httpClient.get<EndpointEnvelope<T>>(path));
}

export function useFrmsOperationalAccess() {
  return useQuery({
    queryKey: ['frms-operational-access'],
    queryFn: () => getEndpoint<FrmsOperationalAccess>('/me/operational-access'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useFrmsMaintenanceTeam(referenceDate: string, enabled = true) {
  return useQuery({
    queryKey: ['frms-maintenance-team', referenceDate],
    queryFn: () =>
      getEndpoint<FrmsMaintenanceTeam>(
        `/me/operational-access/frms-maintenance-team?date=${encodeURIComponent(referenceDate)}`,
      ),
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate),
    staleTime: 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { tenantQueryKey } from '@/react-app/lib/query-client';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';
import type {
  AlertaRaw,
  DashboardMetrics,
  EscalaItem,
  FrmsAlertaRaw,
  SessaoSimulador,
  SimuladoresAlertasData,
} from './types';

export interface DashboardSectorOption {
  id: number;
  codigo: string | null;
  nome: string;
}

export interface DashboardOperationalScope {
  mode: 'all' | 'restricted' | 'self';
  selectable: boolean;
  sectorOptions: DashboardSectorOption[];
  selectedSetorIds: number[];
  ignoredRequestedSetorIds: number;
}

export interface DashboardOperationalSummary {
  generatedAt: string;
  scope: DashboardOperationalScope;
  metrics: DashboardMetrics | null;
  alertas: AlertaRaw[] | null;
  frmsAlertas: FrmsAlertaRaw[] | null;
  escalas: EscalaItem[] | null;
  sessoes: SessaoSimulador[] | null;
  simuladoresAlertas: SimuladoresAlertasData | null;
  unavailableSources: string[];
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

function normalizeSectorIds(ids: number[]): number[] {
  return [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
}

export function operationalSummaryKey(
  empresaId: number | null | undefined,
  selectedSectorIds: number[],
) {
  return tenantQueryKey(
    empresaId,
    'dashboard',
    'operational-summary',
    normalizeSectorIds(selectedSectorIds).join(','),
  );
}

export function useOperationalSummary(selectedSectorIds: number[], enabled = true) {
  const { empresaId } = useTenantQueryKey();
  const normalizedIds = normalizeSectorIds(selectedSectorIds);

  return useQuery({
    queryKey: operationalSummaryKey(empresaId, normalizedIds),
    queryFn: async () => {
      const query = normalizedIds.length > 0 ? `?setor_ids=${normalizedIds.join(',')}` : '';
      const response = await fetchWithAuth(
        `${API_BASE_URL}/dashboard/operational-summary${query}`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as ApiEnvelope<DashboardOperationalSummary> | null;

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error || 'Não foi possível carregar o painel operacional');
      }

      return payload.data;
    },
    enabled: enabled && !!empresaId,
    staleTime: 8 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });
}

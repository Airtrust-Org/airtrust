import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export interface HorasVooFilters {
  page?: number;
  limit?: number;
  data_inicio?: string;
  data_fim?: string;
  origem_registro?: string;
  tipo_operacao?: string;
}

export interface SaldoInicialDTO {
  horas_total_min: number;
  horas_pic_min: number;
  horas_sic_min: number;
  horas_noturna_min: number;
  horas_instrumento_min: number;
  horas_simulador_min: number;
  horas_instrucao_min: number;
  horas_aw139_min: number;
  horas_sk76_min: number;
  horas_outros_modelos_min: number;
  data_referencia: string;
  observacoes?: string | null;
}

export interface LancamentoHorasVooDTO {
  data_voo: string;
  aeronave_id?: number | null;
  modelo_aeronave?: string | null;
  prefixo_aeronave?: string | null;
  origem?: string | null;
  destino?: string | null;
  duracao_total_min: number;
  duracao_pic_min?: number;
  duracao_sic_min?: number;
  duracao_noturna_min?: number;
  duracao_instrumento_min?: number;
  duracao_instrucao_min?: number;
  pousos_dia?: number;
  pousos_noite?: number;
  hoist_cycles?: number;
  funcao: 'PIC' | 'SIC' | 'INSTRUTOR' | 'ALUNO';
  tipo_operacao?: string | null;
  is_simulador?: 0 | 1;
  observacoes?: string | null;
  numero_voo?: string | null;
}

function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Erro na API (${response.status})`);
  }
  return payload;
}

function buildParams(filters: HorasVooFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export function useHorasVooTotais(funcionarioId: number) {
  return useQuery({
    queryKey: ['horas-voo-totais', funcionarioId],
    queryFn: () => requestJson(`/horas-voo/${funcionarioId}/totais`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: Number.isFinite(funcionarioId) && funcionarioId > 0,
  });
}

export function useHorasVooLancamentos(funcionarioId: number, filters: HorasVooFilters) {
  return useQuery({
    queryKey: ['horas-voo-lancamentos', funcionarioId, filters],
    queryFn: () => {
      const qs = buildParams(filters);
      return requestJson(`/horas-voo/${funcionarioId}/lancamentos${qs ? `?${qs}` : ''}`);
    },
    staleTime: 2 * 60 * 1000,
    enabled: Number.isFinite(funcionarioId) && funcionarioId > 0,
  });
}

export function useHorasVooSaldo(funcionarioId: number) {
  return useQuery({
    queryKey: ['horas-voo-saldo', funcionarioId],
    queryFn: () => requestJson(`/horas-voo/${funcionarioId}/saldo`).then((r) => r.data),
    enabled: Number.isFinite(funcionarioId) && funcionarioId > 0,
  });
}

export function useUpsertSaldoInicial(funcionarioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SaldoInicialDTO) =>
      requestJson(`/horas-voo/${funcionarioId}/saldo`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horas-voo-totais', funcionarioId] });
      queryClient.invalidateQueries({ queryKey: ['horas-voo-saldo', funcionarioId] });
    },
  });
}

export function useCreateLancamentoHorasVoo(funcionarioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LancamentoHorasVooDTO) =>
      requestJson(`/horas-voo/${funcionarioId}/lancamentos`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horas-voo-lancamentos', funcionarioId] });
      queryClient.invalidateQueries({ queryKey: ['horas-voo-totais', funcionarioId] });
    },
  });
}

export function useDeleteLancamentoHorasVoo(funcionarioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lancamentoId: number) =>
      requestJson(`/horas-voo/${funcionarioId}/lancamentos/${lancamentoId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horas-voo-lancamentos', funcionarioId] });
      queryClient.invalidateQueries({ queryKey: ['horas-voo-totais', funcionarioId] });
    },
  });
}

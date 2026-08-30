import { API_BASE_URL, ensureValidAccessToken } from '../config/api';
import { controlledFetch } from '../utils/request-control';

export type UsoSimulador = {
  simulador_id: number;
  codigo: string;
  tipo_aeronave: string;
  horas: number;
  total_sessoes?: number;
};

export type UsoTipoSessao = {
  tipo_sessao: string;
  sessoes: number;
  horas: number;
};

export type RelatorioUsoResponse = {
  periodo: { data_inicio: string | null; data_fim: string | null };
  total_horas: number;
  por_simulador: UsoSimulador[];
  por_tipo_sessao: UsoTipoSessao[];
  por_status?: Array<{ status: string; sessoes: number }>;
};

/**
 * HTTP helper que usa API_BASE_URL e desembrulha { success, data }.
 * Auth comes from the canonical in-memory/session-aware token accessor instead
 * of probing localStorage aliases, because session-only logins are the default.
 */
async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await ensureValidAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };

  const res = await controlledFetch(url, {
    credentials: 'include',
    ...init,
    headers,
  });

  const bodyText = await res.text();

  if (!res.ok) {
    let data: unknown;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = bodyText;
    }
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.error === 'string') msg = obj.error;
    }
    throw new Error(msg);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error('Resposta inválida do servidor (não é JSON)');
  }

  if (parsed && typeof parsed === 'object' && 'success' in (parsed as Record<string, unknown>)) {
    const wrapper = parsed as { success: boolean; data?: T; error?: string };
    if (!wrapper.success) {
      throw new Error(wrapper.error || 'Erro na API');
    }
    return (wrapper.data ?? parsed) as T;
  }

  return parsed as T;
}

const base = `${API_BASE_URL}/simuladores/relatorios`;

export const relatoriosSimuladoresApi = {
  uso: async (params: {
    data_inicio?: string;
    data_fim?: string;
    tipo_sessao?: string;
    simulador_id?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.data_inicio) qs.append('data_inicio', params.data_inicio);
    if (params.data_fim) qs.append('data_fim', params.data_fim);
    if (params.tipo_sessao) qs.append('tipo_sessao', params.tipo_sessao);
    if (params.simulador_id) qs.append('simulador_id', String(params.simulador_id));
    return http<RelatorioUsoResponse>(`${base}/uso?${qs.toString()}`);
  },
  tripulantes: async (params: {
    data_inicio?: string;
    data_fim?: string;
    tipo_sessao?: string;
    funcao?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.data_inicio) qs.append('data_inicio', params.data_inicio);
    if (params.data_fim) qs.append('data_fim', params.data_fim);
    if (params.tipo_sessao) qs.append('tipo_sessao', params.tipo_sessao);
    if (params.funcao) qs.append('funcao', params.funcao);
    return http<
      Array<{
        funcionario_id: number;
        nome: string;
        matricula: string;
        funcao: string;
        sessoes_totais: number;
        horas: number;
        aprovados: number;
        reprovados: number;
        faltas: number;
      }>
    >(`${base}/tripulantes?${qs.toString()}`);
  },
  desempenho: async (params: { data_inicio?: string; data_fim?: string; tipo_sessao?: string }) => {
    const qs = new URLSearchParams();
    if (params.data_inicio) qs.append('data_inicio', params.data_inicio);
    if (params.data_fim) qs.append('data_fim', params.data_fim);
    if (params.tipo_sessao) qs.append('tipo_sessao', params.tipo_sessao);
    return http<
      Array<{
        tipo_sessao: string;
        sessoes: number;
        aprovados: number;
        reprovados: number;
        aprovacao_percent: number;
      }>
    >(`${base}/desempenho?${qs.toString()}`);
  },
};

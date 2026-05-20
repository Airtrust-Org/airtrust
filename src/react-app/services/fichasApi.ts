import { FichaDetalheResponse, FichaManobra, FichaSimulador } from '../types/fichas';
import { getAccessToken } from '@/react-app/config/api';

const base = '/api/simuladores';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  // Incluir token JWT se disponível (mantém compatibilidade com AuthContext)
  const token = (() => {
    try {
      return getAccessToken();
    } catch {
      return null;
    }
  })();

  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    headers: { ...baseHeaders, ...(init?.headers as Record<string, string> | undefined) },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    let msg = res.statusText;
    if (typeof data === 'object' && data !== null) {
      const maybe = data as Record<string, unknown>;
      if (typeof maybe.error === 'string') msg = maybe.error;
    }
    throw new Error(msg);
  }
  return res.json();
}

export const fichasApi = {
  obterFicha: async (params: {
    ficha_id?: number;
    sessao_id?: number;
    funcionario_id?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.ficha_id) qs.append('ficha_id', String(params.ficha_id));
    if (params.sessao_id) qs.append('sessao_id', String(params.sessao_id));
    if (params.funcionario_id) qs.append('funcionario_id', String(params.funcionario_id));
    return http<{ success: boolean; data: FichaDetalheResponse }>(
      `${base}/fichas-simulador?${qs.toString()}`,
    );
  },
  popularManobras: async (fichaId: number) => {
    return http<{ success: boolean; data?: FichaManobra[]; skipped?: boolean }>(
      `${base}/fichas-simulador/${fichaId}/popular-manobras`,
      {
        method: 'POST',
      },
    );
  },
  atualizarManobras: async (fichaId: number, manobras: Array<Partial<FichaManobra>>) => {
    return http<{ success: boolean; data: FichaManobra[] }>(
      `${base}/fichas-simulador/${fichaId}/manobras`,
      {
        method: 'PUT',
        body: JSON.stringify(manobras),
      },
    );
  },
  atualizarFicha: async (
    fichaId: number,
    payload: { nota_geral?: string; comentarios_gerais?: string; status?: string },
  ) => {
    return http<{ success: boolean; data?: FichaSimulador }>(`${base}/fichas/${fichaId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  assinar: async (fichaId: number, papel: 'ALUNO' | 'INSTRUTOR' | 'EXAMINADOR', info?: string) => {
    return http<{ success: boolean; data: FichaSimulador }>(
      `${base}/fichas-simulador/${fichaId}/assinar`,
      {
        method: 'POST',
        body: JSON.stringify({ papel, info }),
      },
    );
  },
  gerarQualificacao: async (fichaId: number, tipoCodigo?: string) => {
    return http<{ success: boolean; data?: unknown; error?: string; code?: string }>(
      `${base}/fichas-simulador/${fichaId}/gerar-qualificacao`,
      {
        method: 'POST',
        body: JSON.stringify(tipoCodigo ? { tipo_codigo: tipoCodigo } : {}),
      },
    );
  },
};

export type FichasApi = typeof fichasApi;

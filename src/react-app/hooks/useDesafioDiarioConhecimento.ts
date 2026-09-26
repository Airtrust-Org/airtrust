import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';

export interface DesafioDiarioAlternativa {
  id: number;
  texto: string;
  ordem: number;
}

export interface DesafioDiarioFonte {
  tipoDocumento: string;
  titulo: string;
  revisao: string;
  secao: string | null;
  pagina: string | null;
  referencia: string | null;
}

export interface DesafioDiarioQuestao {
  data: string;
  aeronaveModelo: string;
  questaoId: number;
  enunciado: string;
  topico: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  alternativas: DesafioDiarioAlternativa[];
}

export interface DesafioDiarioFeedback extends DesafioDiarioQuestao {
  alternativaId: number;
  alternativaCorretaId: number;
  correta: boolean;
  explicacao: string;
  oQueGuardar: string | null;
  fontes: DesafioDiarioFonte[];
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`/api/conhecimento-ativo${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error || 'Não foi possível carregar o desafio diário.');
  }
  return json.data;
}

export const desafioDiarioConhecimentoKey = ['conhecimento-ativo', 'desafio-diario'] as const;

export function useDesafioDiarioConhecimento(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: desafioDiarioConhecimentoKey,
    queryFn: () => request<DesafioDiarioQuestao>('/me/desafio-diario'),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useResponderDesafioDiario() {
  return useMutation({
    mutationFn: (alternativaId: number) =>
      request<DesafioDiarioFeedback>('/me/desafio-diario/responder', {
        method: 'POST',
        body: JSON.stringify({ alternativa_id: alternativaId }),
      }),
  });
}

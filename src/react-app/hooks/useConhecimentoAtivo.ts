import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';

export type ConhecimentoConfianca = 'SABIA' | 'DUVIDA' | 'CHUTEI';
export type ConhecimentoEstado = 'NOVO' | 'APRENDENDO' | 'EM_REFORCO' | 'CONSOLIDADO';

export interface ConhecimentoPeriodo {
  chave: string;
  inicio: string;
  fim: string;
}

export interface ConhecimentoDesafioResumo {
  id: number;
  aeronave_modelo: string;
  numero_desafio: number;
  status: 'DISPONIVEL' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'EXPIRADO';
  disponivel_em: string;
  expira_em: string | null;
  concluido_em: string | null;
}

export interface ConhecimentoResumo {
  periodo: ConhecimentoPeriodo;
  modelos: string[];
  desafios: ConhecimentoDesafioResumo[];
  xp: number;
  dominio: Record<ConhecimentoEstado, number>;
  estimativaMinutos: number;
}

export interface ConhecimentoMapaTopico {
  topico_id: number;
  nome: string;
  aeronave_modelo: string | null;
  itens: number;
  consolidados: number | null;
  em_reforco: number | null;
  aprendendo: number | null;
}

export interface ConhecimentoAlternativa {
  id: number;
  texto: string;
  ordem: number;
}

export interface ConhecimentoFonteSnapshot {
  tipoDocumento: string;
  titulo: string;
  revisao: string;
  secao: string | null;
  pagina: string | null;
  referencia: string | null;
}

export interface ConhecimentoRespostaRegistrada {
  alternativaId: number | null;
  alternativaCorretaId: number;
  correta: boolean;
  confianca: ConhecimentoConfianca | null;
  respondidoEm: string | null;
  explicacao: string;
  oQueGuardar: string | null;
  fontes: ConhecimentoFonteSnapshot[];
}

export interface ConhecimentoQuestaoDesafio {
  id: number;
  ordem: number;
  itemId: number;
  tipo: string;
  enunciado: string;
  imagemR2Key: string | null;
  topico: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  alternativas: ConhecimentoAlternativa[];
  resposta: ConhecimentoRespostaRegistrada | null;
}

export interface ConhecimentoDesafio {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  aeronave_modelo: string;
  periodo_chave: string;
  numero_desafio: number;
  status: 'DISPONIVEL' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'EXPIRADO';
  disponivel_em: string;
  expira_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  xp_concedido: number;
  total_questoes: number;
  respondidas: number;
  questoes: ConhecimentoQuestaoDesafio[];
}

export interface ConhecimentoFeedback {
  idempotente: boolean;
  correta: boolean;
  alternativaId: number;
  alternativaCorretaId: number;
  confianca: ConhecimentoConfianca;
  explicacao: string;
  oQueGuardar: string | null;
  fontes: ConhecimentoFonteSnapshot[];
  dominio?: {
    nivel: number;
    estado: ConhecimentoEstado;
    proximaRevisaoEm: string;
  };
  conclusao: {
    concluido: boolean;
    xpConcedido: number;
  };
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

export class ConhecimentoAtivoApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ConhecimentoAtivoApiError';
    this.status = status;
    this.code = code;
  }
}

async function conhecimentoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth('/api/conhecimento-ativo' + path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !json.success || json.data === undefined) {
    throw new ConhecimentoAtivoApiError(
      json.error || 'Não foi possível acessar o Conhecimento Ativo.',
      response.status,
      json.code,
    );
  }
  return json.data;
}

export const conhecimentoAtivoKeys = {
  resumo: () => ['conhecimento-ativo', 'me'] as const,
  mapa: () => ['conhecimento-ativo', 'mapa'] as const,
  desafio: (id: number) => ['conhecimento-ativo', 'desafio', id] as const,
};

export function useConhecimentoAtivoResumo(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: conhecimentoAtivoKeys.resumo(),
    queryFn: () => conhecimentoRequest<ConhecimentoResumo>('/me'),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    retry: false,
  });
}

export function useConhecimentoAtivoMapa(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: conhecimentoAtivoKeys.mapa(),
    queryFn: () => conhecimentoRequest<ConhecimentoMapaTopico[]>('/me/mapa'),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    retry: false,
  });
}

export function useConhecimentoAtivoDesafio(id: number) {
  return useQuery({
    queryKey: conhecimentoAtivoKeys.desafio(id),
    queryFn: () => conhecimentoRequest<ConhecimentoDesafio>(`/me/desafios/${id}`),
    enabled: id > 0,
    staleTime: 5_000,
    retry: false,
  });
}

export function useGerarDesafioConhecimento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (aeronaveModelo?: string) =>
      conhecimentoRequest<{ desafio: ConhecimentoDesafioResumo; criado: boolean }>(
        '/me/desafios/gerar',
        {
          method: 'POST',
          body: JSON.stringify({
            aeronave_modelo: aeronaveModelo || null,
          }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.resumo() });
    },
  });
}

export function useIniciarDesafioConhecimento(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      conhecimentoRequest<ConhecimentoDesafio & { iniciadoAgora: boolean }>(
        `/me/desafios/${id}/iniciar`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.desafio(id) });
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.resumo() });
    },
  });
}

export function useResponderConhecimento(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      desafioQuestaoId: number;
      alternativaId: number;
      confianca: ConhecimentoConfianca;
      tempoRespostaMs?: number | null;
    }) =>
      conhecimentoRequest<ConhecimentoFeedback>(`/me/desafios/${id}/respostas`, {
        method: 'POST',
        body: JSON.stringify({
          desafio_questao_id: body.desafioQuestaoId,
          alternativa_id: body.alternativaId,
          confianca: body.confianca,
          tempo_resposta_ms: body.tempoRespostaMs ?? null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.desafio(id) });
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.resumo() });
      queryClient.invalidateQueries({ queryKey: conhecimentoAtivoKeys.mapa() });
    },
  });
}

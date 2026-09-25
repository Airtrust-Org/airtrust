import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth('/api/conhecimento-ativo/admin' + path, {
    headers: init?.body instanceof FormData ? undefined : init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error || 'Não foi possível concluir a operação.');
  }
  return json.data;
}

export type FonteTipo = 'RFM' | 'FCOM' | 'QRH' | 'SOP' | 'OM' | 'OUTRO';
export type FonteStatus = 'RASCUNHO' | 'VIGENTE' | 'SUPERADO';

export interface ConhecimentoFonteAdmin {
  id: number;
  tipo_documento: FonteTipo;
  titulo: string;
  aeronave_modelo: string | null;
  revisao: string;
  data_revisao: string | null;
  r2_key: string | null;
  hash_documento: string | null;
  status: FonteStatus;
  created_at: string;
  updated_at: string;
}

export interface ConhecimentoTopicoAdmin {
  id: number;
  codigo: string;
  nome: string;
  aeronave_modelo: string | null;
  parent_id: number | null;
  ordem: number;
  ativo: number;
  created_at: string;
  updated_at: string;
}

export interface ConhecimentoItemAdmin {
  id: number;
  codigo: string;
  aeronave_modelo: string | null;
  titulo: string;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  status: 'RASCUNHO' | 'EM_REVISAO' | 'APROVADO' | 'REVISAO_NECESSARIA' | 'ARQUIVADO';
  ativo: number;
  topico: string;
  total_fontes: number;
  total_questoes: number;
}

export interface ConhecimentoQuestaoAdmin {
  id: number;
  item_id: number;
  variante_chave: string;
  tipo: 'MULTIPLA_ESCOLHA' | 'VERDADEIRO_FALSO' | 'CENARIO';
  enunciado: string;
  dificuldade: number;
  status: 'RASCUNHO' | 'EM_REVISAO' | 'APROVADA' | 'ARQUIVADA';
  ativo: number;
  item_codigo: string;
  item_titulo: string;
}

const keys = {
  fontes: ['conhecimento-ativo-admin', 'fontes'] as const,
  topicos: ['conhecimento-ativo-admin', 'topicos'] as const,
  itens: ['conhecimento-ativo-admin', 'itens'] as const,
  questoes: ['conhecimento-ativo-admin', 'questoes'] as const,
};

export function useConhecimentoFontesAdmin() {
  return useQuery({
    queryKey: keys.fontes,
    queryFn: () => adminRequest<ConhecimentoFonteAdmin[]>('/fontes'),
    staleTime: 15_000,
  });
}

export function useCriarFonteConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tipo_documento: FonteTipo;
      titulo: string;
      aeronave_modelo?: string | null;
      revisao: string;
      data_revisao?: string | null;
      status?: 'RASCUNHO' | 'VIGENTE';
    }) =>
      adminRequest<{ id: number }>('/fontes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.fontes }),
  });
}

export function useSuperarFonteConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      adminRequest<{ id: number; status: 'SUPERADO' }>(`/fontes/${id}/superar`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.fontes });
      qc.invalidateQueries({ queryKey: keys.itens });
      qc.invalidateQueries({ queryKey: keys.questoes });
    },
  });
}

export function useConhecimentoTopicosAdmin() {
  return useQuery({
    queryKey: keys.topicos,
    queryFn: () => adminRequest<ConhecimentoTopicoAdmin[]>('/topicos'),
    staleTime: 15_000,
  });
}

export function useCriarTopicoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      codigo: string;
      nome: string;
      aeronave_modelo?: string | null;
      parent_id?: number | null;
      ordem?: number;
    }) =>
      adminRequest<{ id: number }>('/topicos', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.topicos }),
  });
}

export function useConhecimentoItensAdmin() {
  return useQuery({
    queryKey: keys.itens,
    queryFn: () => adminRequest<ConhecimentoItemAdmin[]>('/itens'),
    staleTime: 15_000,
  });
}

export function useCriarItemConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      topico_id: number;
      codigo: string;
      aeronave_modelo?: string | null;
      titulo: string;
      conceito: string;
      resumo_essencial?: string | null;
      criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
      tempo_estudo_segundos?: number;
      fontes: Array<{
        fonte_id: number;
        secao?: string | null;
        pagina?: string | null;
        referencia?: string | null;
        principal?: boolean;
      }>;
    }) =>
      adminRequest<{ id: number }>('/itens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.itens }),
  });
}

export function useAprovarItemConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      adminRequest<{ id: number; status: 'APROVADO' }>(`/itens/${id}/aprovar`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.itens }),
  });
}

export interface ConhecimentoAprovacaoLoteResult {
  aeronave_modelo: string;
  fontes_vigentes: number;
  itens_aprovados: number;
  questoes_aprovadas: number;
}

export function useAprovarTudoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aeronaveModelo: string) =>
      adminRequest<ConhecimentoAprovacaoLoteResult>('/aprovar-tudo', {
        method: 'POST',
        body: JSON.stringify({ aeronave_modelo: aeronaveModelo }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.fontes });
      qc.invalidateQueries({ queryKey: keys.itens });
      qc.invalidateQueries({ queryKey: keys.questoes });
    },
  });
}

export function useConhecimentoQuestoesAdmin() {
  return useQuery({
    queryKey: keys.questoes,
    queryFn: () => adminRequest<ConhecimentoQuestaoAdmin[]>('/questoes'),
    staleTime: 15_000,
  });
}

export function useCriarQuestaoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      item_id: number;
      variante_chave: string;
      tipo: 'MULTIPLA_ESCOLHA' | 'VERDADEIRO_FALSO' | 'CENARIO';
      enunciado: string;
      explicacao: string;
      o_que_guardar?: string | null;
      dificuldade?: number;
      alternativas: Array<{ texto: string; correta: boolean }>;
    }) =>
      adminRequest<{ id: number }>('/questoes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.questoes });
      qc.invalidateQueries({ queryKey: keys.itens });
    },
  });
}

export function useAprovarQuestaoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      adminRequest<{ id: number; status: 'APROVADA' }>(`/questoes/${id}/aprovar`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.questoes }),
  });
}


export interface ConhecimentoImportIssue {
  linha: number;
  campo?: string;
  erro: string;
}

export interface ConhecimentoImportValidation {
  arquivo: string;
  version: string;
  totalRows: number;
  validRows: number;
  errors: ConhecimentoImportIssue[];
  warnings: ConhecimentoImportIssue[];
  canImport: boolean;
  preview: Array<{
    linha: number;
    aeronave_modelo: string | null;
    fonte: string;
    topico_codigo: string;
    item_codigo: string;
    item_titulo: string;
    questao_variante: string;
    questao_enunciado: string;
  }>;
}

export interface ConhecimentoImportResult {
  importacaoId: number;
  totalRows: number;
  inserted: Record<string, number>;
  ignored: Record<string, number>;
}

export interface ConhecimentoImportHistory {
  id: number;
  arquivo_nome: string;
  arquivo_sha256: string;
  template_versao: string;
  status: 'VALIDADO' | 'APLICANDO' | 'APLICADO' | 'FALHOU';
  total_linhas: number;
  total_erros: number;
  total_inseridos: number;
  total_ignorados: number;
  resumo_json: string | null;
  erro: string | null;
  created_at: string;
  aplicado_em: string | null;
}

export async function baixarModeloConhecimentoAtivo() {
  const response = await fetchWithAuth('/api/conhecimento-ativo/admin/importacao/modelo.xlsx');
  if (!response.ok) throw new Error('Não foi possível baixar o modelo de importação.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-conhecimento-ativo-airtrust.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileForm(file: File): FormData {
  const data = new FormData();
  data.append('arquivo', file);
  return data;
}

export function useValidarImportacaoConhecimento() {
  return useMutation({
    mutationFn: (file: File) =>
      adminRequest<ConhecimentoImportValidation>('/importacao/validar', {
        method: 'POST',
        body: fileForm(file),
      }),
  });
}

export function useAplicarImportacaoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      adminRequest<ConhecimentoImportResult>('/importacao/aplicar', {
        method: 'POST',
        body: fileForm(file),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.fontes });
      qc.invalidateQueries({ queryKey: keys.topicos });
      qc.invalidateQueries({ queryKey: keys.itens });
      qc.invalidateQueries({ queryKey: keys.questoes });
      qc.invalidateQueries({ queryKey: ['conhecimento-ativo-admin', 'importacoes'] });
    },
  });
}

export function useHistoricoImportacaoConhecimento() {
  return useQuery({
    queryKey: ['conhecimento-ativo-admin', 'importacoes'],
    queryFn: () => adminRequest<ConhecimentoImportHistory[]>('/importacao/historico'),
    staleTime: 15_000,
  });
}


export function useTornarFonteConhecimentoVigente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      adminRequest<{ id: number; status: 'VIGENTE' }>(`/fontes/${id}/vigente`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.fontes });
      qc.invalidateQueries({ queryKey: keys.itens });
      qc.invalidateQueries({ queryKey: keys.questoes });
    },
  });
}

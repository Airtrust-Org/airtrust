import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';
import { API_BASE_URL } from '@/react-app/config/api';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';

export interface GuiaInstrutor {
  id: number;
  modelo_aeronave_id: number;
  aeronave_nome: string;
  aeronave_codigo: string;
  programa: 'INICIAL' | 'PERIODICO' | 'SEMESTRAL' | 'CHECK';
  ciclo: number | null;
  sessao_numero: number | null;
  sessao_total: number | null;
  codigo: string;
  titulo: string;
  descricao: string | null;
  versao: string;
  status: string;
  html_disponivel: boolean;
  html_status_validacao: string;
  pdf_disponivel: boolean;
  pdf_tamanho_bytes: number | null;
  publicado_em: string | null;
  updated_at: string;
  modelo_sessao_id: number | null;
  nome_sessao: string | null;
  descricao_sessao: string | null;
}

export interface ProximaSessaoGuia {
  sessao_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_sessao: string | null;
  tema_sessao: string | null;
  modelo_sessao_id: number | null;
  simulador_nome: string | null;
  guia_id: number | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE_URL}${path}`);
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Falha ao carregar guias do instrutor');
  }
  return json.data as T;
}

export function useGuiasInstrutor(filtros: { aeronave?: string; programa?: string; q?: string } = {}) {
  const { empresaId, tenantKey } = useTenantQueryKey();
  const params = new URLSearchParams();
  if (filtros.aeronave) params.set('aeronave', filtros.aeronave);
  if (filtros.programa) params.set('programa', filtros.programa);
  if (filtros.q) params.set('q', filtros.q);
  const qs = params.toString();

  return useQuery({
    queryKey: tenantKey('guias-instrutor', 'lista', filtros),
    queryFn: () => getJson<GuiaInstrutor[]>(`/simuladores/guias-instrutor${qs ? `?${qs}` : ''}`),
    enabled: Boolean(empresaId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProximasSessoesComGuia(limit = 6) {
  const { empresaId, tenantKey } = useTenantQueryKey();
  return useQuery({
    queryKey: tenantKey('guias-instrutor', 'proximas-sessoes', limit),
    queryFn: () =>
      getJson<ProximaSessaoGuia[]>(`/simuladores/guias-instrutor/proximas-sessoes?limit=${limit}`),
    enabled: Boolean(empresaId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useGuiaInstrutor(id: number | null) {
  const { empresaId, tenantKey } = useTenantQueryKey();
  return useQuery({
    queryKey: tenantKey('guias-instrutor', 'detalhe', id),
    queryFn: () => getJson<GuiaInstrutor>(`/simuladores/guias-instrutor/${id}`),
    enabled: Boolean(empresaId) && Boolean(id),
  });
}

export function useGuiaDaSessao(sessaoId: number | null) {
  const { empresaId, tenantKey } = useTenantQueryKey();
  return useQuery({
    queryKey: tenantKey('guias-instrutor', 'sessao', sessaoId),
    queryFn: () => getJson<GuiaInstrutor | null>(`/simuladores/sessoes/${sessaoId}/guias-instrutor`),
    enabled: Boolean(empresaId) && Boolean(sessaoId),
    staleTime: 5 * 60 * 1000,
  });
}

export function guiaHtmlUrl(id: number): string {
  return `${API_BASE_URL}/simuladores/guias-instrutor/${id}/html`;
}

export function guiaPdfUrl(id: number): string {
  return `${API_BASE_URL}/simuladores/guias-instrutor/${id}/pdf`;
}

export async function baixarGuiaPdf(id: number, sugestaoNome: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/guias-instrutor/${id}/download`);
  if (!res.ok) {
    throw new Error('Falha ao baixar o PDF do guia');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || sugestaoNome;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

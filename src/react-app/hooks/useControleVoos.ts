import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/react-app/services/apiClient';

// ---- Status types ----

export type CvFlightStatus =
  | 'planejado'
  | 'liberado_operacionalmente'
  | 'em_andamento'
  | 'pousado'
  | 'concluido_operacionalmente'
  | 'cancelado'
  | 'alternado_divergido';

export type CvRdvStatus = 'rascunho' | 'preenchimento_finalizado' | 'cancelado';

// ---- Entity types ----

export interface CvVoo {
  id: number;
  empresa_id: number;
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: CvFlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CvRdv {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
  status: CvRdvStatus;
  responsavel_preenchimento_id: number | null;
  preenchido_em: string | null;
  finalizado_operacionalmente_por: number | null;
  finalizado_operacionalmente_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface CvAeroporto {
  id: number;
  codigo: string;
  codigo_icao: string;
  codigo_iata: string;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvTipoVoo {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvNaturezaVoo {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  ordem: number;
}

export interface CvDashboardTotais {
  voos: number;
  voos_planejados: number;
  voos_liberados_operacionalmente: number;
  voos_em_andamento: number;
  voos_pousados: number;
  voos_concluidos_operacionalmente: number;
  voos_cancelados: number;
  voos_alternados_divergidos: number;
  rdvs_rascunho: number;
  rdvs_preenchimento_finalizado: number;
  voos_sem_rdv: number;
}

export interface CvDashboard {
  uso_operacional_interno: boolean;
  nao_regulado: boolean;
  periodo: { data_inicio: string; data_fim: string };
  totais: CvDashboardTotais;
  voos_por_status: Record<string, number>;
  proximos_voos: CvVoo[];
  alertas_operacionais: {
    voos_sem_tripulacao: number;
    voos_sem_aeronave: number;
    voos_concluidos_sem_rdv: number;
  };
}

export interface CvPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RdvInput {
  numero?: string;
  data_voo?: string;
  horario_decolagem_real?: string | null;
  horario_pouso_real?: string | null;
  horas_voadas?: number | null;
  numero_pousos?: number | null;
  ciclos?: number | null;
  combustivel_decolagem?: number | null;
  combustivel_pouso?: number | null;
  combustivel_consumo?: number | null;
  pob?: number | null;
  carga_kg?: number | null;
  ocorrencias?: string | null;
  divergencias?: string | null;
}

// ---- Internal helper ----
// http-client wraps backend JSON into response.data.
// Backend returns { success, data: T, ... } — so response.data IS the full backend body.

type HttpOk = { success: boolean; data?: unknown; error?: string };

function extractPayload<T>(response: unknown, fallback: T): T {
  const r = response as HttpOk;
  if (!r.success) throw new Error(r.error || 'Erro de API');
  const body = r.data as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && 'data' in body) return body.data as T;
  return (r.data as T) ?? fallback;
}

function extractBody<T>(response: unknown): T {
  const r = response as HttpOk;
  if (!r.success) throw new Error(r.error || 'Erro de API');
  return r.data as T;
}

const API = '/controle-voos';

// ---- Query hooks ----

export function useControleVoosDashboard(data?: string) {
  return useQuery({
    queryKey: ['cv-dashboard', data ?? 'today'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (data) params.set('data', data);
      const response = await apiClient.get<unknown>(`${API}/dashboard?${params.toString()}`);
      return extractPayload<CvDashboard>(response, {} as CvDashboard);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosVoos(filtros?: {
  status?: CvFlightStatus;
  data_inicio?: string;
  data_fim?: string;
  aeronave_id?: number;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['cv-voos', filtros],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros?.status) params.set('status', filtros.status);
      if (filtros?.data_inicio) params.set('data_inicio', filtros.data_inicio);
      if (filtros?.data_fim) params.set('data_fim', filtros.data_fim);
      if (filtros?.aeronave_id) params.set('aeronave_id', String(filtros.aeronave_id));
      if (filtros?.page) params.set('page', String(filtros.page));
      if (filtros?.limit) params.set('limit', String(filtros.limit));
      const qs = params.toString();
      const response = await apiClient.get<unknown>(`${API}/voos${qs ? `?${qs}` : ''}`);
      const body = extractBody<{ success: boolean; data: CvVoo[]; pagination: CvPagination }>(response);
      return { voos: body.data || [], pagination: body.pagination };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosVoo(id: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-voo', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${id}`);
      return extractPayload<CvVoo>(response, null as unknown as CvVoo);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosRdv(vooId: string | number | undefined) {
  return useQuery({
    queryKey: ['cv-rdv', vooId],
    enabled: !!vooId,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/voos/${vooId}/rdv`);
      return extractPayload<CvRdv | null>(response, null);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useControleVoosAeroportos() {
  return useQuery({
    queryKey: ['cv-catalogo-aeroportos'],
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API}/catalogos/aeroportos`);
      return extractPayload<CvAeroporto[]>(response, []);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

// ---- Mutation hooks ----

export function useSalvarRdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vooId, dados }: { vooId: string | number; dados: RdvInput }) => {
      const response = await apiClient.put<unknown>(`${API}/voos/${vooId}/rdv`, dados);
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['cv-rdv', vars.vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv', String(vars.vooId)] });
      void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
    },
  });
}

export function useFinalizarPreenchimentoRdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vooId: string | number) => {
      const response = await apiClient.post<unknown>(`${API}/voos/${vooId}/rdv/finalizar-preenchimento`, {});
      return extractPayload<CvRdv>(response, null as unknown as CvRdv);
    },
    onSuccess: (_, vooId) => {
      void qc.invalidateQueries({ queryKey: ['cv-rdv', vooId] });
      void qc.invalidateQueries({ queryKey: ['cv-rdv', String(vooId)] });
      void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
    },
  });
}

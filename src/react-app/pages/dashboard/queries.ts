import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';
import { API_BASE_URL } from '@/react-app/config/api';
import { tenantQueryKey } from '@/react-app/lib/query-client';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';
import { isResolvedRenewalAlert } from './helpers';
import type {
  DashboardMetrics,
  ComplianceData,
  AlertaRaw,
  AtividadeRecente,
  FrmsAlertaRaw,
  EscalaItem,
  SgsoChecklistData,
  SimuladoresAlertasData,
  TreinamentoPlanejadoItem,
  SessaoSimulador,
  SolicitacaoTreinamentoItem,
} from './types';

const API_BASE = API_BASE_URL;
const STALE_CRITICAL_MS = 3 * 60 * 1000;
const STALE_STANDARD_MS = 8 * 60 * 1000;
const STALE_RELAXED_MS = 12 * 60 * 1000;

function getHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  total?: number;
};

function buildApiError(json: ApiEnvelope<unknown> | null, fallbackMessage: string): Error {
  const message = String(json?.error || fallbackMessage).trim();
  return new Error(message || fallbackMessage);
}

async function readJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<ApiEnvelope<T>> {
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok) {
    throw buildApiError(json, fallbackMessage);
  }
  if (!json?.success) {
    throw buildApiError(json, fallbackMessage);
  }
  return json;
}

function normalizeIsoDate(value: unknown): string {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : '';
}

const BASE_QUERY_BEHAVIOR = {
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: true as const,
};

export const dashboardKeys = {
  all: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard'),
  metrics: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard', 'metrics'),
  compliance: (empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'dashboard', 'compliance'),
  alertas: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard', 'alertas'),
  atividades: (empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'dashboard', 'atividades'),
  frmsAlertas: (empresaId: number | null | undefined, mesInicio: string) =>
    tenantQueryKey(empresaId, 'dashboard', 'frms-alertas', mesInicio),
  sgsoChecklist: (empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'dashboard', 'sgso-checklist'),
  simuladoresAlertas: (empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'dashboard', 'simuladores-alertas'),
  escalas: (empresaId?: number | null) => tenantQueryKey(empresaId, 'dashboard', 'escalas'),
  treinamentos: (empresaId?: number | null) =>
    tenantQueryKey(empresaId, 'dashboard', 'treinamentos-planejados'),
  sessoes: (empresaId: number | null | undefined, today: string) =>
    tenantQueryKey(empresaId, 'dashboard', 'sessoes', today),
};

export function useMetricsQuery(enabled = true) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.metrics(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/metrics`, { headers: getHeaders() });
      const json = await readJsonOrThrow<DashboardMetrics>(res, 'Falha ao buscar métricas');
      return json.data as DashboardMetrics;
    },
    staleTime: STALE_STANDARD_MS,
    enabled,
  });
}

export function useComplianceQuery() {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.compliance(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/compliance-score`, {
        headers: getHeaders(),
      });
      const json = await readJsonOrThrow<ComplianceData>(res, 'Falha ao buscar compliance');
      return json.data as ComplianceData;
    },
    staleTime: STALE_STANDARD_MS,
  });
}

export function useAlertasQuery(enabled = true) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.alertas(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/alertas-criticos`, {
        headers: getHeaders(),
      });
      const json = await readJsonOrThrow<Array<Record<string, unknown>>>(
        res,
        'Falha ao buscar alertas',
      );
      const raw = json.data as Array<Record<string, unknown>>;
      return raw
        .filter((alerta) => !isResolvedRenewalAlert(alerta))
        .map((alerta): AlertaRaw => {
          const tripulanteDireto = String(
            alerta.tripulanteId ?? alerta.tripulante_id ?? alerta.funcionario_id ?? '',
          ).trim();
          return {
            id: String(alerta.id ?? ''),
            tipo: String(alerta.tipo ?? ''),
            criticidade: String(alerta.criticidade ?? ''),
            mensagem: String(alerta.mensagem ?? ''),
            tripulanteNome: String(alerta.tripulanteNome ?? alerta.tripulante_nome ?? '-'),
            tripulanteMatricula: alerta.tripulanteMatricula
              ? String(alerta.tripulanteMatricula)
              : undefined,
            qualificacaoId: alerta.qualificacaoId ? String(alerta.qualificacaoId) : undefined,
            qualificacaoNome: String(alerta.qualificacaoNome ?? alerta.qualificacao_nome ?? '-'),
            dataVencimento: alerta.dataVencimento ? String(alerta.dataVencimento) : undefined,
            diasRestantes: Number(alerta.diasRestantes ?? 0),
            acaoRecomendada: alerta.acaoRecomendada
              ? String(alerta.acaoRecomendada)
              : undefined,
            urlAcao: alerta.urlAcao ? String(alerta.urlAcao) : undefined,
            tripulanteId: tripulanteDireto || undefined,
            renovada: isResolvedRenewalAlert(alerta),
          };
        });
    },
    staleTime: STALE_STANDARD_MS,
    enabled,
  });
}

export function useAtividadesQuery() {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.atividades(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/atividades-recentes`, {
        headers: getHeaders(),
      });
      const json = await readJsonOrThrow<AtividadeRecente[]>(
        res,
        'Falha ao buscar atividades recentes',
      );
      return json.data as AtividadeRecente[];
    },
    staleTime: STALE_RELAXED_MS,
    placeholderData: (prev) => prev,
  });
}

export function useFrmsAlertasQuery(enabled = true) {
  const { empresaId } = useTenantQueryKey();
  const hoje = new Date();
  const mesInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.frmsAlertas(empresaId, mesInicio),
    queryFn: async () => {
      const pageLimit = 200;
      const firstRes = await fetchWithAuth(
        `${API_BASE}/dashboard/frms-alertas?limit=${pageLimit}&data_inicio=${mesInicio}`,
        { headers: getHeaders() },
      );
      const firstJson = await readJsonOrThrow<FrmsAlertaRaw[]>(
        firstRes,
        'Falha ao buscar alertas FRMS',
      );
      const alertas: FrmsAlertaRaw[] = Array.isArray(firstJson.data) ? firstJson.data : [];

      return alertas.filter((f) => {
        const dataMes = normalizeIsoDate(f.data_jornada).slice(0, 7);
        return dataMes === mesAtual;
      });
    },
    staleTime: STALE_CRITICAL_MS,
    enabled,
  });
}

export function useSgsoChecklistQuery(enabled = true) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.sgsoChecklist(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/sgso/next/compliance/rbac121/checklist`, {
        headers: getHeaders(),
      });
      const json = await readJsonOrThrow<SgsoChecklistData>(
        res,
        'Falha ao buscar checklist SGSO',
      );
      return json.data as SgsoChecklistData;
    },
    staleTime: STALE_STANDARD_MS,
    enabled,
  });
}

export function useSimuladoresAlertasQuery(enabled = true) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.simuladoresAlertas(empresaId),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/simuladores-alertas`, {
        headers: getHeaders(),
      });
      const json = await readJsonOrThrow<SimuladoresAlertasData>(
        res,
        'Falha ao buscar alertas de simuladores',
      );
      return json.data as SimuladoresAlertasData;
    },
    staleTime: STALE_CRITICAL_MS,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useEscalasQuery(enabled: boolean) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.escalas(empresaId),
    queryFn: async () => {
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      const res = await fetchWithAuth(
        `${API_BASE}/dashboard/escalas-resumo?mes=${mes}&ano=${ano}`,
        {
          headers: getHeaders(),
        },
      );
      const json = await readJsonOrThrow<EscalaItem[]>(res, 'Falha ao buscar escalas');
      return (Array.isArray(json.data) ? json.data.slice(0, 5) : []) as EscalaItem[];
    },
    staleTime: STALE_RELAXED_MS,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useTreinamentosQuery(enabled: boolean) {
  const { empresaId } = useTenantQueryKey();

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.treinamentos(empresaId),
    queryFn: async () => {
      const hojeIso = new Date().toISOString().slice(0, 10);
      const [treinResult, solResult] = await Promise.allSettled([
        fetchWithAuth(`${API_BASE}/qualificacoes/historico?status=PLANEJADA&limit=50`, {
          headers: getHeaders(),
        }),
        fetchWithAuth(`${API_BASE}/treinamentos/solicitacoes?status=AGENDADA`, {
          headers: getHeaders(),
        }),
      ]);

      const treinRes = treinResult.status === 'fulfilled' ? treinResult.value : null;
      const solRes = solResult.status === 'fulfilled' ? solResult.value : null;

      const treinJson =
        treinRes !== null
          ? await readJsonOrThrow<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>(
              treinRes,
              'Falha ao buscar treinamentos planejados',
            )
          : null;
      const solJson =
        solRes !== null
          ? await readJsonOrThrow<SolicitacaoTreinamentoItem[]>(
              solRes,
              'Falha ao buscar solicitações de treinamento',
            )
          : null;

      if (!treinJson && !solJson) {
        throw new Error('Falha ao carregar treinamentos planejados');
      }

      const treinData = treinJson?.data;
      const treinDataObj =
        treinData && typeof treinData === 'object' && !Array.isArray(treinData)
          ? (treinData as { items?: Record<string, unknown>[] })
          : null;
      const treinRaw = Array.isArray(treinDataObj?.items)
        ? treinDataObj.items
        : Array.isArray(treinData)
          ? (treinData as Record<string, unknown>[])
          : [];

      const diretos: TreinamentoPlanejadoItem[] = treinRaw.map((item) => ({
        id: item.id as number,
        titulo: String(item.tipo_nome ?? item.qualificacao_nome ?? item.tipo ?? ''),
        qualificacao_nome: String(item.qualificacao_nome ?? item.tipo_nome ?? ''),
        data_prevista: String(item.data_realizacao ?? item.data_conclusao ?? ''),
        status: 'PLANEJADO' as const,
        local: item.funcionario_nome ? String(item.funcionario_nome) : null,
        convocados_total: 1,
        confirmados_total: 0,
      }));

      const fallback: TreinamentoPlanejadoItem[] = Array.isArray(solJson?.data)
        ? (solJson.data as SolicitacaoTreinamentoItem[])
            .filter((s) => Boolean(s.data_prevista))
            .map((s) => ({
              id: s.id,
              titulo: s.titulo || s.qualificacao_nome || 'Treinamento agendado',
              qualificacao_nome: s.qualificacao_nome || null,
              data_prevista: String(s.data_prevista),
              status: 'PLANEJADO' as const,
              local: null,
              convocados_total: 1,
              confirmados_total: 0,
            }))
        : [];

      const consolidated = diretos.length > 0 ? diretos : fallback;
      return consolidated
        .filter((item) => normalizeIsoDate(item.data_prevista) >= hojeIso)
        .slice()
        .sort((a, b) =>
          normalizeIsoDate(a.data_prevista).localeCompare(normalizeIsoDate(b.data_prevista)),
        )
        .slice(0, 8);
    },
    staleTime: STALE_RELAXED_MS,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useSessoesSimuladorQuery(enabled: boolean) {
  const { empresaId } = useTenantQueryKey();
  const todayIso = new Date().toISOString().slice(0, 10);

  return useQuery({
    ...BASE_QUERY_BEHAVIOR,
    queryKey: dashboardKeys.sessoes(empresaId, todayIso),
    queryFn: async () => {
      const res = await fetchWithAuth(
        `${API_BASE}/dashboard/proximas-sessoes?data_inicio=${todayIso}&limit=24`,
        { headers: getHeaders() },
      );
      const json = await readJsonOrThrow<Array<Record<string, unknown>>>(
        res,
        'Falha ao buscar próximas sessões',
      );
      const raw = Array.isArray(json.data) ? json.data : [];
      const normalized: SessaoSimulador[] = raw.map((s) => ({
        id: String(s.id ?? ''),
        data: normalizeIsoDate(s.data),
        hora_inicio: String(s.hora_inicio ?? s.horario_inicio ?? '').trim() || null,
        hora_fim: String(s.hora_fim ?? s.horario_fim ?? '').trim() || null,
        tipo_sessao: String(s.tipo_sessao ?? '').trim() || null,
        tema_sessao: String(s.tema_sessao ?? '').trim() || null,
        status: String(s.status ?? '').trim() || null,
        simulador_nome: String(s.simulador_nome ?? '').trim() || null,
        simulador_modelo: String(s.simulador_modelo ?? '').trim() || null,
        instrutor_nome: String(s.instrutor_nome ?? '').trim() || null,
        participantes: [],
      }));
      return normalized
        .filter((s) => {
          const dataStr = normalizeIsoDate(s.data);
          const status = String(s.status ?? '').toUpperCase();
          return dataStr >= todayIso && ['AGENDADO', 'PENDENTE', 'CONFIRMADO'].includes(status);
        })
        .sort((a, b) => {
          const aDate = new Date(
            `${normalizeIsoDate(a.data)}T${String(a.hora_inicio ?? '00:00')}:00`,
          );
          const bDate = new Date(
            `${normalizeIsoDate(b.data)}T${String(b.hora_inicio ?? '00:00')}:00`,
          );
          return aDate.getTime() - bDate.getTime();
        })
        .slice(0, 6);
    },
    staleTime: STALE_CRITICAL_MS,
    enabled,
    placeholderData: (prev) => prev,
  });
}

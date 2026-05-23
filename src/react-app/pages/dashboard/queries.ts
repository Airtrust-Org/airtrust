import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';
import { API_BASE_URL } from '@/react-app/config/api';
import { isResolvedRenewalAlert } from './helpers';
import type {
  DashboardMetrics,
  ComplianceData,
  AlertaRaw,
  AtividadeRecente,
  FrmsAlertaRaw,
  EscalaItem,
  TreinamentoPlanejadoItem,
  SessaoSimulador,
  SolicitacaoTreinamentoItem,
} from './types';

const API_BASE = API_BASE_URL;

function getHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: () => [...dashboardKeys.all, 'metrics'] as const,
  compliance: () => [...dashboardKeys.all, 'compliance'] as const,
  alertas: () => [...dashboardKeys.all, 'alertas'] as const,
  atividades: () => [...dashboardKeys.all, 'atividades'] as const,
  frmsAlertas: (mesInicio: string) => [...dashboardKeys.all, 'frms-alertas', mesInicio] as const,
  escalas: () => [...dashboardKeys.all, 'escalas'] as const,
  treinamentos: () => [...dashboardKeys.all, 'treinamentos-planejados'] as const,
  sessoes: (today: string) => [...dashboardKeys.all, 'sessoes', today] as const,
};

// ─── Individual Query Hooks ─────────────────────────────────────────────────

export function useMetricsQuery() {
  return useQuery({
    queryKey: dashboardKeys.metrics(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/metrics`, { headers: getHeaders() });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Falha ao buscar métricas');
      return json.data as DashboardMetrics;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useComplianceQuery() {
  return useQuery({
    queryKey: dashboardKeys.compliance(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/compliance-score`, { headers: getHeaders() });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Falha ao buscar compliance');
      return json.data as ComplianceData;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAlertasQuery() {
  return useQuery({
    queryKey: dashboardKeys.alertas(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/alertas-criticos`, { headers: getHeaders() });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Falha ao buscar alertas');
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
            tripulanteMatricula: alerta.tripulanteMatricula ? String(alerta.tripulanteMatricula) : undefined,
            qualificacaoId: alerta.qualificacaoId ? String(alerta.qualificacaoId) : undefined,
            qualificacaoNome: String(alerta.qualificacaoNome ?? alerta.qualificacao_nome ?? '-'),
            dataVencimento: alerta.dataVencimento ? String(alerta.dataVencimento) : undefined,
            diasRestantes: Number(alerta.diasRestantes ?? 0),
            acaoRecomendada: alerta.acaoRecomendada ? String(alerta.acaoRecomendada) : undefined,
            urlAcao: alerta.urlAcao ? String(alerta.urlAcao) : undefined,
            tripulanteId: tripulanteDireto || undefined,
            renovada: isResolvedRenewalAlert(alerta),
          };
        });
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAtividadesQuery() {
  return useQuery({
    queryKey: dashboardKeys.atividades(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/dashboard/atividades-recentes`, { headers: getHeaders() });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Falha ao buscar atividades');
      return json.data as AtividadeRecente[];
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useFrmsAlertasQuery() {
  const hoje = new Date();
  const mesInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  return useQuery({
    queryKey: dashboardKeys.frmsAlertas(mesInicio),
    queryFn: async () => {
      const pageLimit = 200;
      // Fetch first page
      const res = await fetchWithAuth(
        `${API_BASE}/frms/alertas?resolvido=false&limit=${pageLimit}&page=1&dataInicio=${mesInicio}`,
        { headers: getHeaders() },
      );
      const json = await res.json();
      let alertas: FrmsAlertaRaw[] = Array.isArray(json.data) ? json.data : [];

      // Fetch remaining pages if needed
      const total = Number(json.total ?? alertas.length ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageLimit));
      if (totalPages > 1) {
        const extraResponses = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, idx) => idx + 2).map((page) =>
            fetchWithAuth(
              `${API_BASE}/frms/alertas?resolvido=false&limit=${pageLimit}&page=${page}&dataInicio=${mesInicio}`,
              { headers: getHeaders() },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        );
        const extras = extraResponses.flatMap((j) =>
          Array.isArray(j?.data) ? (j.data as FrmsAlertaRaw[]) : [],
        );
        const byId = new Map<string, FrmsAlertaRaw>();
        for (const alerta of [...alertas, ...extras]) {
          byId.set(String(alerta.id), alerta);
        }
        alertas = Array.from(byId.values());
      }

      // Filter to current month
      return alertas.filter((f) => {
        const dataMes = String(f.data_jornada ?? '').slice(0, 7);
        return dataMes === mesAtual;
      });
    },
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });
}

export function useEscalasQuery(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.escalas(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/escalas?limit=5`, { headers: getHeaders() });
      const json = await res.json();
      return (Array.isArray(json.data) ? json.data.slice(0, 5) : []) as EscalaItem[];
    },
    staleTime: 5 * 60 * 1000,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useTreinamentosQuery(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.treinamentos(),
    queryFn: async () => {
      const [treinRes, solRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/qualificacoes/historico?status=PLANEJADA&limit=50`, { headers: getHeaders() }).catch(() => null),
        fetchWithAuth(`${API_BASE}/treinamentos/solicitacoes?status=AGENDADA`, { headers: getHeaders() }).catch(() => null),
      ]);

      const treinJson = treinRes?.ok ? await treinRes.json() : null;
      const solJson = solRes?.ok ? await solRes.json() : null;

      const treinRaw = Array.isArray(treinJson?.data?.items)
        ? (treinJson.data.items as Record<string, unknown>[])
        : Array.isArray(treinJson?.data)
          ? (treinJson.data as Record<string, unknown>[])
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
        .slice()
        .sort((a, b) => String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')))
        .slice(0, 8);
    },
    staleTime: 5 * 60 * 1000,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useSessoesSimuladorQuery(enabled: boolean) {
  const todayIso = new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: dashboardKeys.sessoes(todayIso),
    queryFn: async () => {
      const res = await fetchWithAuth(
        `${API_BASE}/simuladores/sessoes?status=AGENDADO&dataInicio=${todayIso}&limit=20`,
        { headers: getHeaders() },
      );
      const json = await res.json();
      const raw = Array.isArray(json.data) ? (json.data as SessaoSimulador[]) : [];
      return raw
        .filter((s) => {
          const dataStr = String(s.data || '').split('T')[0];
          return dataStr >= todayIso;
        })
        .sort((a, b) => new Date(String(a.data || '')).getTime() - new Date(String(b.data || '')).getTime())
        .slice(0, 6);
    },
    staleTime: 5 * 60 * 1000,
    enabled,
    placeholderData: (prev) => prev,
  });
}

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  PlaneTakeoff,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { WidgetError } from '../components/UI/widget-states';

const API_BASE = API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardMetrics {
  tripulantesAtivos: number;
  tripulantesComQualificacoesVencendo: number;
  tripulantesComQualificacoesVencidas: number;
  qualificacoesAVencer: number;
  qualificacoesVencidas: number;
  qualificacoesValidas: number;
  totalQualificacoes: number;
  demandaFutura30Dias: number;
  demandaFutura60Dias: number;
  demandaFutura90Dias: number;
  lms?: {
    totalCursos: number;
    totalMatriculas: number;
    concluidos: number;
    emAndamento: number;
    taxaConclusaoPct: number;
  };
}

interface ComplianceData {
  scoreGeral: number;
  scoreFinal?: number;
  metaOrganizacional: number;
  qualificacoesValidas: number;
  totalQualificacoes: number;
  breakdown: Record<string, number>;
}

interface AlertaRaw {
  id: string;
  tipo: string;
  criticidade: string;
  mensagem: string;
  tripulanteId?: string;
  tripulanteNome: string;
  tripulanteMatricula?: string;
  qualificacaoId?: string;
  qualificacaoNome: string;
  dataVencimento?: string;
  diasRestantes: number;
  acaoRecomendada?: string;
  urlAcao?: string;
  renovada?: boolean;
}

interface AtividadeRecente {
  id: string;
  tipo: string;
  descricao: string;
  tripulanteNome: string;
  tripulanteMatricula?: string;
  timestamp: string;
  icone?: string;
  cor?: string;
}

interface FrmsAlertaRaw {
  id: string;
  tripulante_id: string;
  nivel: 'AVISO' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
  descricao?: string;
  tipo?: string;
  data_jornada?: string;
  nome_tripulante?: string;
  resolvido?: number;
}

interface EscalaItem {
  id: string;
  mes: number;
  ano: number;
  status: 'rascunho' | 'em_revisao' | 'aprovada' | 'publicada';
  total_tripulacoes?: number;
}

interface TreinamentoPlanejadoItem {
  id: number | string;
  titulo?: string | null;
  qualificacao_nome?: string | null;
  data_prevista: string;
  status: 'PLANEJADO' | 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  local?: string | null;
  convocados_total?: number;
  confirmados_total?: number;
}

interface SolicitacaoTreinamentoItem {
  id: string;
  titulo?: string | null;
  qualificacao_nome?: string | null;
  data_prevista?: string | null;
  status?: string | null;
}

interface SessaoSimulador {
  id: string;
  data: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  tipo_sessao?: string | null;
  tema_sessao?: string | null;
  status?: string | null;
  simulador_nome?: string | null;
  simulador_modelo?: string | null;
  instrutor_nome?: string | null;
  participantes?: Array<{ id: number; nome: string; funcao?: string }> | string;
}

interface SectionErrors {
  metrics: string | null;
  compliance: string | null;
}

interface DashboardState {
  metrics: DashboardMetrics | null;
  compliance: ComplianceData | null;
  alertas: AlertaRaw[];
  atividades: AtividadeRecente[];
  frmsAlertas: FrmsAlertaRaw[];
  escalas: EscalaItem[];
  treinamentosPlanejados: TreinamentoPlanejadoItem[];
  sessoesSimulador: SessaoSimulador[];
  isLoading: boolean;
  isRevalidating: boolean;
  error: string | null;
  sectionErrors: SectionErrors;
  lastUpdated: Date | null;
}

function isResolvedRenewalAlert(alerta: Record<string, unknown>) {
  const boolFlags = [
    alerta.renovada,
    alerta.is_renovada,
    alerta.eh_renovada,
    alerta.qualificacao_renovada,
  ];
  if (boolFlags.some((value) => value === true || value === 1 || value === '1')) return true;

  const status = String(alerta.status ?? alerta.status_qualificacao ?? '').trim().toUpperCase();
  if (status === 'RENOVADA' || status === 'RENOVADO') return true;

  const rawText = [
    alerta.mensagem,
    alerta.tipo,
    alerta.qualificacaoNome,
    alerta.qualificacao_nome,
  ]
    .map((value) => String(value ?? ''))
    .join(' ')
    .toUpperCase();
  return rawText.includes('RENOVAD');
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ESCALA_STATUS_CONF = {
  rascunho: { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600' },
  em_revisao: { label: 'Em revisão', cls: 'bg-amber-50 text-amber-700' },
  aprovada: { label: 'Aprovada', cls: 'bg-blue-50 text-blue-700' },
  publicada: { label: 'Publicada', cls: 'bg-emerald-50 text-emerald-700' },
};

const MESES_ABR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const FRMS_NIVEL_CONF = {
  VIOLACAO: { label: 'Violação', cls: 'bg-red-100 text-red-700', dot: 'bg-red-600' },
  CRITICO: { label: 'Crítico', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  ATENCAO: { label: 'Atenção', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  AVISO: { label: 'Aviso', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};
const PASSIVE_REFETCH_GUARD_MS = 45_000;

// ─── Data hook ────────────────────────────────────────────────────────────────

function useDashboardData() {
  const [state, setState] = React.useState<DashboardState>({
    metrics: null,
    compliance: null,
    alertas: [],
    atividades: [],
    frmsAlertas: [],
    escalas: [],
    treinamentosPlanejados: [],
    sessoesSimulador: [],
    isLoading: true,
    isRevalidating: false,
    error: null,
    sectionErrors: { metrics: null, compliance: null },
    lastUpdated: null,
  });

  const token = getAccessToken();
  const isMountedRef = React.useRef(true);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const lastPassiveRefreshRef = React.useRef(0);

  type FetchReason = 'initial' | 'manual' | 'poll' | 'visibility' | 'focus';
  const fetchData = React.useCallback(async (reason: FetchReason = 'manual') => {
    if (!token) {
      if (isMountedRef.current)
        setState((prev) => ({ ...prev, isLoading: false, error: 'Sessão expirada.' }));
      return;
    }
    if (reason === 'visibility' || reason === 'focus') {
      const now = Date.now();
      if (now - lastPassiveRefreshRef.current < PASSIVE_REFETCH_GUARD_MS) return;
      lastPassiveRefreshRef.current = now;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isMountedRef.current)
        setState((prev) => ({
          ...prev,
          isLoading: prev.metrics === null && prev.compliance === null,
          isRevalidating: prev.metrics !== null || prev.compliance !== null,
          error: null,
          sectionErrors: { metrics: null, compliance: null },
        }));

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const opts = { headers, signal: controller.signal };
      const todayIso = new Date().toISOString().split('T')[0];
      const frmsPageLimit = 200;
      const hoje = new Date();
      const mesInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

      // Primeira carga: blocos essenciais para liberar o painel principal.
      const [metricsRes, complianceRes, alertasRes, atividadesRes] = await Promise.all([
        fetch(`${API_BASE}/dashboard/metrics`, opts).catch(() => null),
        fetch(`${API_BASE}/dashboard/compliance-score`, opts).catch(() => null),
        fetch(`${API_BASE}/dashboard/alertas-criticos`, opts).catch(() => null),
        fetch(`${API_BASE}/dashboard/atividades-recentes`, opts).catch(() => null),
      ]);

      if (controller.signal.aborted || !isMountedRef.current) return;

      const metricsJson = metricsRes?.ok ? await metricsRes.json() : null;
      const complianceJson = complianceRes?.ok ? await complianceRes.json() : null;
      const alertasJson = alertasRes?.ok ? await alertasRes.json() : null;
      const atividadesJson = atividadesRes?.ok ? await atividadesRes.json() : null;

      const newSectionErrors: SectionErrors = {
        metrics: !metricsJson?.success
          ? (metricsJson?.error ?? 'Falha ao buscar métricas do painel')
          : null,
        compliance: !complianceJson?.success
          ? (complianceJson?.error ?? 'Falha ao buscar dados de compliance')
          : null,
      };

      const alertasNormalizados: AlertaRaw[] = Array.isArray(alertasJson?.data)
        ? (alertasJson.data as Array<Record<string, unknown>>)
            .filter((alerta) => !isResolvedRenewalAlert(alerta))
            .map((alerta) => {
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
                acaoRecomendada: alerta.acaoRecomendada ? String(alerta.acaoRecomendada) : undefined,
                urlAcao: alerta.urlAcao ? String(alerta.urlAcao) : undefined,
                tripulanteId: tripulanteDireto || undefined,
                renovada: isResolvedRenewalAlert(alerta),
              };
            })
        : [];

      if (isMountedRef.current && !controller.signal.aborted) {
        setState((prev) => ({
          // Keep stale data if section failed; use fresh data otherwise.
          metrics: newSectionErrors.metrics ? prev.metrics : (metricsJson?.data ?? null),
          compliance: newSectionErrors.compliance
            ? prev.compliance
            : (complianceJson?.data ?? null),
          alertas: alertasNormalizados,
          atividades: Array.isArray(atividadesJson?.data) ? atividadesJson.data : prev.atividades,
          isLoading: false,
          isRevalidating: true,
          error: null,
          sectionErrors: newSectionErrors,
          lastUpdated: new Date(),
        }));
      }

      // Segunda carga: dados secundários e listas maiores sem bloquear o primeiro paint.
      const [frmsRes, escalasRes, treinamentosRes, solicitacoesRes, sessoesSimRes] = await Promise.all([
        fetch(
          `${API_BASE}/frms/alertas?resolvido=false&limit=${frmsPageLimit}&page=1&dataInicio=${mesInicio}`,
          opts,
        ).catch(() => null),
        fetch(`${API_BASE}/escalas?limit=5`, opts).catch(() => null),
        fetch(`${API_BASE}/qualificacoes/historico?status=PLANEJADA&limit=50`, opts).catch(
          () => null,
        ),
        fetch(`${API_BASE}/treinamentos/solicitacoes?status=AGENDADA`, opts).catch(() => null),
        fetch(
          `${API_BASE}/simuladores/sessoes?status=AGENDADO&dataInicio=${todayIso}&limit=20`,
          opts,
        ).catch(() => null),
      ]);

      if (controller.signal.aborted || !isMountedRef.current) return;

      const frmsJson = frmsRes?.ok ? await frmsRes.json() : null;
      const escalasJson = escalasRes?.ok ? await escalasRes.json() : null;
      const treinamentosJson = treinamentosRes?.ok ? await treinamentosRes.json() : null;
      const solicitacoesJson = solicitacoesRes?.ok ? await solicitacoesRes.json() : null;
      const sessoesSimJson = sessoesSimRes?.ok ? await sessoesSimRes.json() : null;

      const treinamentosRaw = Array.isArray(treinamentosJson?.data?.items)
        ? (treinamentosJson.data.items as Record<string, unknown>[])
        : Array.isArray(treinamentosJson?.data)
          ? (treinamentosJson.data as Record<string, unknown>[])
          : [];
      const treinamentosDiretos: TreinamentoPlanejadoItem[] = treinamentosRaw.map((item) => ({
        id: item.id as number,
        titulo: String(item.tipo_nome ?? item.qualificacao_nome ?? item.tipo ?? ''),
        qualificacao_nome: String(item.qualificacao_nome ?? item.tipo_nome ?? ''),
        data_prevista: String(item.data_realizacao ?? item.data_conclusao ?? ''),
        status: 'PLANEJADO' as const,
        local: item.funcionario_nome ? String(item.funcionario_nome) : null,
        convocados_total: 1,
        confirmados_total: 0,
      }));

      const treinamentosFallback = Array.isArray(solicitacoesJson?.data)
        ? (solicitacoesJson.data as SolicitacaoTreinamentoItem[])
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

      const treinamentosConsolidados =
        treinamentosDiretos.length > 0 ? treinamentosDiretos : treinamentosFallback;

      let frmsAlertasConsolidados: FrmsAlertaRaw[] = Array.isArray(frmsJson?.data)
        ? (frmsJson.data as FrmsAlertaRaw[])
        : [];
      const frmsTotal = Number(frmsJson?.total ?? frmsAlertasConsolidados.length ?? 0);
      const frmsTotalPages = Math.max(1, Math.ceil(frmsTotal / frmsPageLimit));

      if (frmsTotalPages > 1) {
        const extraPages = Array.from({ length: frmsTotalPages - 1 }, (_, idx) => idx + 2);
        const extraResponses = await Promise.all(
          extraPages.map((page) =>
            fetch(
              `${API_BASE}/frms/alertas?resolvido=false&limit=${frmsPageLimit}&page=${page}&dataInicio=${mesInicio}`,
              opts,
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        );

        const extras = extraResponses.flatMap((json) =>
          Array.isArray(json?.data) ? (json.data as FrmsAlertaRaw[]) : [],
        );

        const byId = new Map<string, FrmsAlertaRaw>();
        for (const alerta of [...frmsAlertasConsolidados, ...extras]) {
          byId.set(String(alerta.id), alerta);
        }
        frmsAlertasConsolidados = Array.from(byId.values());
      }

      frmsAlertasConsolidados = frmsAlertasConsolidados.filter((f) => {
        const dataMes = String(f.data_jornada ?? '').slice(0, 7);
        return dataMes === mesAtual;
      });

      if (isMountedRef.current && !controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          frmsAlertas: frmsAlertasConsolidados,
          escalas: Array.isArray(escalasJson?.data) ? escalasJson.data.slice(0, 5) : prev.escalas,
          treinamentosPlanejados: treinamentosConsolidados
            .slice()
            .sort((a: TreinamentoPlanejadoItem, b: TreinamentoPlanejadoItem) =>
              String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')),
            )
            .slice(0, 8),
          sessoesSimulador: Array.isArray(sessoesSimJson?.data)
            ? (sessoesSimJson.data as SessaoSimulador[])
                .filter((s) => {
                  const dataStr = String(s.data || '').split('T')[0];
                  return dataStr >= todayIso;
                })
                .sort(
                  (a, b) =>
                    new Date(String(a.data || '')).getTime() -
                    new Date(String(b.data || '')).getTime(),
                )
                .slice(0, 6)
            : prev.sessoesSimulador,
          isRevalidating: false,
          lastUpdated: new Date(),
        }));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (isMountedRef.current && !controller.signal.aborted)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRevalidating: false,
          error: err instanceof Error ? err.message : 'Erro ao carregar painel',
        }));
    }
  }, [token]);

  React.useEffect(() => {
    isMountedRef.current = true;
    void fetchData('initial');

    const handleVisibilityChange = () => {
      if (!document.hidden) void fetchData('visibility');
    };
    const handleFocus = () => void fetchData('focus');
    // Revalida em background a cada 5 minutos sem bloquear UI
    const pollInterval = setInterval(() => void fetchData('poll'), 5 * 60 * 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchData]);

  return { ...state, refresh: () => fetchData('manual') };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours} h`;
  if (days < 7) return `há ${days} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getOperationStatus(complianceScore: number) {
  if (complianceScore >= 90)
    return { label: 'OPERACAO NORMAL', tone: 'border-emerald-500 text-emerald-700' };
  if (complianceScore >= 60)
    return { label: 'OPERACAO EM ATENCAO', tone: 'border-amber-500 text-amber-700' };
  return { label: 'OPERACAO SOB PRESSAO', tone: 'border-red-500 text-red-700' };
}

function safePct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function dateDiffInDays(dateOnly: string, base: Date) {
  const target = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.floor((target.getTime() - base.getTime()) / 86400000);
}

function isCriticalFrms(nivel: FrmsAlertaRaw['nivel']) {
  return nivel === 'CRITICO' || nivel === 'VIOLACAO';
}

function resolveTripulanteIdFromAlerta(alerta: AlertaRaw): string | null {
  const direct = String(alerta.tripulanteId || '').trim();
  if (direct) return direct;
  const fromUrl = String(alerta.urlAcao || '').match(/\/(?:tripulante|funcionarios?)\/(\d+)/i)?.[1];
  return fromUrl || null;
}

function CriticalPendenciasLinkCard({
  totalCritical,
  frmsCriticalCount,
  tripulantesEmRiscoFrms,
  certVencidas,
}: {
  totalCritical: number;
  frmsCriticalCount: number;
  tripulantesEmRiscoFrms: number;
  certVencidas: number;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Pendencias prioritarias
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {totalCritical} pendencia(s) critica(s) em acompanhamento
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {certVencidas} qualificacao(oes) vencida(s) • {tripulantesEmRiscoFrms} tripulante(s)
            FRMS em nivel critico ({frmsCriticalCount} alerta(s))
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/qualificacoes/alertas"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Ver qualificacoes <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/frms/alertas"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
          >
            Ver FRMS <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function FatigueRiskCard({ frmsAlertas }: { frmsAlertas: FrmsAlertaRaw[] }) {
  const byTripulante = new Map<
    string,
    { nome: string; nivel: FrmsAlertaRaw['nivel']; detalhe: string; tripulanteId: string }
  >();

  for (const alerta of frmsAlertas) {
    const key = String(alerta.tripulante_id);
    const current = byTripulante.get(key);
    const currentWeight = current
      ? current.nivel === 'VIOLACAO'
        ? 4
        : current.nivel === 'CRITICO'
          ? 3
          : current.nivel === 'ATENCAO'
            ? 2
            : 1
      : 0;
    const nextWeight =
      alerta.nivel === 'VIOLACAO'
        ? 4
        : alerta.nivel === 'CRITICO'
          ? 3
          : alerta.nivel === 'ATENCAO'
            ? 2
            : 1;

    if (!current || nextWeight > currentWeight) {
      byTripulante.set(key, {
        nome: alerta.nome_tripulante || `Tripulante ${alerta.tripulante_id}`,
        nivel: alerta.nivel,
        detalhe: alerta.descricao || alerta.tipo || 'Alerta FRMS',
        tripulanteId: String(alerta.tripulante_id),
      });
    }
  }

  const itens = Array.from(byTripulante.values())
    .sort((a, b) => {
      const weightA =
        a.nivel === 'VIOLACAO' ? 4 : a.nivel === 'CRITICO' ? 3 : a.nivel === 'ATENCAO' ? 2 : 1;
      const weightB =
        b.nivel === 'VIOLACAO' ? 4 : b.nivel === 'CRITICO' ? 3 : b.nivel === 'ATENCAO' ? 2 : 1;
      return weightB - weightA;
    })
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
          Tripulantes em risco FRMS
        </h3>
      </div>
      {itens.length === 0 ? (
        <p className="px-4 py-5 text-xs text-slate-500">Sem alertas de fadiga no período.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {itens.map((item) => (
            <Link
              key={`${item.tripulanteId}-${item.nivel}`}
              to={`/frms/tripulante/${item.tripulanteId}`}
              className="block px-4 py-3 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-900">{item.nome}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${FRMS_NIVEL_CONF[item.nivel].cls}`}
                >
                  {item.nivel}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-500">{item.detalhe}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineResolucaoCard({
  treinamentos,
  sessoes,
  metrics,
}: {
  treinamentos: TreinamentoPlanejadoItem[];
  sessoes: SessaoSimulador[];
  metrics: DashboardMetrics;
}) {
  const itensTreino = treinamentos.slice(0, 4);
  const itensSessoes = sessoes.slice(0, 3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
          Pipeline de resolução
        </h3>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Qualificações planejadas
            </p>
            <Link
              to="/qualificacoes?tab=planejados"
              className="text-[10px] font-bold text-blue-700 hover:underline"
            >
              Ver lista
            </Link>
          </div>
          <div className="space-y-2">
            {itensTreino.length === 0 ? (
              <p className="text-xs text-slate-400">Sem treinamentos planejados.</p>
            ) : (
              itensTreino.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {item.titulo?.trim() || item.qualificacao_nome || 'Treinamento planejado'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(`${item.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')} •{' '}
                    {item.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Próximas sessões de simulador
          </p>
          <div className="space-y-2">
            {itensSessoes.length === 0 ? (
              <p className="text-xs text-slate-400">Sem sessões nos próximos 30 dias.</p>
            ) : (
              itensSessoes.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {s.tema_sessao || s.tipo_sessao || 'Sessão de simulador'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(`${s.data}T00:00:00`).toLocaleDateString('pt-BR')} •{' '}
                    {s.hora_inicio || '--:--'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">LMS</p>
          <p className="mt-0.5 text-xs font-semibold text-blue-900">
            {metrics.lms?.emAndamento ?? 0} matrícula(s) em andamento
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-screen-2xl animate-pulse space-y-5 px-4 py-6 md:px-6">
      {/* Module shortcuts — 6 cards in xl, 3 in md, 2 in base */}
      <div className="rounded-3xl border border-slate-200 bg-slate-100 p-3 sm:p-4 lg:p-5">
        <div className="mb-3 h-4 w-32 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[124px] rounded-2xl bg-slate-200 sm:h-[132px]" />
          ))}
        </div>
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-48 rounded bg-slate-200" />
        <div className="flex gap-3">
          <div className="h-9 w-36 rounded-xl bg-slate-200" />
          <div className="h-9 w-24 rounded-xl bg-slate-200" />
        </div>
      </div>

      {/* Main grid — mirrors lg:grid-cols-12 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Compliance col-span-4 */}
        <div className="h-56 rounded-2xl bg-slate-200 lg:col-span-4" />
        {/* FRMS donut col-span-4 */}
        <div className="h-56 rounded-2xl bg-slate-200 lg:col-span-4" />
        {/* 3 stat cards col-span-4 */}
        <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-200 lg:h-auto lg:flex-1" />
          ))}
        </div>
      </div>

      {/* Second grid — mirrors lg:grid-cols-12 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Alerts col-span-5 */}
        <div className="h-72 rounded-2xl bg-slate-200 lg:col-span-5" />
        {/* Trainings + sessoes col-span-4 */}
        <div className="space-y-4 lg:col-span-4">
          <div className="h-44 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
        </div>
        {/* Escalas + activity col-span-3 */}
        <div className="space-y-4 lg:col-span-3">
          <div className="h-32 rounded-2xl bg-slate-200" />
          <div className="h-40 rounded-2xl bg-slate-200" />
        </div>
      </div>

      {/* Footer strip */}
      <div className="h-16 rounded-2xl bg-slate-200" />
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <div className={`rounded-r-xl border-l-4 px-4 py-2 bg-white shadow-sm ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
      <p className="text-sm font-bold uppercase">{label}</p>
    </div>
  );
}

function OperationsOverview({
  metrics,
  compliance,
  frmsAlertas,
  treinamentos,
}: {
  metrics: DashboardMetrics;
  compliance: ComplianceData;
  frmsAlertas: FrmsAlertaRaw[];
  treinamentos: TreinamentoPlanejadoItem[];
}) {
  const tripulantesEmDia = Math.max(
    metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas,
    0,
  );
  const score = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  const meta = compliance.metaOrganizacional || 90;
  const tripulantesEmDiaPct = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  const tripulantesComVencimentoPct = safePct(
    metrics.tripulantesComQualificacoesVencendo,
    metrics.tripulantesAtivos,
  );

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const treinamentosPeriodo = treinamentos.filter(
    (t) => dateDiffInDays(String(t.data_prevista || ''), hoje) >= 0,
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Visao geral
            </p>
            <p className="mt-0.5 text-xl font-black leading-none text-slate-900">{score}%</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Compliance {score >= meta ? 'acima' : 'abaixo'} da meta {meta}%
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Tripulantes em dia
            </span>
            <span>{tripulantesEmDiaPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.max(4, tripulantesEmDiaPct)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Com vencimento em 30 dias
            </span>
            <span>{tripulantesComVencimentoPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${Math.max(4, tripulantesComVencimentoPct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
        {metrics.demandaFutura30Dias > 0 ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
            {metrics.demandaFutura30Dias} em 30 dias
          </span>
        ) : null}
        {metrics.demandaFutura60Dias > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
            {metrics.demandaFutura60Dias} em 60 dias
          </span>
        ) : null}
        {metrics.demandaFutura90Dias > 0 ? (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
            {metrics.demandaFutura90Dias} em 90 dias
          </span>
        ) : null}
        {treinamentosPeriodo > 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            {treinamentosPeriodo} planejado(s)
          </span>
        ) : null}
      </div>
    </section>
  );
}

function FrmsRiskDonut({ frmsAlertas }: { frmsAlertas: FrmsAlertaRaw[] }) {
  const navigate = useNavigate();
  const mesLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const data = [
    { nivel: 'VIOLACAO' as const, name: 'Violação', value: 0, color: '#dc2626' },
    { nivel: 'CRITICO' as const, name: 'Crítico', value: 0, color: '#ef4444' },
    { nivel: 'ATENCAO' as const, name: 'Atenção', value: 0, color: '#f59e0b' },
    { nivel: 'AVISO' as const, name: 'Aviso', value: 0, color: '#94a3b8' },
  ].map((item) => ({
    ...item,
    value: frmsAlertas.filter((f) => f.nivel === item.nivel).length,
  }));

  const total = data.reduce((acc, item) => acc + item.value, 0);
  const center = 72;
  const outerRadius = 62;
  const innerRadius = 36;

  function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  }

  function describeArc(startAngle: number, endAngle: number) {
    const startOuter = polarToCartesian(center, center, outerRadius, endAngle);
    const endOuter = polarToCartesian(center, center, outerRadius, startAngle);
    const startInner = polarToCartesian(center, center, innerRadius, endAngle);
    const endInner = polarToCartesian(center, center, innerRadius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
      'Z',
    ].join(' ');
  }

  const segments = (() => {
    if (total === 0) {
      return [
        {
          key: 'EMPTY',
          path: describeArc(0, 359.999),
          color: '#e2e8f0',
          nivel: null as string | null,
        },
      ];
    }

    let angle = 0;
    return data
      .filter((item) => item.value > 0)
      .map((item) => {
        const sweep = (item.value / total) * 360;
        const startAngle = angle;
        const endAngle = angle + sweep;
        angle = endAngle;
        return {
          key: item.nivel,
          path: describeArc(startAngle, endAngle),
          color: item.color,
          nivel: item.nivel,
        };
      });
  })();

  return (
    <section className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            FRMS · {mesLabel}
          </p>
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
            Distribuicao de alertas
          </h3>
        </div>
        <Link to="/frms/alertas" className="text-xs font-bold text-blue-700 hover:underline">
          Ver painel
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 144 144" className="h-36 w-36">
            {segments.map((segment) => (
              <path
                key={segment.key}
                d={segment.path}
                fill={segment.color}
                className={
                  segment.nivel ? 'cursor-pointer transition-opacity hover:opacity-80' : ''
                }
                onClick={() => {
                  if (segment.nivel) navigate(`/frms/alertas?nivel=${segment.nivel}`);
                }}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-center">
            <p className="text-xl font-black text-slate-900">{total}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Alertas
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {data.map((item) => (
            <Link
              key={item.nivel}
              to={`/frms/alertas?nivel=${item.nivel}`}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                <span className="text-xs font-medium text-slate-700">{item.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-900">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <Link
          to="/frms/alertas"
          className="flex items-center justify-between text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <span>Abrir modulo FRMS completo</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  icon,
  tone,
  detail,
  href,
  progress,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  tone: 'green' | 'amber' | 'blue' | 'red';
  detail: string;
  href: string;
  progress?: number;
}) {
  const colors = {
    green: {
      value: 'text-emerald-700',
      bar: 'bg-emerald-500',
      chip: 'bg-emerald-50 text-emerald-700',
    },
    amber: { value: 'text-amber-600', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700' },
    blue: { value: 'text-blue-700', bar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700' },
    red: { value: 'text-red-700', bar: 'bg-red-500', chip: 'bg-red-50 text-red-700' },
  }[tone];

  return (
    <Link
      to={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <div className={`rounded-xl p-1.5 ${colors.chip}`}>{icon}</div>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-3xl font-extrabold leading-none tracking-tight ${colors.value}`}>
          {value}
        </span>
        {suffix ? <span className="pb-0.5 text-sm font-bold text-slate-400">{suffix}</span> : null}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
      {typeof progress === 'number' ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${colors.bar}`}
            style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </Link>
  );
}

// Tabela compacta de todos os alertas de qualificação ordenados por criticidade
function AlertsTable({ alertas }: { alertas: AlertaRaw[] }) {
  const sorted = [...alertas].sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 5);

  function criticidadeBadge(dias: number) {
    if (dias <= 0) return { label: 'Expirada', cls: 'bg-red-100 text-red-700' };
    if (dias <= 7) return { label: `${dias}d`, cls: 'bg-red-100 text-red-700' };
    if (dias <= 15) return { label: `${dias}d`, cls: 'bg-amber-100 text-amber-700' };
    return { label: `${dias}d`, cls: 'bg-slate-100 text-slate-600' };
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-slate-500" />
          <h3 className="text-base font-extrabold tracking-tight text-slate-900">
            Alertas de qualificação
          </h3>
        </div>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8">
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-slate-700">Nenhum alerta ativo</p>
            <p className="text-xs text-slate-400">Todas as qualificações estão em dia.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map((a) => {
            const badge = criticidadeBadge(a.diasRestantes);
            const tripulanteId = resolveTripulanteIdFromAlerta(a);
            const fichaUrl = tripulanteId ? `/funcionarios/${tripulanteId}/ficha` : null;
            return (
              <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/60">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600">
                  {initials(a.tripulanteNome)}
                </div>
                <div className="min-w-0 flex-1">
                  {fichaUrl ? (
                    <Link
                      to={fichaUrl}
                      className="truncate text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {a.tripulanteNome}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {a.tripulanteNome}
                    </p>
                  )}
                  <p className="truncate text-xs text-slate-500">{a.qualificacaoNome}</p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
                >
                  {badge.label}
                </span>
                <Link
                  to={a.urlAcao || '/qualificacoes/alertas'}
                  className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-700"
                >
                  Ação
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlannedTrainingsCard({ treinamentos }: { treinamentos: TreinamentoPlanejadoItem[] }) {
  const hoje = new Date();
  const sorted = [...treinamentos]
    .sort((a, b) => String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')))
    .slice(0, 7);

  const getChip = (dataPrevista: string) => {
    const data = new Date(`${dataPrevista}T00:00:00`);
    const diff = Math.floor((data.getTime() - hoje.getTime()) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d atraso`, cls: 'bg-red-100 text-red-700' };
    if (diff <= 7) return { label: `${diff}d`, cls: 'bg-amber-100 text-amber-700' };
    return { label: `${diff}d`, cls: 'bg-blue-100 text-blue-700' };
  };

  const titleFor = (item: TreinamentoPlanejadoItem) =>
    item.titulo?.trim() || item.qualificacao_nome || 'Treinamento planejado';

  const statusStats = sorted.reduce(
    (acc, item) => {
      const status = item.status || 'PLANEJADO';
      if (status === 'PLANEJADO') acc.planejado += 1;
      if (status === 'CONFIRMADO') acc.confirmado += 1;
      if (status === 'EM_ANDAMENTO') acc.emAndamento += 1;
      if (status === 'CONCLUIDO') acc.concluido += 1;
      if (status === 'CANCELADO') acc.cancelado += 1;
      return acc;
    },
    { planejado: 0, confirmado: 0, emAndamento: 0, concluido: 0, cancelado: 0 },
  );
  const totalStats = Math.max(
    1,
    statusStats.planejado +
      statusStats.confirmado +
      statusStats.emAndamento +
      statusStats.concluido +
      statusStats.cancelado,
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          <h3 className="text-base font-extrabold tracking-tight text-slate-900">
            Treinamentos planejados
          </h3>
        </div>
        <Link
          to="/qualificacoes?tab=planejados"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Ver agenda <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="px-5 py-3 border-b border-slate-100">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Distribuição por status
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="flex h-full w-full">
            <div
              className="bg-blue-500"
              style={{ width: `${(statusStats.planejado / totalStats) * 100}%` }}
            />
            <div
              className="bg-emerald-500"
              style={{ width: `${(statusStats.confirmado / totalStats) * 100}%` }}
            />
            <div
              className="bg-violet-500"
              style={{ width: `${(statusStats.emAndamento / totalStats) * 100}%` }}
            />
            <div
              className="bg-slate-600"
              style={{ width: `${(statusStats.concluido / totalStats) * 100}%` }}
            />
            <div
              className="bg-rose-500"
              style={{ width: `${(statusStats.cancelado / totalStats) * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <span>Planejado: {statusStats.planejado}</span>
          <span>Confirmado: {statusStats.confirmado}</span>
          <span>Em andamento: {statusStats.emAndamento}</span>
          <span>Concluído: {statusStats.concluido}</span>
          <span>Cancelado: {statusStats.cancelado}</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-xs text-slate-400">Nenhum treinamento planejado ativo.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map((item) => {
            const chip = getChip(item.data_prevista);
            const dataFmt = new Date(`${item.data_prevista}T00:00:00`).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            });

            return (
              <Link
                key={item.id}
                to="/qualificacoes?tab=planejados"
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-bold text-blue-700">
                  {dataFmt}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{titleFor(item)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.local || 'Local a definir'}
                    {' • '}
                    {item.confirmados_total ?? 0}/{item.convocados_total ?? 0} confirmados
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${chip.cls}`}>
                  {chip.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// FRMS por nível + atalhos
function FrmsSummary({ frmsAlertas }: { frmsAlertas: FrmsAlertaRaw[] }) {
  const niveis = (['VIOLACAO', 'CRITICO', 'ATENCAO', 'AVISO'] as const).map((nivel) => ({
    nivel,
    conf: FRMS_NIVEL_CONF[nivel],
    count: frmsAlertas.filter((f) => f.nivel === nivel).length,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">FRMS — Fadiga</h3>
        </div>
        <Link
          to="/frms/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Ver painel <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-slate-50">
        {niveis.map(({ nivel, conf, count }) => (
          <Link
            key={nivel}
            to="/frms/alertas"
            className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${conf.dot}`} />
              <span className="text-xs font-medium text-slate-700">{conf.label}</span>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${count > 0 ? conf.cls : 'bg-slate-100 text-slate-400'}`}
            >
              {count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Escalas recentes com status
function EscalasSummary({ escalas }: { escalas: EscalaItem[] }) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const escalasRelevantes = escalas
    .filter((e) => {
      if (e.ano > anoAtual) return true;
      if (e.ano === anoAtual && e.mes >= mesAtual) return true;
      return false;
    })
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <PlaneTakeoff className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">Escalas</h3>
        </div>
        <Link
          to="/escalas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Gerenciar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {escalasRelevantes.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400">Nenhuma escala encontrada.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {escalasRelevantes.map((e) => {
            const conf = ESCALA_STATUS_CONF[e.status] ?? ESCALA_STATUS_CONF.rascunho;
            return (
              <Link
                key={e.id}
                to="/escalas"
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <span className="text-xs font-semibold text-slate-700">
                  {MESES_ABR[(e.mes - 1) % 12]}/{String(e.ano).slice(2)}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${conf.cls}`}>
                  {conf.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function participantsCount(sessao: SessaoSimulador): number {
  if (Array.isArray(sessao.participantes)) return sessao.participantes.length;
  if (typeof sessao.participantes === 'string') {
    try {
      const parsed = JSON.parse(sessao.participantes) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function SessoesSimuladorCard({ sessoes }: { sessoes: SessaoSimulador[] }) {
  const hoje = new Date().toISOString().split('T')[0];
  const sessoesFuturas = sessoes.filter((s) => String(s.data || '').split('T')[0] >= hoje);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">Próximas sessões</h3>
        </div>
        <Link
          to="/simuladores"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Ver agenda <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {sessoesFuturas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">
          Nenhuma sessão de simulador nos próximos 30 dias.
        </p>
      ) : (
        <div className="divide-y divide-slate-50">
          {sessoesFuturas.slice(0, 5).map((sessao) => (
            <Link
              key={sessao.id}
              to="/simuladores"
              className="block px-5 py-3 transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de simulador'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {new Date(`${sessao.data}T00:00:00`).toLocaleDateString('pt-BR')} •{' '}
                    {sessao.hora_inicio || '--:--'}
                    {sessao.hora_fim ? `-${sessao.hora_fim}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                  {participantsCount(sessao)} pax
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="truncate">
                  {sessao.simulador_nome || sessao.simulador_modelo || 'Simulador'}
                </span>
                <span>•</span>
                <span className="truncate">{sessao.instrutor_nome || 'Instrutor a definir'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Atividades recentes
function ActivityCard({ atividades }: { atividades: AtividadeRecente[] }) {
  const colorMap: Record<string, string> = {
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    orange: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
            Atividade recente
          </h3>
        </div>
      </div>
      {atividades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Activity className="mb-2 h-8 w-8 text-slate-200" />
          <p className="text-xs text-slate-400">Nenhuma atividade recente registrada.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {atividades.slice(0, 4).map((a) => (
            <div key={a.id} className="flex gap-3 px-5 py-3">
              <div
                className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colorMap[a.cor ?? ''] ?? 'bg-slate-400'}`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">{a.descricao}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {formatRelativeTime(a.timestamp)}
                  {a.tripulanteNome ? ` • ${a.tripulanteNome}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-slate-100 px-5 py-3">
        <Link to="/atividade" className="text-xs font-bold text-blue-700 hover:underline">
          Ver histórico
        </Link>
      </div>
    </div>
  );
}

function TrainingTimelineChart({
  metrics,
  treinamentos,
  sessoes,
}: {
  metrics: DashboardMetrics;
  treinamentos: TreinamentoPlanejadoItem[];
  sessoes: SessaoSimulador[];
}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const countInWindow = (from: number, to: number) => {
    const treino = treinamentos.filter((t) => {
      const d = dateDiffInDays(String(t.data_prevista || ''), hoje);
      return d >= from && d < to;
    }).length;
    const sim = sessoes.filter((s) => {
      const d = dateDiffInDays(String(s.data || '').split('T')[0], hoje);
      return d >= from && d < to;
    }).length;
    return treino + sim;
  };

  const v30 = countInWindow(0, 30) || metrics.demandaFutura30Dias;
  const v60 =
    countInWindow(30, 60) || Math.max(metrics.demandaFutura60Dias - metrics.demandaFutura30Dias, 0);
  const v90 =
    countInWindow(60, 90) || Math.max(metrics.demandaFutura90Dias - metrics.demandaFutura60Dias, 0);

  const rows = [
    {
      label: '0-30 dias',
      value: v30,
      color: metrics.qualificacoesVencidas > 0 ? 'bg-red-500' : 'bg-blue-500',
      href: '/qualificacoes/alertas',
    },
    { label: '31-60 dias', value: v60, color: 'bg-slate-300', href: '/qualificacoes/alertas' },
    { label: '61-90 dias', value: v90, color: 'bg-slate-200', href: '/qualificacoes/alertas' },
  ];

  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const totalEventos = rows.reduce((acc, row) => acc + row.value, 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Treinamentos e Simulador
          </p>
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">Carga futura</h3>
        </div>
        <Link
          to="/qualificacoes?tab=planejados"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Planejar <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <Link key={row.label} to={row.href} className="block group">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900">
                {row.label}
              </span>
              <span className="text-xs font-bold text-slate-900">
                {row.value > 0 ? `${row.value} evento(s)` : '-'}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${row.color}`}
                style={{ width: `${Math.max(row.value > 0 ? 6 : 0, (row.value / maxVal) * 100)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>

      {totalEventos === 0 ? (
        <p className="mt-4 text-center text-xs text-slate-400">
          Nenhuma demanda programada nos próximos 90 dias.
        </p>
      ) : (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Total nos próximos 90 dias</span>
          <span className="text-sm font-extrabold text-slate-900">{totalEventos}</span>
        </div>
      )}
    </section>
  );
}

// Demanda de treinamento por horizonte (dados consistentes: demandaFutura*)
function DemandaCard({ metrics }: { metrics: DashboardMetrics }) {
  const rows = [
    {
      label: 'Próximos 30 dias',
      total: metrics.demandaFutura30Dias,
      cls: 'bg-blue-500',
      href: '/qualificacoes?status=vencendo',
    },
    {
      label: '31 – 60 dias',
      total: Math.max(metrics.demandaFutura60Dias - metrics.demandaFutura30Dias, 0),
      cls: 'bg-slate-300',
      href: '/qualificacoes/alertas',
    },
    {
      label: '61 – 90 dias',
      total: Math.max(metrics.demandaFutura90Dias - metrics.demandaFutura60Dias, 0),
      cls: 'bg-slate-200',
      href: '/qualificacoes/alertas',
    },
  ];
  const max = Math.max(...rows.map((r) => r.total), 1);
  const totalDemanda = rows.reduce((acc, row) => acc + row.total, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
            Demanda de treinamento
          </h3>
        </div>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Planejar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {totalDemanda === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-400">
          Nenhuma demanda de treinamento programada nos proximos 90 dias.
        </p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {rows.map((row) => (
            <Link key={row.label} to={row.href} className="block">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
                <span className="text-slate-700">{row.label}</span>
                <span className="text-slate-500">{row.total} sessões</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${row.cls}`}
                  style={{ width: `${Math.max(5, (row.total / max) * 100)}%` }}
                />
              </div>
            </Link>
          ))}
          <p className="pt-1 text-[10px] italic text-slate-400">
            Baseado no volume operacional capturado pelo AirTrust.
          </p>
        </div>
      )}
    </div>
  );
}

// Compliance por categoria
function RegulatoryRiskWindow({ metrics }: { metrics: DashboardMetrics }) {
  const vencidas = metrics.qualificacoesVencidas;
  const vencendo30 = metrics.qualificacoesAVencer;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
          Janela de risco regulatório
        </h3>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
        >
          Ver pendências <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Vencidas</p>
          <p className="mt-1 text-2xl font-black text-red-700">{vencidas}</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
            Vencem em 30d
          </p>
          <p className="mt-1 text-2xl font-black text-orange-700">{vencendo30}</p>
        </div>
      </div>
    </section>
  );
}

function OperationalFooterStrip({
  metrics,
  lastUpdated,
}: {
  metrics: DashboardMetrics;
  lastUpdated: Date | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Previsão 60 dias
          </p>
          <p className="mt-1 font-semibold text-slate-800">
            {metrics.demandaFutura60Dias} treinamentos no pipeline
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            LMS em andamento
          </p>
          <p className="mt-1 font-semibold text-slate-800">
            {metrics.lms?.emAndamento ?? 0} matrículas ativas
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Atualização</p>
          <p className="mt-1 font-semibold text-slate-800">
            {lastUpdated ? formatRelativeTime(lastUpdated.toISOString()) : 'agora'}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPrincipal() {
  const {
    metrics,
    compliance,
    alertas,
    atividades,
    frmsAlertas,
    escalas,
    treinamentosPlanejados,
    sessoesSimulador,
    isLoading,
    isRevalidating,
    error,
    sectionErrors,
    refresh,
    lastUpdated,
  } = useDashboardData();

  // Initial load — no data yet
  if (isLoading && !metrics && !compliance) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  // Auth / network-level error with zero data
  if (error && !metrics && !compliance) {
    return (
      <AppLayout>
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-red-50 p-4 text-red-600">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-base font-bold text-slate-900">
            Não foi possível carregar o painel
          </h3>
          <p className="mb-6 max-w-md text-sm text-slate-500">{error}</p>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      </AppLayout>
    );
  }

  // ── Derived data (null-safe — metrics or compliance may be absent on section failure) ──
  const tripulantesEmDia = metrics
    ? Math.max(metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas, 0)
    : 0;
  const pctTripulantesEmDia = metrics ? safePct(tripulantesEmDia, metrics.tripulantesAtivos) : 0;
  const tripulantesEmDiaPct = pctTripulantesEmDia;
  const tripulantesComVencimentoPct = metrics
    ? safePct(metrics.tripulantesComQualificacoesVencendo, metrics.tripulantesAtivos)
    : 0;
  const score = pctTripulantesEmDia;
  const meta = compliance?.metaOrganizacional ?? 90;
  const opStatus = metrics ? getOperationStatus(score) : null;
  const scoreColor =
    score >= 90 ? 'text-emerald-600' : score >= 60 ? 'text-amber-500' : 'text-red-600';
  const diffColor =
    score >= meta
      ? 'bg-emerald-50 text-emerald-700'
      : score >= 60
        ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700';

  const certVencidas = alertas.filter((a) => a.diasRestantes <= 0).length;

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 md:px-6">
        <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-slate-100/60 p-3 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-800 dark:to-slate-800 sm:p-4 lg:p-5">
          <div className="mb-3 flex flex-col gap-1.5 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Modulos do sistema
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Acesso rapido aos fluxos operacionais principais
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
              6 modulos
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Link
              to="/funcionarios"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 transition group-hover:bg-blue-100 dark:bg-blue-500/10 dark:group-hover:bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">Funcionarios</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  {metrics?.tripulantesAtivos ?? '—'} ativos
                </p>
              </div>
            </Link>

            <Link
              to="/qualificacoes"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-amber-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 transition group-hover:bg-amber-100 dark:bg-amber-500/10 dark:group-hover:bg-amber-500/20">
                <ClipboardCheck className="h-5 w-5 text-amber-600" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">Qualificacoes</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  {(metrics?.qualificacoesAVencer ?? 0) > 0
                    ? `${metrics!.qualificacoesAVencer} a vencer`
                    : 'Tudo em dia'}
                </p>
              </div>
            </Link>

            <Link
              to="/simuladores"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 transition group-hover:bg-violet-100 dark:bg-violet-500/10 dark:group-hover:bg-violet-500/20">
                <PlaneTakeoff className="h-5 w-5 text-violet-600" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">Simuladores</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  {sessoesSimulador.length > 0
                    ? `${sessoesSimulador.length} agendadas`
                    : 'Ver agenda'}
                </p>
              </div>
            </Link>

            <Link
              to="/lms"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 transition group-hover:bg-blue-100 dark:bg-blue-500/10 dark:group-hover:bg-blue-500/20">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">LMS</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  {metrics?.lms?.emAndamento ?? 0} em andamento
                </p>
              </div>
            </Link>

            <Link
              to="/escalas"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 transition group-hover:bg-emerald-100 dark:bg-emerald-500/10 dark:group-hover:bg-emerald-500/20">
                <CalendarClock className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">Escala</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  {escalas.length > 0 ? `${escalas.length} ativas` : 'Gerenciar'}
                </p>
              </div>
            </Link>

            <Link
              to="/frms"
              className="group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-red-500/40 sm:min-h-[132px] sm:px-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 transition group-hover:bg-red-100 dark:bg-red-500/10 dark:group-hover:bg-red-500/20">
                <Zap className="h-5 w-5 text-red-500" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">FRMS</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  Fadiga · {frmsAlertas.length} alertas
                </p>
              </div>
            </Link>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">
              {formatDisplayDate(new Date())}
              {lastUpdated && (
                <span className="ml-2 text-slate-300">
                  · atualizado {formatRelativeTime(lastUpdated.toISOString())}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {opStatus && (
              <div className={`rounded-xl border-l-4 bg-white px-4 py-2 shadow-sm ${opStatus.tone}`}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Status operacional
                </p>
                <p className="text-xs font-extrabold uppercase">{opStatus.label}</p>
              </div>
            )}

            <button
              onClick={refresh}
              disabled={isLoading || isRevalidating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading || isRevalidating ? 'animate-spin' : ''}`}
              />
              {isRevalidating ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
            {!metrics ? (
              <WidgetError
                message={sectionErrors.metrics ?? 'Dados de métricas indisponíveis'}
                onRetry={() => void refresh()}
              />
            ) : !compliance ? (
              <WidgetError
                message={sectionErrors.compliance ?? 'Dados de compliance indisponíveis'}
                onRetry={() => void refresh()}
              />
            ) : (<>
              <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Visao geral · Compliance
              </p>
              <div className="mt-2 flex items-end gap-3">
                <span className={`text-6xl font-black leading-none tracking-tighter ${scoreColor}`}>
                  {score}%
                </span>
                <div className="mb-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${diffColor}`}>
                    {score >= meta ? `+${score - meta}%` : `${score - meta}%`} da meta {meta}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Tripulantes em dia
                  </span>
                  <span className="font-bold text-slate-900">{tripulantesEmDiaPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.max(4, tripulantesEmDiaPct)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Vencimento em 30 dias
                  </span>
                  <span className="font-bold text-slate-900">{tripulantesComVencimentoPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${Math.max(4, tripulantesComVencimentoPct)}%` }}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>Qualificacoes vencidas: {certVencidas}</span>
                  <span>Vencem em 30 dias: {metrics.qualificacoesAVencer}</span>
                  <Link
                    to="/qualificacoes/alertas"
                    className="font-bold text-blue-700 hover:underline"
                  >
                    Ver pendencias
                  </Link>
                </div>
              </div>
            </div>
          </>)}
          </div>

          <div className="h-full lg:col-span-4">
            <FrmsRiskDonut frmsAlertas={frmsAlertas} />
          </div>

          <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
            {!metrics ? (
              <WidgetError
                message={sectionErrors.metrics ?? 'Dados de métricas indisponíveis'}
                onRetry={() => void refresh()}
                className="col-span-3"
              />
            ) : (<>
            <Link
              to="/funcionarios"
              className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Tripulantes
                </p>
                <p className="mt-0.5 text-2xl font-extrabold text-blue-700">
                  {metrics.tripulantesAtivos}
                </p>
                <p className="text-[11px] text-slate-500">
                  {metrics.tripulantesComQualificacoesVencendo} com venc. proximo
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 p-2.5">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </Link>

            <Link
              to="/qualificacoes?status=vencida"
              className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Em dia
                </p>
                <p
                  className={`mt-0.5 text-2xl font-extrabold ${
                    pctTripulantesEmDia >= 80
                      ? 'text-emerald-600'
                      : pctTripulantesEmDia >= 50
                        ? 'text-amber-500'
                        : 'text-red-600'
                  }`}
                >
                  {tripulantesEmDia}
                  <span className="text-sm font-bold text-slate-400">
                    /{metrics.tripulantesAtivos}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {metrics.tripulantesComQualificacoesVencidas} em atraso
                </p>
              </div>
              <div
                className={`rounded-xl p-2.5 ${
                  pctTripulantesEmDia >= 80
                    ? 'bg-emerald-50'
                    : pctTripulantesEmDia >= 50
                      ? 'bg-amber-50'
                      : 'bg-red-50'
                }`}
              >
                <ClipboardCheck
                  className={`h-5 w-5 ${
                    pctTripulantesEmDia >= 80
                      ? 'text-emerald-600'
                      : pctTripulantesEmDia >= 50
                        ? 'text-amber-500'
                        : 'text-red-600'
                  }`}
                />
              </div>
            </Link>

            <Link
              to="/lms"
              className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  LMS
                </p>
                <p className="mt-0.5 text-2xl font-extrabold text-blue-700">
                  {metrics.lms?.emAndamento ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">matriculas em andamento</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-2.5">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
            </Link>
            </>)}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <AlertsTable alertas={alertas} />
          </div>

          <div className="space-y-4 lg:col-span-4">
            <PlannedTrainingsCard treinamentos={treinamentosPlanejados} />

            {sessoesSimulador.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <PlaneTakeoff className="h-4 w-4 text-slate-400" />
                    <h3 className="text-sm font-extrabold text-slate-900">Proximas sessoes</h3>
                  </div>
                  <Link
                    to="/simuladores"
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    Ver agenda →
                  </Link>
                </div>
                <div className="divide-y divide-slate-50">
                  {sessoesSimulador.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-center">
                        <span className="text-[10px] font-bold leading-tight text-slate-500">
                          {new Date(`${s.data}T00:00:00`)
                            .toLocaleDateString('pt-BR', { month: 'short' })
                            .toUpperCase()}
                        </span>
                        <span className="text-sm font-extrabold leading-tight text-slate-900">
                          {new Date(`${s.data}T00:00:00`).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {s.tema_sessao || s.tipo_sessao || 'Sessao de simulador'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {s.simulador_nome || '—'} · {s.hora_inicio || '--:--'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 lg:col-span-3">
            <EscalasSummary escalas={escalas} />
            <ActivityCard atividades={atividades} />
          </div>
        </div>

        {metrics && <OperationalFooterStrip metrics={metrics} lastUpdated={lastUpdated} />}
      </div>
    </AppLayout>
  );
}

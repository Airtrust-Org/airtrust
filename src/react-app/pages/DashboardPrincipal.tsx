import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  Activity,
  Users,
  Gauge,
  Zap,
  BookOpen,
  Wrench,
  Plane,
  X,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { canSeeDevelopmentModules } from '../lib/development-module-nav';
import { canAccessModule } from '../lib/module-access';
import { formatDisplayDate, formatRelativeTime, getOperationStatus, safePct } from './dashboard/helpers';
import { DashboardSkeleton } from './dashboard/DashboardSkeleton';
import {
  useAlertasQuery,
  useEscalasQuery,
  useFrmsAlertasQuery,
  useMetricsQuery,
  useSimuladoresAlertasQuery,
  useSessoesSimuladorQuery,
} from './dashboard/queries';

function firstWords(value: string | null | undefined): string {
  if (!value) return '-';
  return value.length > 64 ? `${value.slice(0, 64)}...` : value;
}

function isQualificationAlert(alerta: { tipo?: string; diasRestantes?: number }): boolean {
  if (String(alerta.tipo || '').toLowerCase() !== 'qualificacao_vencendo') return false;
  return Number.isFinite(Number(alerta.diasRestantes));
}

const ALERT_BANNER_STORAGE_KEY = 'airtrust.dashboard.alert-banner.dismissed.v1';

function readDismissedBannerScopes(): Record<string, true> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.sessionStorage.getItem(ALERT_BANNER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, true>>(
      (acc, [key, value]) => {
        if (value === true) acc[key] = true;
        return acc;
      },
      {},
    );
  } catch {
    return {};
  }
}

function persistDismissedBannerScopes(scopes: Record<string, true>) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(ALERT_BANNER_STORAGE_KEY, JSON.stringify(scopes));
  } catch {
    /* ignore storage failures */
  }
}

function buildBannerScopeSignature(alerts: string[]): string {
  return alerts.join('|');
}

function sumSimuladoresPendencias(data: {
  fichas_pendentes_avaliacao?: number;
  fichas_aguardando_assinatura?: number;
  sessoes_proximas_sem_ficha_completa?: number;
  edicoes_pendentes?: number;
} | null | undefined): number {
  if (!data) return 0;

  return (
    Number(data.fichas_pendentes_avaliacao || 0) +
    Number(data.fichas_aguardando_assinatura || 0) +
    Number(data.sessoes_proximas_sem_ficha_completa || 0) +
    Number(data.edicoes_pendentes || 0)
  );
}

function AlertBanner({ alerts, onDismiss }: { alerts: string[]; onDismiss: () => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-red-900/90 px-4 py-3 text-sm text-red-50 dark:bg-red-950/80">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-300" />
      <span className="flex-1 font-medium">{alerts.join(' · ')}</span>
      <button
        onClick={onDismiss}
        aria-label="Dispensar alertas"
        className="flex-shrink-0 rounded-lg p-0.5 hover:bg-red-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type ModuleCardStatus = 'normal' | 'atencao' | 'critico' | 'em-breve';

const MODULE_STATUS_CONFIG: Record<ModuleCardStatus, { label: string; className: string }> = {
  normal: {
    label: 'Normal',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  atencao: {
    label: 'Atenção',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  critico: {
    label: 'Crítico',
    className: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  },
  'em-breve': {
    label: 'Em breve',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
};

function ModuleCard({
  icon,
  label,
  status,
  summary,
  route,
}: {
  icon: React.ReactNode;
  label: string;
  status: ModuleCardStatus;
  summary: string;
  route: string;
}) {
  const isCritico = status === 'critico';
  const isEmBreve = status === 'em-breve';
  const cfg = MODULE_STATUS_CONFIG[status];

  const borderClasses = isCritico
    ? 'border border-slate-200 border-l-4 border-l-red-500 dark:border-slate-700 dark:border-l-red-500'
    : 'border border-slate-200 dark:border-slate-700';

  return (
    <div
      className={`flex flex-col rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900 ${borderClasses} ${isEmBreve ? 'opacity-60' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{label}</h3>
        <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{summary}</p>
      </div>
      <div className="mt-3">
        {isEmBreve ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-400 dark:bg-slate-800 dark:text-slate-600"
          >
            Abrir módulo
          </button>
        ) : (
          <Link
            to={route}
            className="block w-full rounded-xl bg-slate-900 px-3 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Abrir módulo
          </Link>
        )}
      </div>
    </div>
  );
}

function complianceTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function complianceBarColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function DashboardPrincipal() {
  const [dismissedBannerScopes, setDismissedBannerScopes] = useState<Record<string, true>>(
    readDismissedBannerScopes,
  );

  const { user, empresas, empresaAtualId } = useAuth();
  const { can, isAluno, isInstrutor } = usePermissions();
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
  const canSeeRestrictedDevelopmentNav = canSeeDevelopmentModules(user);

  const showFuncionarios =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('funcionarios', modulosAtivos) &&
    can('funcionarios.view');
  const showQualificacoes =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('qualificacoes', modulosAtivos) &&
    can('qualificacoes.view');
  const showSimuladores =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('simuladores', modulosAtivos) &&
    can('simuladores.view');
  const showEscalas =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('escalas', modulosAtivos) &&
    (can('escalas.view') || can('self.escala'));
  const showFrms =
    !isAluno && !isInstrutor && canAccessModule('frms', modulosAtivos) && can('frms.view');
  const showSgso =
    !isAluno && !isInstrutor && canAccessModule('sgso', modulosAtivos) && can('sgso.view');
  const showMro =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('mro', modulosAtivos) &&
    canSeeRestrictedDevelopmentNav;
  const showControleVoos =
    !isAluno &&
    !isInstrutor &&
    canAccessModule('controle_voos', modulosAtivos) &&
    canSeeRestrictedDevelopmentNav;

  const metricsQ = useMetricsQuery();
  const alertasQ = useAlertasQuery(showQualificacoes);
  const frmsAlertasQ = useFrmsAlertasQuery(showFrms);
  const escalasQ = useEscalasQuery(showEscalas && !!metricsQ.data);
  const sessoesQ = useSessoesSimuladorQuery(showSimuladores && !!metricsQ.data);
  const simuladoresAlertasQ = useSimuladoresAlertasQuery(showSimuladores && !!metricsQ.data);

  const criticalQueries = [
    metricsQ,
    alertasQ,
    frmsAlertasQ,
    escalasQ,
    sessoesQ,
    simuladoresAlertasQ,
  ];
  const isEssentialLoading = metricsQ.isLoading && !metricsQ.data;
  const isEssentialError = metricsQ.isError && !metricsQ.data;
  const isRevalidating = criticalQueries.some((query) => query.isFetching);

  if (isEssentialLoading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  if (isEssentialError) {
    return (
      <AppLayout>
        <div
          className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm dark:border-red-500/20 dark:bg-slate-900"
          role="alert"
        >
          <div className="mb-4 rounded-full bg-red-50 p-4 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">
            Não foi possível carregar o painel
          </h3>
          <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {metricsQ.error?.message}
          </p>
          <button
            onClick={() => metricsQ.refetch()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      </AppLayout>
    );
  }

  const metrics = metricsQ.data;
  const alertas = alertasQ.data ?? [];
  const frmsAlertas = frmsAlertasQ.data ?? [];
  const escalas = escalasQ.data ?? [];
  const sessoes = sessoesQ.data ?? [];
  const simuladoresAlertas = simuladoresAlertasQ.data ?? null;

  const hasFrmsError = showFrms && frmsAlertasQ.isError && !frmsAlertasQ.data;
  const hasEscalasError = showEscalas && escalasQ.isError && !escalasQ.data;
  const hasSessoesError = showSimuladores && sessoesQ.isError && !sessoesQ.data;
  const hasSimuladoresAlertasError =
    showSimuladores && simuladoresAlertasQ.isError && !simuladoresAlertasQ.data;

  const dataUpdatedAt = Math.max(
    metricsQ.dataUpdatedAt || 0,
    alertasQ.dataUpdatedAt || 0,
    frmsAlertasQ.dataUpdatedAt || 0,
    escalasQ.dataUpdatedAt || 0,
    sessoesQ.dataUpdatedAt || 0,
    simuladoresAlertasQ.dataUpdatedAt || 0,
  );
  const lastUpdated = dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null;

  const tripulantesEmDia = metrics
    ? Math.max(metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas, 0)
    : 0;
  const complianceScore = metrics ? safePct(tripulantesEmDia, metrics.tripulantesAtivos) : 0;
  const operationStatus = metrics ? getOperationStatus(complianceScore) : null;

  const frmsCriticos = frmsAlertas.filter(
    (item) => item.nivel === 'CRITICO' || item.nivel === 'VIOLACAO',
  );
  const qualificacoesAlertas = alertas.filter((item) => isQualificationAlert(item));
  const qualificacoesVencidas =
    metrics?.qualificacoesVencidas ??
    qualificacoesAlertas.filter((item) => Number(item.diasRestantes) <= 0).length;
  const qualificacoesVencendo =
    metrics?.qualificacoesAVencer ??
    qualificacoesAlertas.filter((item) => Number(item.diasRestantes) > 0).length;
  const escalasRascunho = escalas.filter((e) => e.status === 'rascunho');
  const totalPendenciasSimuladores = sumSimuladoresPendencias(simuladoresAlertas);
  const bannerAlerts = useMemo(() => {
    const items: string[] = [];

    if (showQualificacoes && qualificacoesVencidas > 0) {
      items.push(`${qualificacoesVencidas} qualificações vencidas`);
    }
    if (showFrms && hasFrmsError) {
      items.push('Erro ao carregar FRMS');
    }
    if (showSimuladores && totalPendenciasSimuladores > 0) {
      items.push(`${totalPendenciasSimuladores} pendências de simuladores exigem ação`);
    }
    if (showEscalas && escalasRascunho.length > 0) {
      const escala = escalasRascunho[0];
      items.push(
        `Escala ${String(escala.mes).padStart(2, '0')}/${String(escala.ano).slice(2)} em rascunho`,
      );
    }

    return items;
  }, [
    escalasRascunho,
    hasFrmsError,
    qualificacoesVencidas,
    showEscalas,
    showFrms,
    showQualificacoes,
    showSimuladores,
    totalPendenciasSimuladores,
  ]);
  const bannerSignature = buildBannerScopeSignature(bannerAlerts);
  const dismissedBannerScopeKey = `${empresaAtualId ?? 'sem-empresa'}:${bannerSignature}`;
  const bannerDismissed =
    bannerAlerts.length > 0 && dismissedBannerScopes[dismissedBannerScopeKey] === true;

  const frmsStatus: ModuleCardStatus = hasFrmsError
    ? 'critico'
    : frmsCriticos.length > 0
      ? 'critico'
      : frmsAlertas.length > 0
        ? 'atencao'
        : 'normal';

  const qualStatus: ModuleCardStatus =
    qualificacoesVencidas > 0 ? 'critico' : qualificacoesVencendo > 0 ? 'atencao' : 'normal';
  const escalasStatus: ModuleCardStatus =
    hasEscalasError ? 'atencao' : escalasRascunho.length > 0 ? 'atencao' : 'normal';
  const simuladoresStatus: ModuleCardStatus = hasSimuladoresAlertasError || hasSessoesError
    ? 'atencao'
    : totalPendenciasSimuladores > 0
      ? Number(simuladoresAlertas?.fichas_pendentes_avaliacao || 0) > 0 ||
        Number(simuladoresAlertas?.sessoes_proximas_sem_ficha_completa || 0) > 0
        ? 'critico'
        : 'atencao'
      : 'normal';

  const escalaSummaryItem = escalasRascunho[0] ?? escalas[0];
  const ESCALA_STATUS_PT: Record<string, string> = {
    rascunho: 'em rascunho',
    em_revisao: 'em revisão',
    aprovada: 'aprovada',
    publicada: 'publicada',
  };
  const escalaSummary = escalaSummaryItem
    ? `${String(escalaSummaryItem.mes).padStart(2, '0')}/${String(escalaSummaryItem.ano).slice(2)} · ${ESCALA_STATUS_PT[escalaSummaryItem.status] ?? escalaSummaryItem.status}`
    : 'Sem escalas ativas';

  const sessoesSummary = hasSessoesError
    ? 'Erro ao carregar sessões'
    : sessoes.length === 0
      ? 'Sem sessões futuras'
      : sessoes.length === 1
        ? '1 sessão agendada'
        : `${sessoes.length} sessões agendadas`;

  const frmsSummary = hasFrmsError
    ? 'Erro ao carregar dados'
    : frmsCriticos.length > 0
      ? `${frmsCriticos.length} alerta${frmsCriticos.length > 1 ? 's' : ''} crítico${frmsCriticos.length > 1 ? 's' : ''}`
      : frmsAlertas.length > 0
        ? `${frmsAlertas.length} alerta${frmsAlertas.length > 1 ? 's' : ''} pendente${frmsAlertas.length > 1 ? 's' : ''}`
        : 'Sem alertas no período';
  const simuladoresSummary =
    totalPendenciasSimuladores > 0
      ? `${totalPendenciasSimuladores} pendência${totalPendenciasSimuladores > 1 ? 's' : ''} operacional${totalPendenciasSimuladores > 1 ? 'is' : ''}`
      : sessoesSummary;

  const qualSummary =
    qualificacoesVencidas > 0 && qualificacoesVencendo > 0
      ? `${qualificacoesVencidas} vencidas · ${qualificacoesVencendo} vencendo`
      : qualificacoesVencidas > 0
        ? `${qualificacoesVencidas} qualificações vencidas`
        : qualificacoesVencendo > 0
        ? `${qualificacoesVencendo} vencendo em breve`
          : 'Qualificações em dia';

  const handleDismissBanner = () => {
    if (!bannerSignature) return;

    const nextScopes = {
      ...dismissedBannerScopes,
      [dismissedBannerScopeKey]: true as const,
    };
    setDismissedBannerScopes(nextScopes);
    persistDismissedBannerScopes(nextScopes);
  };

  const handleRefresh = () => {
    void Promise.all([
      metricsQ.refetch(),
      alertasQ.refetch(),
      frmsAlertasQ.refetch(),
      escalasQ.refetch(),
      sessoesQ.refetch(),
      simuladoresAlertasQ.refetch(),
    ]);
  };
  const renderKpiCard = (content: React.ReactNode, route?: string) => {
    if (!route) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          {content}
        </div>
      );
    }

    return (
      <Link
        to={route}
        className="group block rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      >
        {content}
      </Link>
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 md:px-6">
        {!bannerDismissed ? (
          <AlertBanner
            alerts={bannerAlerts}
            onDismiss={handleDismissBanner}
          />
        ) : null}

        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50 to-blue-50/60 p-5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-8 h-44 w-44 rounded-full bg-emerald-500/10 blur-2xl" />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Saúde operacional hoje
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Painel executivo
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {formatDisplayDate(new Date())}
                {lastUpdated ? (
                  <span className="ml-2">
                    · atualizado {formatRelativeTime(lastUpdated.toISOString())}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                  operationStatus
                    ? operationStatus.tone
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {operationStatus?.label || 'Sem status'}
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRevalidating}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
                {isRevalidating ? 'Atualizando...' : 'Atualizar dados'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {renderKpiCard(
              <>
              <div className="mb-1 inline-flex rounded-lg bg-slate-100 p-1.5 text-slate-700 transition-colors group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700">
                <Users className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tripulantes ativos
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                {metrics?.tripulantesAtivos ?? 0}
              </p>
              </>,
              showFuncionarios ? '/funcionarios' : undefined,
            )}

            {renderKpiCard(
              <>
              <div className="mb-1 inline-flex rounded-lg bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Gauge className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Em conformidade
              </p>
              <p className={`mt-1 text-2xl font-black ${complianceTextColor(complianceScore)}`}>
                {complianceScore}%
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-1.5 rounded-full transition-all ${complianceBarColor(complianceScore)}`}
                  style={{ width: `${complianceScore}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Meta: 95%</p>
              </>,
              showFuncionarios ? '/funcionarios' : undefined,
            )}

            {renderKpiCard(
              <>
              <div className="mb-1 inline-flex rounded-lg bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Alertas FRMS pendentes
              </p>
              <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
                {frmsAlertas.length}
              </p>
              </>,
              showFrms ? '/frms/alertas' : undefined,
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Módulos do sistema
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {showFuncionarios ? (
            <ModuleCard
              icon={<Users className="h-5 w-5" />}
              label="Funcionários"
              status={metrics && metrics.tripulantesAtivos > 0 ? 'atencao' : 'normal'}
              summary={
                metrics ? `${metrics.tripulantesAtivos} tripulantes ativos` : 'Carregando...'
              }
              route="/funcionarios"
            />
            ) : null}
            {showSimuladores ? (
            <ModuleCard
              icon={<BookOpen className="h-5 w-5" />}
              label="Treinamentos / Simuladores"
              status={simuladoresStatus}
              summary={simuladoresSummary}
              route="/simuladores"
            />
            ) : null}
            {showEscalas ? (
            <ModuleCard
              icon={<CalendarClock className="h-5 w-5" />}
              label="Escala"
              status={escalasStatus}
              summary={escalaSummary}
              route="/escalas"
            />
            ) : null}
            {showFrms ? (
            <ModuleCard
              icon={<Zap className="h-5 w-5" />}
              label="FRMS"
              status={frmsStatus}
              summary={frmsSummary}
              route="/frms"
            />
            ) : null}
            {showQualificacoes ? (
            <ModuleCard
              icon={<ClipboardCheck className="h-5 w-5" />}
              label="Qualificações"
              status={qualStatus}
              summary={qualSummary}
              route="/qualificacoes/alertas"
            />
            ) : null}
            {showSgso ? (
            <ModuleCard
              icon={<ShieldAlert className="h-5 w-5" />}
              label="SGSO"
              status="normal"
              summary="Sem pendências abertas na home"
              route="/sgso"
            />
            ) : null}
            {showMro ? (
            <ModuleCard
              icon={<Wrench className="h-5 w-5" />}
              label="Manutenção"
              status="normal"
              summary="Acesso liberado conforme o menu"
              route="/mro"
            />
            ) : null}
            {showControleVoos ? (
            <ModuleCard
              icon={<Plane className="h-5 w-5" />}
              label="Controle de Voos"
              status="normal"
              summary="Acesso liberado conforme o menu"
              route="/controle-voos"
            />
            ) : null}
          </div>
        </section>

        {showSimuladores ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Treinamentos / Simuladores
              </h2>
            </div>
            <Link
              to="/simuladores"
              className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400"
            >
              Abrir módulo →
            </Link>
          </div>

          {hasSimuladoresAlertasError || hasSessoesError ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {simuladoresAlertasQ.error?.message ||
                sessoesQ.error?.message ||
                'Erro ao carregar o resumo operacional de simuladores.'}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Pendências que exigem ação
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                        Avaliações pendentes
                      </p>
                      <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-300">
                        {Number(simuladoresAlertas?.fichas_pendentes_avaliacao || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Assinaturas pendentes
                      </p>
                      <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300">
                        {Number(simuladoresAlertas?.fichas_aguardando_assinatura || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                        Edições pendentes
                      </p>
                      <p className="mt-1 text-2xl font-black text-blue-700 dark:text-blue-300">
                        {Number(simuladoresAlertas?.edicoes_pendentes || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Sessões sem ficha completa
                      </p>
                      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                        {Number(simuladoresAlertas?.sessoes_proximas_sem_ficha_completa || 0)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Janela de {Number(simuladoresAlertas?.janela_sessoes_proximas_horas || 24)}h
                      </p>
                    </div>
                  </div>
                  {totalPendenciasSimuladores === 0 ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Nenhuma pendência operacional de simuladores.
                    </p>
                  ) : null}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pendências de ação ficam separadas das próximas sessões para evitar resumo enganoso
                  só com agenda futura.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Próximas sessões
                </p>
                <div className="mt-2 space-y-2">
                  {sessoes.slice(0, 3).map((sessao) => (
                    <div
                      key={sessao.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {firstWords(
                            sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de simulador',
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {sessao.data} · {sessao.hora_inicio || '--:--'} ·{' '}
                          {sessao.simulador_nome || 'Simulador'}
                        </p>
                      </div>
                      <Link
                        to="/simuladores"
                        className="ml-3 flex-shrink-0 text-xs font-bold text-blue-700 dark:text-blue-400"
                      >
                        Ver
                      </Link>
                    </div>
                  ))}
                  {sessoes.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Nenhuma sessão futura relevante.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
        ) : null}
      </div>
    </AppLayout>
  );
}

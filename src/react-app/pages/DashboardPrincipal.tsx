import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  PlaneTakeoff,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { WidgetError } from '../components/UI/widget-states';
import { formatDisplayDate, formatRelativeTime, safePct, getOperationStatus } from './dashboard/helpers';
import { DashboardSkeleton } from './dashboard/DashboardSkeleton';
import { AlertsTable } from './dashboard/AlertsTable';
import { PlannedTrainingsCard } from './dashboard/PlannedTrainingsCard';
import { ActivityCard } from './dashboard/ActivityCard';
import { EscalasSummary } from './dashboard/EscalasSummary';
import { FrmsRiskDonut } from './dashboard/FrmsRiskDonut';
import { OperationalFooterStrip } from './dashboard/OperationalFooterStrip';
import {
  useMetricsQuery,
  useComplianceQuery,
  useAlertasQuery,
  useAtividadesQuery,
  useFrmsAlertasQuery,
  useEscalasQuery,
  useTreinamentosQuery,
  useSessoesSimuladorQuery,
} from './dashboard/queries';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPrincipal() {
  // Essential queries
  const metricsQ = useMetricsQuery();
  const complianceQ = useComplianceQuery();
  const alertasQ = useAlertasQuery();
  const atividadesQ = useAtividadesQuery();

  // Secondary queries (enabled once essential data starts loading)
  const frmsAlertasQ = useFrmsAlertasQuery();
  const escalasQ = useEscalasQuery(!!metricsQ.data);
  const treinamentosQ = useTreinamentosQuery(!!metricsQ.data);
  const sessoesQ = useSessoesSimuladorQuery(!!metricsQ.data);

  const isEssentialLoading = metricsQ.isLoading && !metricsQ.data;
  const isEssentialError = metricsQ.isError && !metricsQ.data;
  const isRevalidating = metricsQ.isFetching && !!metricsQ.data;

  // ── Initial loading ──
  if (isEssentialLoading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  // ── Auth / network-level error with zero data ──
  if (isEssentialError) {
    return (
      <AppLayout>
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm dark:border-red-500/20 dark:bg-slate-900" role="alert">
          <div className="mb-4 rounded-full bg-red-50 p-4 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">
            Não foi possível carregar o painel
          </h3>
          <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">{metricsQ.error?.message}</p>
          <button
            onClick={() => metricsQ.refetch()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      </AppLayout>
    );
  }

  const metrics = metricsQ.data;
  const compliance = complianceQ.data;
  const alertas = alertasQ.data ?? [];
  const atividades = atividadesQ.data ?? [];
  const frmsAlertas = frmsAlertasQ.data ?? [];
  const escalas = escalasQ.data ?? [];
  const treinamentosPlanejados = treinamentosQ.data ?? [];
  const sessoesSimulador = sessoesQ.data ?? [];
  const hasFrmsError = frmsAlertasQ.isError && !frmsAlertasQ.data;
  const hasEscalasError = escalasQ.isError && !escalasQ.data;
  const hasTreinamentosError = treinamentosQ.isError && !treinamentosQ.data;
  const hasSessoesError = sessoesQ.isError && !sessoesQ.data;
  const hasAtividadesError = atividadesQ.isError && !atividadesQ.data;

  const lastUpdated = metricsQ.dataUpdatedAt ? new Date(metricsQ.dataUpdatedAt) : null;

  // ── Derived data ──
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
    score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : score >= 60 ? 'text-amber-500 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const diffColor =
    score >= meta
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : score >= 60
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
        : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400';

  const certVencidas = alertas.filter((a) => a.diasRestantes <= 0).length;

  const handleRefresh = () => {
    metricsQ.refetch();
    complianceQ.refetch();
    alertasQ.refetch();
    atividadesQ.refetch();
    frmsAlertasQ.refetch();
    escalasQ.refetch();
    treinamentosQ.refetch();
    sessoesQ.refetch();
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 md:px-6">
        {/* ── Module Shortcuts ── */}
        <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-slate-100/60 p-3 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-800 dark:to-slate-800 sm:p-4 lg:p-5">
          <div className="mb-3 flex flex-col gap-1.5 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Módulos do sistema
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Acesso rápido aos fluxos operacionais principais
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
              6 módulos
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              {
                to: '/funcionarios',
                icon: Users,
                label: 'Funcionários',
                detail: `${metrics?.tripulantesAtivos ?? '—'} ativos`,
                color: 'blue',
              },
              {
                to: '/qualificacoes',
                icon: ClipboardCheck,
                label: 'Qualificações',
                detail: (metrics?.qualificacoesAVencer ?? 0) > 0 ? `${metrics!.qualificacoesAVencer} a vencer` : 'Tudo em dia',
                color: 'amber',
              },
              {
                to: '/simuladores',
                icon: PlaneTakeoff,
                label: 'Simuladores',
                detail: sessoesSimulador.length > 0 ? `${sessoesSimulador.length} agendadas` : 'Ver agenda',
                color: 'violet',
              },
              {
                to: '/lms',
                icon: BookOpen,
                label: 'LMS',
                detail: `${metrics?.lms?.emAndamento ?? 0} em andamento`,
                color: 'teal',
              },
              {
                to: '/escalas',
                icon: CalendarClock,
                label: 'Escala',
                detail: escalas.length > 0 ? `${escalas.length} ativas` : 'Gerenciar',
                color: 'emerald',
              },
              {
                to: '/frms',
                icon: Zap,
                label: 'FRMS',
                detail: `Fadiga · ${frmsAlertas.length} alertas`,
                color: 'red',
              },
            ].map((mod) => (
              <Link
                key={mod.label}
                to={mod.to}
                className={`group relative flex min-h-[124px] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 sm:min-h-[132px] sm:px-4 ${
                  mod.color === 'blue' ? 'hover:border-blue-200 dark:hover:border-blue-500/40' :
                  mod.color === 'amber' ? 'hover:border-amber-200 dark:hover:border-amber-500/40' :
                  mod.color === 'violet' ? 'hover:border-violet-200 dark:hover:border-violet-500/40' :
                  mod.color === 'teal' ? 'hover:border-teal-200 dark:hover:border-teal-500/40' :
                  mod.color === 'emerald' ? 'hover:border-emerald-200 dark:hover:border-emerald-500/40' :
                  'hover:border-red-200 dark:hover:border-red-500/40'
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition group-hover:opacity-80 ${
                  mod.color === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                  mod.color === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                  mod.color === 'violet' ? 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' :
                  mod.color === 'teal' ? 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400' :
                  mod.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                  'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                }`}>
                  <mod.icon className="h-5 w-5" />
                </div>
                <div className="mt-3">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 sm:text-sm">{mod.label}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {mod.detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Header Row ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {formatDisplayDate(new Date())}
              {lastUpdated && (
                <span className="ml-2 text-slate-300 dark:text-slate-600">
                  · atualizado {formatRelativeTime(lastUpdated.toISOString())}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {opStatus && (
              <div className={`rounded-r-xl border-l-4 bg-white px-4 py-2 shadow-sm dark:bg-slate-900 ${opStatus.tone}`}>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Status operacional
                </p>
                <p className="text-xs font-extrabold uppercase">{opStatus.label}</p>
              </div>
            )}

            <button
              onClick={handleRefresh}
              disabled={isRevalidating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Atualizar dados do painel"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
              {isRevalidating ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
        </div>

        {/* ── Main Grid (Row 1): Compliance | FRMS Donut | KPI Cards ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Compliance Score */}
          <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-4">
            {!metrics ? (
              <WidgetError
                message={metricsQ.error?.message ?? 'Dados de métricas indisponíveis'}
                onRetry={() => metricsQ.refetch()}
              />
            ) : !compliance ? (
              <WidgetError
                message={complianceQ.error?.message ?? 'Dados de compliance indisponíveis'}
                onRetry={() => complianceQ.refetch()}
              />
            ) : (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Visão geral · Compliance
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
                    <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Tripulantes em dia
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{tripulantesEmDiaPct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(4, tripulantesEmDiaPct)}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Vencimento em 30 dias
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{tripulantesComVencimentoPct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.max(4, tripulantesComVencimentoPct)}%` }} />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Qualificações vencidas: {certVencidas}</span>
                      <span>Vencem em 30 dias: {metrics.qualificacoesAVencer}</span>
                      <Link to="/qualificacoes/alertas" className="font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400">
                        Ver pendências
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* FRMS Donut */}
          <div className="h-full lg:col-span-4">
            {hasFrmsError ? (
              <WidgetError
                message={frmsAlertasQ.error?.message ?? 'Dados FRMS indisponíveis'}
                onRetry={() => frmsAlertasQ.refetch()}
              />
            ) : (
              <FrmsRiskDonut frmsAlertas={frmsAlertas} />
            )}
          </div>

          {/* KPI Cards (vertical on desktop) */}
          <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
            {!metrics ? (
              <WidgetError
                message={metricsQ.error?.message ?? 'Dados de métricas indisponíveis'}
                onRetry={() => metricsQ.refetch()}
                className="col-span-3"
              />
            ) : (
              <>
                <Link
                  to="/funcionarios"
                  className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Tripulantes</p>
                    <p className="mt-0.5 text-2xl font-extrabold text-blue-700 dark:text-blue-400">{metrics.tripulantesAtivos}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {metrics.tripulantesComQualificacoesVencendo} com venc. próximo
                    </p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-2.5 dark:bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </Link>

                <Link
                  to="/qualificacoes?status=vencida"
                  className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Em dia</p>
                    <p className={`mt-0.5 text-2xl font-extrabold ${
                      pctTripulantesEmDia >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                      pctTripulantesEmDia >= 50 ? 'text-amber-500 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {tripulantesEmDia}
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500">/{metrics.tripulantesAtivos}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{metrics.tripulantesComQualificacoesVencidas} em atraso</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${
                    pctTripulantesEmDia >= 80 ? 'bg-emerald-50 dark:bg-emerald-500/10' :
                    pctTripulantesEmDia >= 50 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-red-500/10'
                  }`}>
                    <ClipboardCheck className={`h-5 w-5 ${
                      pctTripulantesEmDia >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                      pctTripulantesEmDia >= 50 ? 'text-amber-500 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    }`} />
                  </div>
                </Link>

                <Link
                  to="/lms"
                  className="group flex h-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">LMS</p>
                    <p className="mt-0.5 text-2xl font-extrabold text-teal-600 dark:text-teal-400">
                      {metrics.lms?.emAndamento ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">matrículas em andamento</p>
                  </div>
                  <div className="rounded-xl bg-teal-50 p-2.5 dark:bg-teal-500/10">
                    <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Main Grid (Row 2): Alerts | Trainings+Sessions | Escalas+Activity ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <AlertsTable alertas={alertas} />
          </div>

          <div className="space-y-4 lg:col-span-4">
            {hasTreinamentosError ? (
              <WidgetError
                message={treinamentosQ.error?.message ?? 'Treinamentos indisponíveis'}
                onRetry={() => treinamentosQ.refetch()}
              />
            ) : (
              <PlannedTrainingsCard treinamentos={treinamentosPlanejados} />
            )}

            {hasSessoesError ? (
              <WidgetError
                message={sessoesQ.error?.message ?? 'Próximas sessões indisponíveis'}
                onRetry={() => sessoesQ.refetch()}
              />
            ) : sessoesSimulador.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <PlaneTakeoff className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Próximas sessões</h3>
                  </div>
                  <Link to="/simuladores" className="text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400">
                    Ver agenda →
                  </Link>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-700">
                  {sessoesSimulador.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-center dark:bg-slate-800">
                        <span className="text-xs font-bold leading-tight text-slate-500 dark:text-slate-400">
                          {new Date(`${s.data}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}
                        </span>
                        <span className="text-sm font-extrabold leading-tight text-slate-900 dark:text-slate-100">
                          {new Date(`${s.data}T00:00:00`).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {s.tema_sessao || s.tipo_sessao || 'Sessão de simulador'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
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
            {hasEscalasError ? (
              <WidgetError
                message={escalasQ.error?.message ?? 'Escalas indisponíveis'}
                onRetry={() => escalasQ.refetch()}
              />
            ) : (
              <EscalasSummary escalas={escalas} />
            )}
            {hasAtividadesError ? (
              <WidgetError
                message={atividadesQ.error?.message ?? 'Atividade recente indisponível'}
                onRetry={() => atividadesQ.refetch()}
              />
            ) : (
              <ActivityCard atividades={atividades} />
            )}
          </div>
        </div>

        {/* ── Footer Strip ── */}
        {metrics && <OperationalFooterStrip metrics={metrics} lastUpdated={lastUpdated} />}
      </div>
    </AppLayout>
  );
}

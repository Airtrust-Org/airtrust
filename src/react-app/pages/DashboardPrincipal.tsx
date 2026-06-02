import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Users,
  Gauge,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { WidgetError } from '../components/UI/widget-states';
import { useAuth } from '../hooks/useAuth';
import { canAccessModule } from '../lib/module-access';
import { formatDisplayDate, formatRelativeTime, getOperationStatus, safePct } from './dashboard/helpers';
import { DashboardSkeleton } from './dashboard/DashboardSkeleton';
import {
  useAlertasQuery,
  useEscalasQuery,
  useFrmsAlertasQuery,
  useMetricsQuery,
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

export default function DashboardPrincipal() {
  const { empresas, empresaAtualId } = useAuth();
  const metricsQ = useMetricsQuery();
  const alertasQ = useAlertasQuery();
  const frmsAlertasQ = useFrmsAlertasQuery();
  const escalasQ = useEscalasQuery(!!metricsQ.data);
  const sessoesQ = useSessoesSimuladorQuery(!!metricsQ.data);
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
  const showFrmsCard = canAccessModule('frms', modulosAtivos);
  const showSgsoCard = canAccessModule('sgso', modulosAtivos);

  const criticalQueries = [metricsQ, alertasQ, frmsAlertasQ, escalasQ, sessoesQ];
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
            Nao foi possivel carregar o painel
          </h3>
          <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {metricsQ.error?.message}
          </p>
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
  const alertas = alertasQ.data ?? [];
  const frmsAlertas = frmsAlertasQ.data ?? [];
  const escalas = escalasQ.data ?? [];
  const sessoes = sessoesQ.data ?? [];

  const hasFrmsError = frmsAlertasQ.isError && !frmsAlertasQ.data;
  const hasEscalasError = escalasQ.isError && !escalasQ.data;
  const hasSessoesError = sessoesQ.isError && !sessoesQ.data;
  const hasQualificacoesError = alertasQ.isError && !alertasQ.data;

  const dataUpdatedAt = Math.max(
    metricsQ.dataUpdatedAt || 0,
    alertasQ.dataUpdatedAt || 0,
    frmsAlertasQ.dataUpdatedAt || 0,
    escalasQ.dataUpdatedAt || 0,
    sessoesQ.dataUpdatedAt || 0,
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
  const pendenciasCriticas = qualificacoesVencidas + frmsCriticos.length;

  const handleRefresh = () => {
    void Promise.all([
      metricsQ.refetch(),
      alertasQ.refetch(),
      frmsAlertasQ.refetch(),
      escalasQ.refetch(),
      sessoesQ.refetch(),
    ]);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 md:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50 to-blue-50/60 p-5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-8 h-44 w-44 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Saude operacional hoje
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Painel executivo
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {formatDisplayDate(new Date())}
                {lastUpdated ? (
                  <span className="ml-2">· atualizado {formatRelativeTime(lastUpdated.toISOString())}</span>
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
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                Pendencias criticas (FRMS + vencidas): {pendenciasCriticas}
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRevalidating}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
                {isRevalidating ? 'Atualizando...' : 'Atualizar dados'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 inline-flex rounded-lg bg-slate-100 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Users className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Tripulantes ativos
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                {metrics?.tripulantesAtivos ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 inline-flex rounded-lg bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Gauge className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Em conformidade
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {complianceScore}%
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 inline-flex rounded-lg bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Alertas FRMS pendentes
              </p>
              <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
                {frmsAlertas.length}
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {showFrmsCard ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Operacao / Escalas / Sessoes
                </h2>
              </div>
              <Link to="/escalas" className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                Abrir operacao
              </Link>
            </div>

            {hasEscalasError || hasSessoesError ? (
              <WidgetError
                message={
                  escalasQ.error?.message ||
                  sessoesQ.error?.message ||
                  'Dados operacionais indisponiveis'
                }
                onRetry={() => {
                  void Promise.all([escalasQ.refetch(), sessoesQ.refetch()]);
                }}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Proximas sessoes
                  </p>
                  <div className="mt-2 space-y-2">
                    {sessoes.slice(0, 4).map((sessao) => (
                      <div
                        key={sessao.id}
                        className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-700"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {firstWords(sessao.tema_sessao || sessao.tipo_sessao || 'Sessao de simulador')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {sessao.data} · {sessao.hora_inicio || '--:--'} · {sessao.simulador_nome || 'Simulador'}
                          </p>
                        </div>
                        <Link to="/simuladores" className="text-xs font-bold text-blue-700 dark:text-blue-400">
                          Ver
                        </Link>
                      </div>
                    ))}
                    {sessoes.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Nenhuma sessao futura relevante.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Escalas do periodo
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {escalas.slice(0, 4).map((escala) => (
                      <span
                        key={escala.id}
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                      >
                        {String(escala.mes).padStart(2, '0')}/{String(escala.ano).slice(2)} · {escala.status}
                      </span>
                    ))}
                    {escalas.length === 0 ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Nenhuma escala ativa no periodo.
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>
          ) : null}

          {showSgsoCard ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">FRMS</h2>
              </div>
              <Link to="/frms/alertas" className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                Abrir FRMS
              </Link>
            </div>

            {hasFrmsError ? (
              <WidgetError
                message={frmsAlertasQ.error?.message ?? 'Dados FRMS indisponiveis'}
                onRetry={() => frmsAlertasQ.refetch()}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Criticos</p>
                    <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-300">{frmsCriticos.length}</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pendentes</p>
                    <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300">{frmsAlertas.length}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {frmsCriticos.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-700">
                      <p className="text-xs font-bold uppercase text-red-600 dark:text-red-400">{item.nivel}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{firstWords(item.descricao || item.tipo || 'Alerta FRMS')}</p>
                    </div>
                  ))}
                  {frmsCriticos.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Sem alertas criticos no momento.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Qualificacoes</h2>
              </div>
              <Link
                to="/qualificacoes/alertas"
                className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400"
              >
                Abrir qualificacoes
              </Link>
            </div>

            {hasQualificacoesError ? (
              <WidgetError
                message={alertasQ.error?.message ?? 'Dados de qualificacoes indisponiveis'}
                onRetry={() => alertasQ.refetch()}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Vencidas</p>
                    <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-300">{qualificacoesVencidas}</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Vencendo</p>
                    <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300">
                      {qualificacoesVencendo}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {qualificacoesAlertas.slice(0, 3).map((alerta) => (
                    <div key={alerta.id} className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-700">
                      <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                        {alerta.criticidade}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{firstWords(alerta.mensagem)}</p>
                    </div>
                  ))}
                  {qualificacoesAlertas.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Sem pendencias de qualificacao no momento.
                    </p>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fonte: metricas de qualificacoes + alertas de qualificacao (sem misturar LMS).
                </p>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">SGSO</h2>
              </div>
              <Link to="/sgso" className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400">
                Abrir SGSO
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Bloco estrategico de seguranca
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Nesta fase, a Home nao adiciona nova consulta SGSO para evitar aumento de carga.
                    Use o modulo SGSO para relatos, NCs e acoes abertas.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

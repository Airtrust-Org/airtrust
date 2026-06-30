import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { canAccessModule } from '@/react-app/lib/module-access';
import {
  useAlertasQuery,
  useFrmsAlertasQuery,
  useMetricsQuery,
  useSgsoChecklistQuery,
  useSimuladoresAlertasQuery,
} from '@/react-app/pages/dashboard/queries';
import {
  buildManagerAlerts,
  type ManagerAlertItem,
  type ManagerAlertSeverity,
} from './managerAlertCenter.utils';
import { getSystemTimeZone } from '@/react-app/utils/timezone';

const MANAGER_ALERT_CENTER_ENABLED = false;

function getTodayIsoSaoPaulo() {
  // Usa o timezone configurado pela empresa; fallback 'UTC' (nunca hardcoded).
  // O nome da função é mantido por compatibilidade com os call-sites existentes.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: getSystemTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function severityTone(severity: ManagerAlertSeverity) {
  switch (severity) {
    case 'CRITICO':
      return {
        badge: 'bg-red-100 text-red-700 border-red-200',
        card: 'border-red-200 bg-red-50/60',
      };
    case 'ATENCAO':
      return {
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        card: 'border-amber-200 bg-amber-50/60',
      };
    case 'INFORMATIVO':
      return {
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        card: 'border-blue-200 bg-blue-50/60',
      };
    default:
      return {
        badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        card: 'border-emerald-200 bg-emerald-50/60',
      };
  }
}

function AlertRow({ item }: { item: ManagerAlertItem }) {
  const tone = severityTone(item.severity);

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition-colors ${tone.card}`}
      data-severity={item.severity}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone.badge}`}
            >
              {item.severity}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {item.module}
            </span>
            <span className="text-[11px] text-slate-500">{item.freshness}</span>
          </div>
          <h3 className="mt-2 text-sm font-extrabold text-slate-900">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.description}</p>
        </div>

        <Link
          to={item.href}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          {item.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
        <div>
          <p className="font-bold">Sem alertas críticos</p>
          <p className="mt-1 text-emerald-800">
            Nenhuma ação prioritária foi identificada nas fontes monitoradas nesta versão.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ partialSources }: { partialSources: string[] }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
        <div>
          <p className="font-bold">Não foi possível montar a central de alertas</p>
          <p className="mt-1 text-red-800">
            As fontes monitoradas falharam nesta carga.
            {partialSources.length > 0 ? ` Fontes com erro: ${partialSources.join(', ')}.` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ManagerAlertCenter() {
  if (!MANAGER_ALERT_CENTER_ENABLED) {
    return null;
  }

  const { empresas, empresaAtualId } = useAuth();
  const { isAdmin, isGestor, can } = usePermissions();

  if (!isAdmin && !isGestor) {
    return null;
  }

  const modulosAtivos = empresas.find((empresa) => empresa.id === empresaAtualId)?.modulos_ativos;

  return <ManagerAlertCenterContent modulosAtivos={modulosAtivos} canViewSgso={can('sgso.view')} />;
}

function ManagerAlertCenterContent({
  modulosAtivos,
  canViewSgso,
}: {
  modulosAtivos: unknown;
  canViewSgso: boolean;
}) {
  const enableFrms = canAccessModule('frms', modulosAtivos);
  const enableSgso = canAccessModule('sgso', modulosAtivos) && canViewSgso;
  const enableSimuladores = canAccessModule('simuladores', modulosAtivos);
  const enableQualificacoes = canAccessModule('qualificacoes', modulosAtivos);
  const enableLms = canAccessModule('lms', modulosAtivos);
  const usesDashboardAlerts = enableQualificacoes || enableLms;

  const metricsQ = useMetricsQuery(enableQualificacoes);
  const alertasQ = useAlertasQuery(usesDashboardAlerts);
  const frmsAlertasQ = useFrmsAlertasQuery(enableFrms);
  const sgsoChecklistQ = useSgsoChecklistQuery(enableSgso);
  const simuladoresAlertasQ = useSimuladoresAlertasQuery(enableSimuladores);

  const todayIso = getTodayIsoSaoPaulo();
  const frmsSnapshot = useFrmsOperationalSnapshot({
    data_inicio: todayIso,
    data_fim: todayIso,
    include_inconsistencies: true,
  }, { enabled: enableFrms });

  const partialSources = useMemo(() => {
    const failures: string[] = [];
    if (enableQualificacoes && metricsQ.isError && !metricsQ.data) failures.push('Métricas de qualificações');
    if (usesDashboardAlerts && alertasQ.isError && !alertasQ.data) failures.push('Qualificações/LMS');
    if (enableFrms && frmsAlertasQ.isError && !frmsAlertasQ.data) failures.push('FRMS');
    if (enableFrms && frmsSnapshot.error && frmsSnapshot.data.length === 0) failures.push('Snapshot operacional');
    if (enableSgso && sgsoChecklistQ.isError && !sgsoChecklistQ.data) failures.push('SGSO');
    if (enableSimuladores && simuladoresAlertasQ.isError && !simuladoresAlertasQ.data) {
      failures.push('Simuladores/Fichas');
    }
    return failures;
  }, [
    alertasQ.data,
    alertasQ.isError,
    enableFrms,
    enableQualificacoes,
    enableSgso,
    enableSimuladores,
    frmsAlertasQ.data,
    frmsAlertasQ.isError,
    frmsSnapshot.data.length,
    frmsSnapshot.error,
    metricsQ.data,
    metricsQ.isError,
    sgsoChecklistQ.data,
    sgsoChecklistQ.isError,
    simuladoresAlertasQ.data,
    simuladoresAlertasQ.isError,
    usesDashboardAlerts,
  ]);

  const alerts = useMemo(
    () =>
      buildManagerAlerts({
        todayLabel: new Date(`${todayIso}T00:00:00`).toLocaleDateString('pt-BR'),
        metrics: metricsQ.data,
        dashboardAlerts: alertasQ.data ?? [],
        frmsAlerts: frmsAlertasQ.data ?? [],
        snapshotItems: frmsSnapshot.data,
        snapshotSummary: frmsSnapshot.summary,
        enableFrms,
        sgsoChecklist: sgsoChecklistQ.data,
        simuladoresAlerts: simuladoresAlertasQ.data,
        enableQualificacoes,
        enableLms,
        enableSgso,
        enableSimuladores,
      }),
    [
      alertasQ.data,
      enableFrms,
      enableLms,
      enableQualificacoes,
      enableSgso,
      enableSimuladores,
      frmsAlertasQ.data,
      frmsSnapshot.data,
      frmsSnapshot.summary,
      metricsQ.data,
      sgsoChecklistQ.data,
      simuladoresAlertasQ.data,
      todayIso,
    ],
  );

  const isLoading =
    ((enableQualificacoes &&
      !metricsQ.data &&
      !alertasQ.data &&
      (metricsQ.isLoading || alertasQ.isLoading)) ||
      (enableLms && alertasQ.isLoading && !alertasQ.data)) ||
    (enableFrms &&
      ((frmsAlertasQ.isLoading && !frmsAlertasQ.data) ||
        (frmsSnapshot.loading && frmsSnapshot.data.length === 0))) ||
    (enableSgso && sgsoChecklistQ.isLoading && !sgsoChecklistQ.data) ||
    (enableSimuladores && simuladoresAlertasQ.isLoading && !simuladoresAlertasQ.data);

  const metricsFailed = enableQualificacoes && metricsQ.isError && !metricsQ.data;
  const dashboardAlertsFailed = usesDashboardAlerts && alertasQ.isError && !alertasQ.data;
  const qualificacoesSourcesFailed = enableQualificacoes && metricsFailed && dashboardAlertsFailed;
  const lmsSourcesFailed = enableLms && dashboardAlertsFailed;
  const frmsAlertsFailed = enableFrms && frmsAlertasQ.isError && !frmsAlertasQ.data;
  const frmsSnapshotFailed = enableFrms && Boolean(frmsSnapshot.error) && frmsSnapshot.data.length === 0;
  const frmsSourcesFailed = enableFrms && frmsAlertsFailed && frmsSnapshotFailed;
  const sgsoSourcesFailed = enableSgso && sgsoChecklistQ.isError && !sgsoChecklistQ.data;
  const simuladoresSourcesFailed =
    enableSimuladores && simuladoresAlertasQ.isError && !simuladoresAlertasQ.data;

  const allTrackedSourcesFailed =
    partialSources.length > 0 &&
    alerts.length === 0 &&
    (!enableQualificacoes || qualificacoesSourcesFailed) &&
    (!enableLms || lmsSourcesFailed) &&
    (!enableFrms || frmsSourcesFailed) &&
    (!enableSgso || sgsoSourcesFailed) &&
    (!enableSimuladores || simuladoresSourcesFailed);

  const criticalCount = alerts.filter((item) => item.severity === 'CRITICO').length;
  const attentionCount = alerts.filter((item) => item.severity === 'ATENCAO').length;
  const informativeCount = alerts.filter((item) => item.severity === 'INFORMATIVO').length;
  const includedSources = [
    enableFrms ? 'FRMS/checagem operacional' : null,
    enableSgso ? 'SGSO' : null,
    enableSimuladores ? 'simuladores/fichas' : null,
    enableQualificacoes ? 'qualificações' : null,
    enableLms ? 'LMS obrigatório' : null,
  ].filter(Boolean) as string[];
  const includedSourcesLabel =
    includedSources.length > 0 ? includedSources.join(', ') : 'nenhuma fonte operacional habilitada';

  return (
    <section className="mb-6 rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-amber-50/50 p-5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Central de Alertas do Gestor
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            O que precisa de ação agora
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Visão operacional unificada com prioridade, ação recomendada e links seguros para o módulo de origem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
            {criticalCount} crítico{criticalCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
            {attentionCount} atenção
          </span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
            {informativeCount} informativo{informativeCount === 1 ? '' : 's'}
          </span>
          {partialSources.length > 0 ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              Fontes parciais: {partialSources.join(', ')}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
              Fontes monitoradas sem falha
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? <LoadingState /> : null}
        {!isLoading && allTrackedSourcesFailed ? <ErrorState partialSources={partialSources} /> : null}
        {!isLoading && !allTrackedSourcesFailed && alerts.length === 0 ? <EmptyState /> : null}
        {!isLoading && !allTrackedSourcesFailed && alerts.length > 0 ? (
          <div className="grid gap-3">
            {alerts.map((item) => (
              <AlertRow key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-600 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2">
          <BellRing className="mt-0.5 h-4 w-4 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-700">
              Fontes incluídas nesta versão: {includedSourcesLabel}.
            </p>
            <p className="mt-0.5">
              Fontes pendentes: refinamentos de agregação backend, parametrização de limites e validação autenticada ponta a ponta.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-slate-500" />
          <p>
            Sem PII exposta na Home. Os detalhes permanecem restritos aos módulos já filtrados por tenant e perfil.
          </p>
        </div>
      </div>
    </section>
  );
}

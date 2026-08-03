import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Filter,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { canSeeAdministrativeDashboard } from '../lib/development-module-nav';
import { canAccessModule } from '../lib/module-access';
import { formatDisplayDate, formatRelativeTime, safePct } from './dashboard/helpers';
import { DashboardSkeleton } from './dashboard/DashboardSkeleton';
import {
  type DashboardSectorOption,
  useOperationalSummary,
} from './dashboard/useOperationalSummary';
import type { AlertaRaw, SessaoSimulador, SimuladoresAlertasData } from './dashboard/types';

type OperationalSeverity = 'critical' | 'attention' | 'normal';

type OperationalAction = {
  id: string;
  severity: Exclude<OperationalSeverity, 'normal'>;
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
};

type HorizonItem = {
  id: string;
  title: string;
  detail: string;
  route?: string;
};

const STATUS_CONFIG: Record<
  OperationalSeverity,
  { label: string; description: string; className: string; icon: React.ReactNode }
> = {
  critical: {
    label: 'Crítica',
    description: 'Há situações que exigem decisão imediata.',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  },
  attention: {
    label: 'Atenção',
    description: 'Há pendências ou dados que precisam de acompanhamento.',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    icon: <CircleAlert className="h-4 w-4" aria-hidden="true" />,
  },
  normal: {
    label: 'Normal',
    description: 'Nenhuma ação operacional prioritária foi identificada.',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  },
};

const SOURCE_LABELS: Record<string, string> = {
  metrics: 'Indicadores gerais',
  alertas: 'Qualificações e LMS',
  frms: 'FRMS',
  escalas: 'Escalas',
  simuladores_sessoes: 'Agenda de simuladores',
  simuladores_pendencias: 'Pendências de simuladores',
};

function storageKey(userId: number | string | undefined, empresaId: number | null): string {
  return `airtrust.dashboard.sectors.v2:${empresaId ?? 'none'}:${userId ?? 'anonymous'}`;
}

function readStoredSectorIds(key: string): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(Number))]
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function persistSectorIds(key: string, ids: number[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Prefer a usable dashboard even when storage is unavailable.
  }
}

function normalizeDate(value: string | null | undefined): string {
  return String(value || '').slice(0, 10);
}

function daysFromToday(value: string | null | undefined): number | null {
  const date = normalizeDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = date.split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

function firstWords(value: string | null | undefined, max = 72): string {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Sem descrição';
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function formatSessionDetail(session: SessaoSimulador): string {
  const pieces = [
    session.data,
    session.hora_inicio,
    session.simulador_nome || session.simulador_modelo,
  ]
    .filter(Boolean)
    .map(String);
  return pieces.join(' · ');
}

function sumSimulatorPending(data: SimuladoresAlertasData | null): number {
  if (!data) return 0;
  return (
    Number(data.fichas_pendentes_avaliacao || 0) +
    Number(data.fichas_aguardando_assinatura || 0) +
    Number(data.sessoes_proximas_sem_ficha_completa || 0) +
    Number(data.edicoes_pendentes || 0)
  );
}

function SectorSelector({
  options,
  draftIds,
  appliedIds,
  onDraftChange,
  onApply,
  loading,
}: {
  options: DashboardSectorOption[];
  draftIds: number[];
  appliedIds: number[];
  onDraftChange: (ids: number[]) => void;
  onApply: () => void;
  loading: boolean;
}) {
  const changed = draftIds.join(',') !== appliedIds.join(',');

  const toggleSector = (id: number) => {
    if (draftIds.length === 0) {
      onDraftChange([id]);
      return;
    }
    onDraftChange(
      draftIds.includes(id)
        ? draftIds.filter((sectorId) => sectorId !== id)
        : [...draftIds, id].sort((a, b) => a - b),
    );
  };

  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
        <Filter className="h-4 w-4" aria-hidden="true" />
        <span>
          {appliedIds.length === 0 ? 'Todos os setores' : `${appliedIds.length} setor(es)`}
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Setores exibidos</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            A seleção só consulta novamente quando o filtro é aplicado.
          </p>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={draftIds.length === 0}
            onChange={() => onDraftChange([])}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Todos os setores
          </span>
        </label>

        <div className="max-h-64 overflow-y-auto border-t border-slate-100 pt-2 dark:border-slate-800">
          {options.map((sector) => (
            <label
              key={sector.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={draftIds.includes(sector.id)}
                onChange={() => toggleSector(sector.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
                {sector.nome}
              </span>
              {sector.codigo ? (
                <span className="text-xs text-slate-400 dark:text-slate-500">{sector.codigo}</span>
              ) : null}
            </label>
          ))}
          {options.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500 dark:text-slate-400">
              Nenhum setor ativo disponível.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onApply}
          disabled={!changed || loading}
          className="mt-4 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {loading ? 'Aplicando…' : 'Aplicar filtro'}
        </button>
      </div>
    </details>
  );
}

function PriorityActionList({ actions }: { actions: OperationalAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <ShieldCheck
          className="h-8 w-8 text-emerald-600 dark:text-emerald-300"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-bold text-emerald-900 dark:text-emerald-100">
          Nenhuma ação operacional prioritária
        </p>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
          O escopo selecionado não apresenta pendências críticas ou de atenção.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => {
        const critical = action.severity === 'critical';
        return (
          <Link
            key={action.id}
            to={action.route}
            className={`group flex min-h-[76px] items-center gap-3 rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              critical
                ? 'border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10'
                : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
            }`}
          >
            <div
              className={`rounded-xl p-2 ${
                critical
                  ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
              }`}
            >
              {critical ? (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[11px] font-black uppercase tracking-wide ${
                    critical
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {critical ? 'Crítica' : 'Atenção'}
                </span>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {action.title}
                </p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {action.detail}
              </p>
            </div>
            <span className="hidden items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-300 sm:inline-flex">
              {action.actionLabel}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function HorizonList({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: HorizonItem[];
  emptyText: string;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400">{icon}</span>
        <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const content = (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
              </div>
              {item.route ? (
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              ) : null}
            </>
          );

          return item.route ? (
            <Link
              key={item.id}
              to={item.route}
              className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              {content}
            </Link>
          ) : (
            <div
              key={item.id}
              className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              {content}
            </div>
          );
        })}
        {items.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {emptyText}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPrincipal() {
  const { user, empresas, empresaAtualId } = useAuth();
  const { can, isAdmin, isInstrutor, isAluno } = usePermissions();
  const canViewDashboard = canSeeAdministrativeDashboard(user);
  const currentStorageKey = storageKey(user?.id, empresaAtualId);
  const [appliedSectorIds, setAppliedSectorIds] = useState<number[]>(() =>
    readStoredSectorIds(currentStorageKey),
  );
  const [draftSectorIds, setDraftSectorIds] = useState<number[]>(appliedSectorIds);

  useEffect(() => {
    const restored = readStoredSectorIds(currentStorageKey);
    setAppliedSectorIds(restored);
    setDraftSectorIds(restored);
  }, [currentStorageKey]);

  const summaryQuery = useOperationalSummary(appliedSectorIds, canViewDashboard);

  if (!canViewDashboard) {
    return <Navigate to="/funcionarios" replace />;
  }

  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
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

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  if (summaryQuery.isError && !summaryQuery.data) {
    return (
      <AppLayout>
        <div className="mx-auto flex min-h-[420px] max-w-2xl flex-col items-center justify-center rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-slate-900">
          <div className="rounded-full bg-red-50 p-4 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-100">
            Não foi possível carregar o painel
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {summaryQuery.error?.message}
          </p>
          <button
            type="button"
            onClick={() => summaryQuery.refetch()}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-100 dark:text-slate-900"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      </AppLayout>
    );
  }

  const summary = summaryQuery.data;
  const metrics = summary?.metrics ?? null;
  const alerts = summary?.alertas ?? [];
  const frmsAlerts = summary?.frmsAlertas ?? [];
  const scales = summary?.escalas ?? [];
  const sessions = summary?.sessoes ?? [];
  const simulatorAlerts = summary?.simuladoresAlertas ?? null;
  const unavailableSources = summary?.unavailableSources ?? [];
  const sectorOptions = summary?.scope.sectorOptions ?? [];

  const selectedSectorNames = sectorOptions
    .filter((sector) => summary?.scope.selectedSetorIds.includes(sector.id))
    .map((sector) => sector.nome);
  const scopeLabel = summary?.scope.selectable
    ? appliedSectorIds.length === 0
      ? 'Todos os setores'
      : selectedSectorNames.join(', ') || `${appliedSectorIds.length} setor(es)`
    : selectedSectorNames.join(', ') || 'Setor atribuído ao gestor';

  const qualificationAlerts = alerts.filter(
    (alert) => String(alert.tipo || '').toLowerCase() === 'qualificacao_vencendo',
  );
  const expiredQualificationAlerts = qualificationAlerts.filter(
    (alert) => Number(alert.diasRestantes) <= 0,
  );
  const dueQualificationAlerts = qualificationAlerts.filter(
    (alert) => Number(alert.diasRestantes) > 0,
  );
  const criticalFrms = frmsAlerts.filter(
    (alert) => alert.nivel === 'CRITICO' || alert.nivel === 'VIOLACAO',
  );
  const draftScales = scales.filter((scale) => scale.status === 'rascunho');

  const actions: OperationalAction[] = [];

  if (showQualificacoes) {
    expiredQualificationAlerts.slice(0, 3).forEach((alert: AlertaRaw) => {
      const overdueDays = Math.abs(Number(alert.diasRestantes || 0));
      actions.push({
        id: `qualification-${alert.id}`,
        severity: 'critical',
        title: `${firstWords(alert.qualificacaoNome, 48)} vencida`,
        detail: `${alert.tripulanteNome || 'Tripulante'} · ${overdueDays === 0 ? 'vence hoje' : `vencida há ${overdueDays} dia(s)`}`,
        route: alert.urlAcao || '/qualificacoes/alertas',
        actionLabel: 'Resolver',
      });
    });

    const expiredTotal = Number(
      metrics?.qualificacoesVencidas || expiredQualificationAlerts.length,
    );
    const remainingExpired = Math.max(
      expiredTotal - Math.min(expiredQualificationAlerts.length, 3),
      0,
    );
    if (remainingExpired > 0) {
      actions.push({
        id: 'qualification-expired-remaining',
        severity: 'critical',
        title: `${remainingExpired} outra(s) qualificação(ões) vencida(s)`,
        detail: 'Há registros adicionais que exigem planejamento de renovação.',
        route: '/qualificacoes/alertas',
        actionLabel: 'Ver alertas',
      });
    }

    if (expiredTotal === 0 && dueQualificationAlerts.length > 0) {
      actions.push({
        id: 'qualification-due',
        severity: 'attention',
        title: `${dueQualificationAlerts.length} qualificação(ões) vencendo`,
        detail: 'Planeje as renovações antes que afetem a disponibilidade operacional.',
        route: '/qualificacoes/alertas',
        actionLabel: 'Planejar',
      });
    }

    const lmsPending = alerts.filter(
      (alert) => String(alert.tipo || '').toLowerCase() === 'lms_curso_pendente',
    );
    if (lmsPending.length > 0) {
      actions.push({
        id: 'lms-pending',
        severity: 'attention',
        title: `${lmsPending.length} curso(s) obrigatório(s) pendente(s)`,
        detail: 'Existem requisitos de LMS ainda não concluídos no escopo selecionado.',
        route: '/lms',
        actionLabel: 'Acompanhar',
      });
    }
  }

  if (showFrms && criticalFrms.length > 0) {
    actions.push({
      id: 'frms-critical',
      severity: 'critical',
      title: `${criticalFrms.length} alerta(s) crítico(s) de FRMS`,
      detail: 'Há condição de fadiga crítica ou violação que requer avaliação operacional.',
      route: '/frms/alertas',
      actionLabel: 'Avaliar',
    });
  } else if (showFrms && frmsAlerts.length > 0) {
    actions.push({
      id: 'frms-attention',
      severity: 'attention',
      title: `${frmsAlerts.length} alerta(s) de FRMS pendente(s)`,
      detail: 'Revise as condições sinalizadas para o período atual.',
      route: '/frms/alertas',
      actionLabel: 'Revisar',
    });
  }

  if (showSimuladores && simulatorAlerts) {
    const pendingEvaluations = Number(simulatorAlerts.fichas_pendentes_avaliacao || 0);
    const sessionsWithoutFile = Number(simulatorAlerts.sessoes_proximas_sem_ficha_completa || 0);
    const pendingSignatures = Number(simulatorAlerts.fichas_aguardando_assinatura || 0);
    const pendingEdits = Number(simulatorAlerts.edicoes_pendentes || 0);

    if (pendingEvaluations > 0 || sessionsWithoutFile > 0) {
      actions.push({
        id: 'simulator-critical',
        severity: 'critical',
        title: `${pendingEvaluations + sessionsWithoutFile} pendência(s) crítica(s) de simulador`,
        detail: `${pendingEvaluations} avaliação(ões) pendente(s) · ${sessionsWithoutFile} sessão(ões) sem ficha completa`,
        route: '/simuladores',
        actionLabel: 'Resolver',
      });
    }
    if (pendingSignatures > 0 || pendingEdits > 0) {
      actions.push({
        id: 'simulator-attention',
        severity: 'attention',
        title: `${pendingSignatures + pendingEdits} pendência(s) documental(is)`,
        detail: `${pendingSignatures} assinatura(s) · ${pendingEdits} edição(ões) aguardando conclusão`,
        route: '/simuladores',
        actionLabel: 'Revisar',
      });
    }
  }

  if (showEscalas && draftScales.length > 0) {
    const scale = draftScales[0];
    actions.push({
      id: `scale-${scale.id}`,
      severity: 'attention',
      title: `Escala ${String(scale.mes).padStart(2, '0')}/${scale.ano} em rascunho`,
      detail: 'A escala ainda não avançou para revisão ou publicação.',
      route: '/escalas',
      actionLabel: 'Revisar',
    });
  }

  actions.sort((a, b) => Number(a.severity === 'attention') - Number(b.severity === 'attention'));
  const visibleActions = actions.slice(0, 6);

  const status: OperationalSeverity = visibleActions.some(
    (action) => action.severity === 'critical',
  )
    ? 'critical'
    : visibleActions.length > 0 || unavailableSources.length > 0
      ? 'attention'
      : 'normal';
  const statusConfig = STATUS_CONFIG[status];

  const next24Hours: HorizonItem[] = showSimuladores
    ? sessions
        .filter((session: SessaoSimulador) => {
          const days = daysFromToday(session.data);
          return days !== null && days >= 0 && days <= 1;
        })
        .slice(0, 5)
        .map((session: SessaoSimulador) => ({
          id: `session-24-${session.id}`,
          title: firstWords(session.tema_sessao || session.tipo_sessao || 'Sessão de simulador'),
          detail: formatSessionDetail(session),
          route: '/simuladores',
        }))
    : [];

  const next7Days: HorizonItem[] = [];
  if (showQualificacoes) {
    dueQualificationAlerts
      .filter((alert) => Number(alert.diasRestantes) <= 7)
      .slice(0, 3)
      .forEach((alert) => {
        next7Days.push({
          id: `qualification-week-${alert.id}`,
          title: `${firstWords(alert.qualificacaoNome, 52)} vence em ${alert.diasRestantes} dia(s)`,
          detail: alert.tripulanteNome || 'Tripulante não informado',
          route: alert.urlAcao || '/qualificacoes/alertas',
        });
      });
  }
  if (showSimuladores) {
    sessions
      .filter((session) => {
        const days = daysFromToday(session.data);
        return days !== null && days >= 2 && days <= 7;
      })
      .slice(0, 3)
      .forEach((session) => {
        next7Days.push({
          id: `session-week-${session.id}`,
          title: firstWords(session.tema_sessao || session.tipo_sessao || 'Sessão de simulador'),
          detail: formatSessionDetail(session),
          route: '/simuladores',
        });
      });
  }

  const activeCrew = metrics?.tripulantesAtivos ?? null;
  const crewWithoutExpired = metrics
    ? Math.max(metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas, 0)
    : null;
  const qualificationCoverage =
    metrics && crewWithoutExpired !== null
      ? safePct(crewWithoutExpired, metrics.tripulantesAtivos)
      : null;
  const simulatorPendingTotal = sumSimulatorPending(simulatorAlerts);

  const applySectorFilter = () => {
    const normalized = [...new Set(draftSectorIds)].sort((a, b) => a - b);
    setAppliedSectorIds(normalized);
    persistSectorIds(currentStorageKey, normalized);
  };

  return (
    <AppLayout>
      <main className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 md:px-6 md:py-6">
        <section className="relative overflow-visible rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-5 shadow-[0_20px_55px_-38px_rgba(15,23,42,0.8)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 md:p-6">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Painel operacional
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
                Decisões do escopo selecionado
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {formatDisplayDate(new Date())} · {scopeLabel}
                {summary?.generatedAt ? (
                  <span> · atualizado {formatRelativeTime(summary.generatedAt)}</span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && summary?.scope.selectable ? (
                <SectorSelector
                  options={sectorOptions}
                  draftIds={draftSectorIds}
                  appliedIds={appliedSectorIds}
                  onDraftChange={setDraftSectorIds}
                  onApply={applySectorFilter}
                  loading={summaryQuery.isFetching}
                />
              ) : (
                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  <span>{scopeLabel}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => summaryQuery.refetch()}
                disabled={summaryQuery.isFetching}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw
                  className={`h-4 w-4 ${summaryQuery.isFetching ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {summaryQuery.isFetching ? 'Atualizando…' : 'Atualizar'}
              </button>
            </div>
          </div>

          <div
            className={`relative mt-5 flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center ${statusConfig.className}`}
            aria-live="polite"
          >
            <div className="flex items-center gap-2 font-black">
              {statusConfig.icon}
              <span>Situação {statusConfig.label}</span>
            </div>
            <p className="text-sm opacity-90">{statusConfig.description}</p>
            <span className="text-xs font-bold uppercase tracking-wide sm:ml-auto">
              {visibleActions.length} ação(ões) prioritária(s)
            </span>
          </div>
        </section>

        {unavailableSources.length > 0 ? (
          <section
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            role="status"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">Painel carregado com dados parciais</p>
              <p className="mt-1 text-xs">
                Fontes indisponíveis:{' '}
                {unavailableSources.map((source) => SOURCE_LABELS[source] || source).join(', ')}.
                Nenhuma fonte indisponível foi interpretada como situação normal.
              </p>
            </div>
          </section>
        ) : null}

        {summary?.scope.ignoredRequestedSetorIds ? (
          <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Parte da seleção salva não pertence mais ao escopo autorizado e foi ignorada com
            segurança.
          </section>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Prioridade
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                  Ações que exigem decisão
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Máximo de 6 itens, ordenados por gravidade
              </p>
            </div>
            <PriorityActionList actions={visibleActions} />
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Escopo atual
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scopeLabel}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {summary?.scope.selectable
                ? 'Os números abaixo consideram somente os setores aplicados no filtro.'
                : 'O escopo foi definido automaticamente pelas atribuições do gestor.'}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSectorNames.slice(0, 8).map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {name}
                </span>
              ))}
              {selectedSectorNames.length > 8 ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  +{selectedSectorNames.length - 8}
                </span>
              ) : null}
            </div>

            <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Setores aplicados</dt>
                <dd className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {selectedSectorNames.length}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Pendências de simulador
                </dt>
                <dd className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {showSimuladores ? simulatorPendingTotal : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Fontes disponíveis</dt>
                <dd className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {6 - unavailableSources.length}/6
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <HorizonList
            title="Próximas 24 horas"
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            items={next24Hours}
            emptyText="Nenhuma sessão de simulador relevante nas próximas 24 horas."
          />
          <HorizonList
            title="Próximos 7 dias"
            icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            items={next7Days.slice(0, 5)}
            emptyText="Nenhum vencimento ou sessão relevante identificado para os próximos 7 dias."
          />
        </div>

        <section aria-labelledby="context-metrics-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Contexto
              </p>
              <h2
                id="context-metrics-title"
                className="mt-1 text-base font-black text-slate-950 dark:text-white"
              >
                Indicadores do escopo selecionado
              </h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              label="Tripulantes ativos"
              value={activeCrew === null ? '—' : String(activeCrew)}
              helper="Somente pessoas ativas no escopo"
            />
            <MetricCard
              icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
              label="Sem qualificação vencida"
              value={qualificationCoverage === null ? '—' : `${qualificationCoverage}%`}
              helper="Indicador específico de qualificações"
            />
            <MetricCard
              icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
              label="Treinamentos em 30 dias"
              value={metrics ? String(metrics.demandaFutura30Dias || 0) : '—'}
              helper="Demanda futura já prevista"
            />
            <MetricCard
              icon={<Activity className="h-4 w-4" aria-hidden="true" />}
              label="LMS em andamento"
              value={metrics?.lms ? String(metrics.lms.emAndamento || 0) : '—'}
              helper="Matrículas ainda não concluídas"
            />
          </div>
        </section>

        <p className="pb-2 text-center text-xs text-slate-400 dark:text-slate-500">
          O painel resume decisões; os módulos permanecem como fonte detalhada e auditável dos
          registros.
        </p>
      </main>
    </AppLayout>
  );
}

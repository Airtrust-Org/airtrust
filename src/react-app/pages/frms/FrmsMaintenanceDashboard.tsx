import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import {
  useFrmsMaintenanceTeam,
  useFrmsOperationalAccess,
  type FrmsMaintenanceTeamItem,
} from '@/react-app/hooks/useFrmsOperationalAccess';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';
import {
  classifyMaintenanceItem,
  maintenanceActionText,
  readinessLabel,
  type MaintenanceDecisionBucket,
} from './frmsMaintenanceDecision';

const BUCKET_STYLE: Record<MaintenanceDecisionBucket, { label: string; className: string; dot: string }> = {
  CRITICAL: {
    label: 'Revisão imediata',
    className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
    dot: 'bg-red-500',
  },
  ATTENTION: {
    label: 'Atenção',
    className: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
    dot: 'bg-orange-500',
  },
  PENDING: {
    label: 'Pendente',
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    dot: 'bg-amber-400',
  },
  NORMAL: {
    label: 'Sem pendência',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
};

function localTodayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function MetricCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</div>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function DecisionBadge({ bucket }: { bucket: MaintenanceDecisionBucket }) {
  const style = BUCKET_STYLE[bucket];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style.className}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function checkinLabel(item: FrmsMaintenanceTeamItem): string {
  if (!item.checkin_id) return 'Pendente';
  const risk = String(item.computed_risk_level || '').toLowerCase();
  if (risk === 'critical' || risk === 'unfit_for_duty') return 'Crítico';
  if (risk === 'attention') return 'Atenção';
  return 'Recebido';
}

function cargoLabel(item: FrmsMaintenanceTeamItem): string {
  return item.cargo?.trim() || item.funcao?.trim() || 'Cargo não informado';
}

function maintenanceScopeLabel(source: string | undefined): string {
  if (source === 'tenant_admin') {
    return 'Escopo: todos os setores de manutenção deste tenant';
  }
  if (source === 'frms_manager') {
    return 'Escopo: manutenção sob a gestão central de fadiga';
  }
  return 'Escopo: setores de manutenção atribuídos ao gestor';
}

export default function FrmsMaintenanceDashboard() {
  const [date, setDate] = useState(localTodayIso());
  const access = useFrmsOperationalAccess();
  const canManage = access.data?.can_manage_maintenance === true;
  const canOpenOwnMaintenanceCheckin = access.data?.frms_profile === 'maintenance';
  const team = useFrmsMaintenanceTeam(date, canManage);
  const items = team.data?.items || [];

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc[classifyMaintenanceItem(item)] += 1;
          return acc;
        },
        { CRITICAL: 0, ATTENTION: 0, PENDING: 0, NORMAL: 0 } as Record<MaintenanceDecisionBucket, number>,
      ),
    [items],
  );

  if (access.isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-6xl space-y-3 p-4">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        </div>
      </AppLayout>
    );
  }

  if (access.isError || !canManage) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl p-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <h1 className="font-bold">Acesso restrito à fadiga da manutenção</h1>
                <p className="mt-1 text-sm">
                  Esta área é exclusiva da gestão de fadiga autorizada para manutenção e de administradores do tenant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <FrmsWorkspaceNav />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <Wrench className="h-4 w-4" /> FRMS · Manutenção
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Fadiga da Manutenção</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Fadiga e prontidão de Mecânicos e Inspetores. Esta visão é separada da operação de voo e não mistura tripulação nem dados de despacho.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {canOpenOwnMaintenanceCheckin ? (
              <Link
                to="/frms?view=checkin"
                className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                Meu check-in
              </Link>
            ) : null}
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Data de referência
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void team.refetch()}
              disabled={team.isFetching}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <RefreshCw className={`h-4 w-4 ${team.isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </header>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
          {maintenanceScopeLabel(team.data?.meta.access_source)} · Profissionais: cargo Mecânico/Inspetor · Fonte: check-in FRMS + PVT/Readiness
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo de manutenção">
          <MetricCard label="Revisão imediata" value={counts.CRITICAL} helper="sinal crítico de fadiga ou prontidão" />
          <MetricCard label="Atenção" value={counts.ATTENTION} helper="requer avaliação e mitigação" />
          <MetricCard label="Pendentes" value={counts.PENDING} helper="check-in ou PVT ainda não registrado" />
          <MetricCard label="Sem pendência" value={counts.NORMAL} helper="monitoramento normal" />
        </section>

        {team.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {team.error instanceof Error ? team.error.message : 'Não foi possível carregar a equipe de manutenção.'}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Equipe de manutenção</h2>
              <p className="text-xs text-slate-500">A prioridade considera fadiga diária e prontidão objetiva.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{items.length} profissional(is)</span>
          </div>

          {team.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 font-bold text-slate-900 dark:text-white">Nenhum Mecânico ou Inspetor no escopo</h3>
              <p className="mt-1 text-sm text-slate-500">Não há profissional de manutenção ativo no escopo autorizado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-3 text-left">Profissional</th>
                    <th className="px-4 py-3 text-left">Check-in</th>
                    <th className="px-4 py-3 text-left">Sono</th>
                    <th className="px-4 py-3 text-left">KSS</th>
                    <th className="px-4 py-3 text-left">Prontidão</th>
                    <th className="px-4 py-3 text-left">Situação</th>
                    <th className="px-4 py-3 text-left">Conduta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {items
                    .map((item) => ({ item, bucket: classifyMaintenanceItem(item) }))
                    .sort((a, b) => {
                      const priority: Record<MaintenanceDecisionBucket, number> = {
                        CRITICAL: 0,
                        ATTENTION: 1,
                        PENDING: 2,
                        NORMAL: 3,
                      };
                      const delta = priority[a.bucket] - priority[b.bucket];
                      if (delta !== 0) return delta;
                      return a.item.funcionario_nome.localeCompare(b.item.funcionario_nome, 'pt-BR');
                    })
                    .map(({ item, bucket }) => (
                      <tr key={item.funcionario_id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950 dark:text-white">{item.funcionario_nome}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{cargoLabel(item)} · {item.setor_nome || 'Manutenção'}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{checkinLabel(item)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {item.horas_sono == null ? '—' : `${Number(item.horas_sono).toFixed(1)} h`}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.kss_score ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800 dark:text-slate-100">{readinessLabel(item.readiness_classification)}</span>
                          {item.readiness_id && item.baseline_ready !== 1 ? (
                            <p className="mt-0.5 text-xs text-slate-500">{item.baseline_sessions ?? 0} sessão(ões) de baseline</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3"><DecisionBadge bucket={bucket} /></td>
                        <td className="max-w-sm px-4 py-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {maintenanceActionText(bucket)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <ShieldAlert className="h-5 w-5 flex-none text-red-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Revisão imediata</p><p className="text-xs text-slate-500">Não é decisão médica automática; exige avaliação operacional antes de tarefa crítica.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <AlertTriangle className="h-5 w-5 flex-none text-orange-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Atenção</p><p className="text-xs text-slate-500">Considere pausa, redistribuição, supervisão ou inspeção independente conforme a tarefa.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <Clock3 className="h-5 w-5 flex-none text-amber-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Pendente</p><p className="text-xs text-slate-500">Ausência de dado não é tratada como condição normal.</p></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

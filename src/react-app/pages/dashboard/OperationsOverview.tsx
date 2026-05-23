import React from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import { safePct, dateDiffInDays } from './helpers';
import type { DashboardMetrics, ComplianceData, FrmsAlertaRaw, TreinamentoPlanejadoItem } from './types';

interface OperationsOverviewProps {
  metrics: DashboardMetrics;
  compliance: ComplianceData;
  frmsAlertas: FrmsAlertaRaw[];
  treinamentos: TreinamentoPlanejadoItem[];
}

export const OperationsOverview = React.memo(function OperationsOverview({
  metrics,
  compliance,
  frmsAlertas: _frmsAlertas,
  treinamentos,
}: OperationsOverviewProps) {
  const tripulantesEmDia = Math.max(metrics.tripulantesAtivos - metrics.tripulantesComQualificacoesVencidas, 0);
  const score = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  const meta = compliance.metaOrganizacional || 90;
  const tripulantesEmDiaPct = safePct(tripulantesEmDia, metrics.tripulantesAtivos);
  const tripulantesComVencimentoPct = safePct(metrics.tripulantesComQualificacoesVencendo, metrics.tripulantesAtivos);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const treinamentosPeriodo = treinamentos.filter((t) => dateDiffInDays(String(t.data_prevista || ''), hoje) >= 0).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              Visão geral
            </p>
            <p className="mt-0.5 text-xl font-black leading-none text-slate-900 dark:text-slate-100">{score}%</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Compliance {score >= meta ? 'acima' : 'abaixo'} da meta {meta}%
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Tripulantes em dia
            </span>
            <span>{tripulantesEmDiaPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, tripulantesEmDiaPct)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Com vencimento em 30 dias
            </span>
            <span>{tripulantesComVencimentoPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, tripulantesComVencimentoPct)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {metrics.demandaFutura30Dias > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            {metrics.demandaFutura30Dias} em 30 dias
          </span>
        )}
        {metrics.demandaFutura60Dias > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            {metrics.demandaFutura60Dias} em 60 dias
          </span>
        )}
        {metrics.demandaFutura90Dias > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
            {metrics.demandaFutura90Dias} em 90 dias
          </span>
        )}
        {treinamentosPeriodo > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {treinamentosPeriodo} planejado(s)
          </span>
        )}
      </div>
    </section>
  );
});

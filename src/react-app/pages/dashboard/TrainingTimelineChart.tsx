import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { dateDiffInDays } from './helpers';
import type { DashboardMetrics, TreinamentoPlanejadoItem, SessaoSimulador } from './types';

interface TrainingTimelineChartProps {
  metrics: DashboardMetrics;
  treinamentos: TreinamentoPlanejadoItem[];
  sessoes: SessaoSimulador[];
}

export const TrainingTimelineChart = React.memo(function TrainingTimelineChart({
  metrics,
  treinamentos,
  sessoes,
}: TrainingTimelineChartProps) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const countInWindow = (from: number, to: number) => {
    const treino = treinamentos.filter((t) => dateDiffInDays(String(t.data_prevista || ''), hoje) >= from && dateDiffInDays(String(t.data_prevista || ''), hoje) < to).length;
    const sim = sessoes.filter((s) => {
      const d = dateDiffInDays(String(s.data || '').split('T')[0], hoje);
      return d >= from && d < to;
    }).length;
    return treino + sim;
  };

  const v30 = countInWindow(0, 30) || metrics.demandaFutura30Dias;
  const v60 = countInWindow(30, 60) || Math.max(metrics.demandaFutura60Dias - metrics.demandaFutura30Dias, 0);
  const v90 = countInWindow(60, 90) || Math.max(metrics.demandaFutura90Dias - metrics.demandaFutura60Dias, 0);

  const rows = [
    { label: '0-30 dias', value: v30, color: metrics.qualificacoesVencidas > 0 ? 'bg-red-500' : 'bg-blue-500', href: '/qualificacoes/alertas' },
    { label: '31-60 dias', value: v60, color: 'bg-slate-300 dark:bg-slate-600', href: '/qualificacoes/alertas' },
    { label: '61-90 dias', value: v90, color: 'bg-slate-200 dark:bg-slate-700', href: '/qualificacoes/alertas' },
  ];

  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const totalEventos = rows.reduce((acc, row) => acc + row.value, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Treinamentos e Simulador
          </p>
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Carga futura</h3>
        </div>
        <Link
          to="/qualificacoes?tab=planejados"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Planejar <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <Link key={row.label} to={row.href} className="block group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded-xl">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200">
                {row.label}
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {row.value > 0 ? `${row.value} evento(s)` : '-'}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${row.color}`}
                style={{ width: `${Math.max(row.value > 0 ? 6 : 0, (row.value / maxVal) * 100)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>

      {totalEventos === 0 ? (
        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Nenhuma demanda programada nos próximos 90 dias.
        </p>
      ) : (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <span className="text-xs text-slate-500 dark:text-slate-400">Total nos próximos 90 dias</span>
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{totalEventos}</span>
        </div>
      )}
    </section>
  );
});

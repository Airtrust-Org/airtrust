import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { DashboardMetrics } from './types';

interface DemandaCardProps {
  metrics: DashboardMetrics;
}

export const DemandaCard = React.memo(function DemandaCard({ metrics }: DemandaCardProps) {
  const rows = [
    { label: 'Próximos 30 dias', total: metrics.demandaFutura30Dias, cls: 'bg-blue-500', href: '/qualificacoes?status=vencendo' },
    { label: '31 – 60 dias', total: Math.max(metrics.demandaFutura60Dias - metrics.demandaFutura30Dias, 0), cls: 'bg-slate-300 dark:bg-slate-600', href: '/qualificacoes/alertas' },
    { label: '61 – 90 dias', total: Math.max(metrics.demandaFutura90Dias - metrics.demandaFutura60Dias, 0), cls: 'bg-slate-200 dark:bg-slate-700', href: '/qualificacoes/alertas' },
  ];
  const max = Math.max(...rows.map((r) => r.total), 1);
  const totalDemanda = rows.reduce((acc, row) => acc + row.total, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Demanda de treinamento
          </h3>
        </div>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Planejar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {totalDemanda === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-400 dark:text-slate-500">
          Nenhuma demanda de treinamento programada nos próximos 90 dias.
        </p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {rows.map((row) => (
            <Link key={row.label} to={row.href} className="block focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded-xl">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-300">{row.label}</span>
                <span className="text-slate-500 dark:text-slate-400">{row.total} sessões</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full ${row.cls}`} style={{ width: `${Math.max(5, (row.total / max) * 100)}%` }} />
              </div>
            </Link>
          ))}
          <p className="pt-1 text-xs italic text-slate-400 dark:text-slate-500">
            Baseado no volume operacional capturado pelo AirTrust.
          </p>
        </div>
      )}
    </div>
  );
});

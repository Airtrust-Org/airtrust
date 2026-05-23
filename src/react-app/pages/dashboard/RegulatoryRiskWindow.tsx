import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DashboardMetrics } from './types';

interface RegulatoryRiskWindowProps {
  metrics: DashboardMetrics;
}

export const RegulatoryRiskWindow = React.memo(function RegulatoryRiskWindow({ metrics }: RegulatoryRiskWindowProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Janela de risco regulatório
        </h3>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Ver pendências <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-500/20 dark:bg-red-500/10">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Vencidas</p>
          <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-400">{metrics.qualificacoesVencidas}</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3 py-3 dark:border-orange-500/20 dark:bg-orange-500/10">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
            Vencem em 30d
          </p>
          <p className="mt-1 text-2xl font-black text-orange-700 dark:text-orange-400">{metrics.qualificacoesAVencer}</p>
        </div>
      </div>
    </section>
  );
});

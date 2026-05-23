import React from 'react';
import { formatRelativeTime } from './helpers';
import type { DashboardMetrics } from './types';

interface OperationalFooterStripProps {
  metrics: DashboardMetrics;
  lastUpdated: Date | null;
}

export const OperationalFooterStrip = React.memo(function OperationalFooterStrip({
  metrics,
  lastUpdated,
}: OperationalFooterStripProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-3 dark:text-slate-400">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Previsão 60 dias
          </p>
          <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
            {metrics.demandaFutura60Dias} treinamentos no pipeline
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            LMS em andamento
          </p>
          <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
            {metrics.lms?.emAndamento ?? 0} matrículas ativas
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Atualização</p>
          <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
            {lastUpdated ? formatRelativeTime(lastUpdated.toISOString()) : 'agora'}
          </p>
        </div>
      </div>
    </section>
  );
});

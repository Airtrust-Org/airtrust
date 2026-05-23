import React from 'react';
import { Link } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import { FRMS_NIVEL_CONF } from './constants';
import type { FrmsAlertaRaw } from './types';

interface FrmsSummaryProps {
  frmsAlertas: FrmsAlertaRaw[];
}

export const FrmsSummary = React.memo(function FrmsSummary({ frmsAlertas }: FrmsSummaryProps) {
  const niveis = (['VIOLACAO', 'CRITICO', 'ATENCAO', 'AVISO'] as const).map((nivel) => ({
    nivel,
    conf: FRMS_NIVEL_CONF[nivel],
    count: frmsAlertas.filter((f) => f.nivel === nivel).length,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">FRMS — Fadiga</h3>
        </div>
        <Link
          to="/frms/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Ver painel <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {niveis.map(({ nivel, conf, count }) => (
          <Link
            key={nivel}
            to="/frms/alertas"
            className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-slate-800/50"
          >
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${conf.dot}`} />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{conf.label}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${count > 0 ? conf.cls : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
              {count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
});

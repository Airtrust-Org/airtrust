import React from 'react';
import { Link } from 'react-router-dom';
import { PlaneTakeoff, ChevronRight } from 'lucide-react';
import { ESCALA_STATUS_CONF, MESES_ABR } from './constants';
import type { EscalaItem } from './types';

interface EscalasSummaryProps {
  escalas: EscalaItem[];
}

export const EscalasSummary = React.memo(function EscalasSummary({ escalas }: EscalasSummaryProps) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const escalasRelevantes = escalas
    .filter((e) => {
      if (e.ano > anoAtual) return true;
      if (e.ano === anoAtual && e.mes >= mesAtual) return true;
      return false;
    })
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <PlaneTakeoff className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Escalas</h3>
        </div>
        <Link
          to="/escalas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Gerenciar <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {escalasRelevantes.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">Nenhuma escala encontrada.</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {escalasRelevantes.map((e) => {
            const conf = ESCALA_STATUS_CONF[e.status] ?? ESCALA_STATUS_CONF.rascunho;
            return (
              <Link
                key={e.id}
                to="/escalas"
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-slate-800/50"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {MESES_ABR[(e.mes - 1) % 12]}/{String(e.ano).slice(2)}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${conf.cls}`}>
                  {conf.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
});

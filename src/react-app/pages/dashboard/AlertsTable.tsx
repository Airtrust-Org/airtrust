import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldCheck, ChevronRight } from 'lucide-react';
import { initials, resolveTripulanteIdFromAlerta } from './helpers';
import type { AlertaRaw } from './types';

interface AlertsTableProps {
  alertas: AlertaRaw[];
}

function criticidadeBadge(dias: number) {
  if (dias <= 0) return { label: 'Expirada', cls: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' };
  if (dias <= 7) return { label: `${dias}d`, cls: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' };
  if (dias <= 15) return { label: `${dias}d`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' };
  return { label: `${dias}d`, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

export const AlertsTable = React.memo(function AlertsTable({ alertas }: AlertsTableProps) {
  const sorted = [...alertas].sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 5);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Alertas de qualificação
          </h3>
        </div>
        <Link
          to="/qualificacoes/alertas"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8">
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhum alerta ativo</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Todas as qualificações estão em dia.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {sorted.map((a) => {
            const badge = criticidadeBadge(a.diasRestantes);
            const tripulanteId = resolveTripulanteIdFromAlerta(a);
            const fichaUrl = tripulanteId ? `/funcionarios/${tripulanteId}/ficha` : null;
            return (
              <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {initials(a.tripulanteNome)}
                </div>
                <div className="min-w-0 flex-1">
                  {fichaUrl ? (
                    <Link
                      to={fichaUrl}
                      className="truncate text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-slate-100 dark:hover:text-blue-400"
                    >
                      {a.tripulanteNome}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{a.tripulanteNome}</p>
                  )}
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{a.qualificacaoNome}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>
                  {badge.label}
                </span>
                <Link
                  to={a.urlAcao || '/qualificacoes/alertas'}
                  className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  Ação
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

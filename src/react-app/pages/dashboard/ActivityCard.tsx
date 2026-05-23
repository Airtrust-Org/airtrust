import React from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { formatRelativeTime } from './helpers';
import type { AtividadeRecente } from './types';

interface ActivityCardProps {
  atividades: AtividadeRecente[];
}

const colorMap: Record<string, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
};

export const ActivityCard = React.memo(function ActivityCard({ atividades }: ActivityCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Atividade recente
          </h3>
        </div>
      </div>
      {atividades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Activity className="mb-2 h-8 w-8 text-slate-200 dark:text-slate-700" />
          <p className="text-xs text-slate-400 dark:text-slate-500">Nenhuma atividade recente registrada.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {atividades.slice(0, 4).map((a) => (
            <div key={a.id} className="flex gap-3 px-5 py-3">
              <div className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colorMap[a.cor ?? ''] ?? 'bg-slate-400'}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{a.descricao}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {formatRelativeTime(a.timestamp)}
                  {a.tripulanteNome ? ` · ${a.tripulanteNome}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-700">
        <Link to="/atividade" className="text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400">
          Ver histórico
        </Link>
      </div>
    </div>
  );
});

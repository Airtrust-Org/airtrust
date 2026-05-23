import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { TreinamentoPlanejadoItem } from './types';

interface PlannedTrainingsCardProps {
  treinamentos: TreinamentoPlanejadoItem[];
}

function titleFor(item: TreinamentoPlanejadoItem) {
  return item.titulo?.trim() || item.qualificacao_nome || 'Treinamento planejado';
}

export const PlannedTrainingsCard = React.memo(function PlannedTrainingsCard({ treinamentos }: PlannedTrainingsCardProps) {
  const hoje = new Date();
  const sorted = [...treinamentos]
    .sort((a, b) => String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')))
    .slice(0, 7);

  const getChip = (dataPrevista: string) => {
    const data = new Date(`${dataPrevista}T00:00:00`);
    const diff = Math.floor((data.getTime() - hoje.getTime()) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d atraso`, cls: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' };
    if (diff <= 7) return { label: `${diff}d`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' };
    return { label: `${diff}d`, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' };
  };

  const statusStats = sorted.reduce(
    (acc, item) => {
      const status = item.status || 'PLANEJADO';
      if (status === 'PLANEJADO') acc.planejado += 1;
      if (status === 'CONFIRMADO') acc.confirmado += 1;
      if (status === 'EM_ANDAMENTO') acc.emAndamento += 1;
      if (status === 'CONCLUIDO') acc.concluido += 1;
      if (status === 'CANCELADO') acc.cancelado += 1;
      return acc;
    },
    { planejado: 0, confirmado: 0, emAndamento: 0, concluido: 0, cancelado: 0 },
  );
  const totalStats = Math.max(1, Object.values(statusStats).reduce((a, b) => a + b, 0));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Treinamentos planejados
          </h3>
        </div>
        <Link
          to="/qualificacoes?tab=planejados"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Ver agenda <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Distribuição por status
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="flex h-full w-full">
            <div className="bg-blue-500" style={{ width: `${(statusStats.planejado / totalStats) * 100}%` }} />
            <div className="bg-emerald-500" style={{ width: `${(statusStats.confirmado / totalStats) * 100}%` }} />
            <div className="bg-violet-500" style={{ width: `${(statusStats.emAndamento / totalStats) * 100}%` }} />
            <div className="bg-slate-600" style={{ width: `${(statusStats.concluido / totalStats) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(statusStats.cancelado / totalStats) * 100}%` }} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <span>Planejado: {statusStats.planejado}</span>
          <span>Confirmado: {statusStats.confirmado}</span>
          <span>Em andamento: {statusStats.emAndamento}</span>
          <span>Concluído: {statusStats.concluido}</span>
          <span>Cancelado: {statusStats.cancelado}</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-xs text-slate-400 dark:text-slate-500">Nenhum treinamento planejado ativo.</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {sorted.map((item) => {
            const chip = getChip(item.data_prevista);
            const dataFmt = new Date(`${item.data_prevista}T00:00:00`).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit',
            });
            return (
              <Link
                key={item.id}
                to="/qualificacoes?tab=planejados"
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-slate-800/50"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                  {dataFmt}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{titleFor(item)}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.local || 'Local a definir'}
                    {' · '}
                    {item.confirmados_total ?? 0}/{item.convocados_total ?? 0} confirmados
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chip.cls}`}>{chip.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
});

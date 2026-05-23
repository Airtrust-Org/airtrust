import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { participantsCount } from './helpers';
import type { SessaoSimulador } from './types';

interface SessoesSimuladorCardProps {
  sessoes: SessaoSimulador[];
}

export const SessoesSimuladorCard = React.memo(function SessoesSimuladorCard({ sessoes }: SessoesSimuladorCardProps) {
  const hoje = new Date().toISOString().split('T')[0];
  const sessoesFuturas = sessoes.filter((s) => String(s.data || '').split('T')[0] >= hoje);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Próximas sessões</h3>
        </div>
        <Link
          to="/simuladores"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
        >
          Ver agenda <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {sessoesFuturas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
          Nenhuma sessão de simulador nos próximos 30 dias.
        </p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-700">
          {sessoesFuturas.slice(0, 5).map((sessao) => (
            <Link
              key={sessao.id}
              to="/simuladores"
              className="block px-5 py-3 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-slate-800/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de simulador'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {new Date(`${sessao.data}T00:00:00`).toLocaleDateString('pt-BR')} · {sessao.hora_inicio || '--:--'}
                    {sessao.hora_fim ? `-${sessao.hora_fim}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                  {participantsCount(sessao)} pax
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{sessao.simulador_nome || sessao.simulador_modelo || 'Simulador'}</span>
                <span>·</span>
                <span className="truncate">{sessao.instrutor_nome || 'Instrutor a definir'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
});

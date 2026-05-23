import React from 'react';
import { Link } from 'react-router-dom';
import type { DashboardMetrics, TreinamentoPlanejadoItem, SessaoSimulador } from './types';

interface PipelineResolucaoCardProps {
  treinamentos: TreinamentoPlanejadoItem[];
  sessoes: SessaoSimulador[];
  metrics: DashboardMetrics;
}

export const PipelineResolucaoCard = React.memo(function PipelineResolucaoCard({
  treinamentos,
  sessoes,
  metrics,
}: PipelineResolucaoCardProps) {
  const itensTreino = treinamentos.slice(0, 4);
  const itensSessoes = sessoes.slice(0, 3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Pipeline de resolução
        </h3>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Qualificações planejadas
            </p>
            <Link
              to="/qualificacoes?tab=planejados"
              className="text-xs font-bold text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-blue-400"
            >
              Ver lista
            </Link>
          </div>
          <div className="space-y-2">
            {itensTreino.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Sem treinamentos planejados.</p>
            ) : (
              itensTreino.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {item.titulo?.trim() || item.qualificacao_nome || 'Treinamento planejado'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(`${item.data_prevista}T00:00:00`).toLocaleDateString('pt-BR')} · {item.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Próximas sessões de simulador
          </p>
          <div className="space-y-2">
            {itensSessoes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Sem sessões nos próximos 30 dias.</p>
            ) : (
              itensSessoes.map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {s.tema_sessao || s.tipo_sessao || 'Sessão de simulador'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(`${s.data}T00:00:00`).toLocaleDateString('pt-BR')} · {s.hora_inicio || '--:--'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-500/20 dark:bg-blue-500/10">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">LMS</p>
          <p className="mt-0.5 text-xs font-semibold text-blue-900 dark:text-blue-300">
            {metrics.lms?.emAndamento ?? 0} matrícula(s) em andamento
          </p>
        </div>
      </div>
    </div>
  );
});

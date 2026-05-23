import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface CriticalPendenciasLinkCardProps {
  totalCritical: number;
  frmsCriticalCount: number;
  tripulantesEmRiscoFrms: number;
  certVencidas: number;
}

export const CriticalPendenciasLinkCard = React.memo(function CriticalPendenciasLinkCard({
  totalCritical,
  frmsCriticalCount,
  tripulantesEmRiscoFrms,
  certVencidas,
}: CriticalPendenciasLinkCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Pendências prioritárias
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {totalCritical} pendência(s) crítica(s) em acompanhamento
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {certVencidas} qualificação(oes) vencida(s) · {tripulantesEmRiscoFrms} tripulante(s)
            FRMS em nível crítico ({frmsCriticalCount} alerta(s))
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/qualificacoes/alertas"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Ver qualificações <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/frms/alertas"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Ver FRMS <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
});

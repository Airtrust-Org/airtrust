import type { CvRdvWorkflowStatus } from '@/react-app/hooks/useControleVoos';
import { rdvWorkflowLabel } from '../data/controleVoosFlightIdentity';

const COLORS: Record<CvRdvWorkflowStatus, string> = {
  rascunho: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  enviado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  em_revisao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  devolvido: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  aprovado_coordenacao: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  finalizado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  reaberto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function ControleVoosRdvWorkflowBadge({
  status,
  className = '',
}: {
  status?: CvRdvWorkflowStatus | null;
  className?: string;
}) {
  if (!status) {
    return (
      <span className={`rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 ${className}`}>
        Não iniciado
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status]} ${className}`}>
      {rdvWorkflowLabel(status)}
    </span>
  );
}

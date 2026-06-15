import { cn } from '@/react-app/lib/utils';

type StatusType =
  | 'planejado' | 'liberado' | 'em_voo' | 'pousado' | 'concluido' | 'cancelado'
  | 'liberado_operacionalmente' | 'em_andamento' | 'concluido_operacionalmente' | 'alternado_divergido'
  | 'rascunho' | 'finalizado' | 'preenchimento_finalizado'
  | 'disponivel' | 'indisponivel' | 'hangarada' | 'folga'
  | 'ativa' | 'encerrada' | 'liberada'
  | 'ok' | 'atencao' | 'bloqueado'
  | 'critico' | 'alerta' | 'info';

interface ControleVoosStatusBadgeProps { status: StatusType; className?: string }

const STATUS_STYLES: Record<string, string> = {
  'planejado': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'liberado': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'liberado_operacionalmente': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'em_andamento': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'em_voo': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'pousado': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'concluido': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'concluido_operacionalmente': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'alternado_divergido': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'cancelado': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'rascunho': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'finalizado': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'preenchimento_finalizado': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'disponivel': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'indisponivel': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'hangarada': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'folga': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'ativa': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'encerrada': 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  'liberada': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'ok': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'atencao': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bloqueado': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'critico': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'alerta': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'info': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const STATUS_LABELS: Record<string, string> = {
  'planejado': 'Planejado',
  'liberado': 'Liberado',
  'liberado_operacionalmente': 'Liberado',
  'em_voo': 'Em Voo',
  'em_andamento': 'Em Andamento',
  'pousado': 'Pousado',
  'concluido': 'Concluído',
  'concluido_operacionalmente': 'Concluído',
  'alternado_divergido': 'Alternado/Divergido',
  'cancelado': 'Cancelado',
  'rascunho': 'Rascunho',
  'finalizado': 'Finalizado',
  'preenchimento_finalizado': 'Preenchimento finalizado',
  'disponivel': 'Disponível',
  'indisponivel': 'Indisponível',
  'hangarada': 'Hangarada',
  'folga': 'Folga',
  'ativa': 'Ativa',
  'encerrada': 'Encerrada',
  'liberada': 'Liberada',
  'ok': 'OK',
  'atencao': 'Atenção',
  'bloqueado': 'Bloqueado',
  'critico': 'Crítico',
  'alerta': 'Alerta',
  'info': 'Info',
};

export default function ControleVoosStatusBadge({ status, className }: ControleVoosStatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', style, className)}>
      {label}
    </span>
  );
}

export { STATUS_LABELS };

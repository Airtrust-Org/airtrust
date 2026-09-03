import { cn } from '@/react-app/lib/utils';

type StatusType =
  | 'operando' | 'em-manutencao' | 'aog' | 'reserva'
  | 'aberta' | 'em-andamento' | 'aguardando-material' | 'aguardando-aprovacao' | 'concluida' | 'cancelada'
  | 'baixa' | 'media' | 'alta' | 'critica'
  | 'ok' | 'baixo' | 'critico' | 'vencido'
  | 'instalado' | 'removido' | 'estoque' | 'oficina'
  | 'pendente' | 'aprovado' | 'rejeitado'
  | 'preventiva' | 'corretiva' | 'modificacao' | 'inspecao' | 'componente'
  | 'manutencao' | 'reparo' | 'alteracao';

interface MroStatusBadgeProps { status: StatusType; className?: string }

const NEUTRAL_CLASSIFICATION_STYLE =
  'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300';

const STATUS_STYLES: Record<string, string> = {
  'operando': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'em-manutencao': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'aog': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'reserva': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'aberta': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'em-andamento': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'aguardando-material': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'aguardando-aprovacao': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'concluida': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'cancelada': 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  'baixa': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  'media': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'alta': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'critica': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'ok': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'baixo': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'critico': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'vencido': 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
  'instalado': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'removido': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'pendente': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'aprovado': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'rejeitado': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'preventiva': NEUTRAL_CLASSIFICATION_STYLE,
  'corretiva': NEUTRAL_CLASSIFICATION_STYLE,
  'modificacao': NEUTRAL_CLASSIFICATION_STYLE,
  'inspecao': NEUTRAL_CLASSIFICATION_STYLE,
  'componente': NEUTRAL_CLASSIFICATION_STYLE,
  'manutencao': NEUTRAL_CLASSIFICATION_STYLE,
  'reparo': NEUTRAL_CLASSIFICATION_STYLE,
  'alteracao': NEUTRAL_CLASSIFICATION_STYLE,
};

const STATUS_LABELS: Record<string, string> = {
  'operando': 'Operando', 'em-manutencao': 'Em Manutenção', 'aog': 'AOG', 'reserva': 'Reserva',
  'aberta': 'Aberta', 'em-andamento': 'Em Andamento', 'aguardando-material': 'Aguard. Material',
  'aguardando-aprovacao': 'Aguard. Aprovação', 'concluida': 'Concluída', 'cancelada': 'Cancelada',
  'baixa': 'Baixa', 'media': 'Média', 'alta': 'Alta', 'critica': 'Crítica',
  'ok': 'OK', 'baixo': 'Baixo', 'critico': 'Crítico', 'vencido': 'Vencido',
  'instalado': 'Instalado', 'removido': 'Removido', 'estoque': 'Estoque', 'oficina': 'Oficina',
  'pendente': 'Pendente', 'aprovado': 'Aprovado', 'rejeitado': 'Rejeitado',
  'preventiva': 'Preventiva', 'corretiva': 'Corretiva', 'modificacao': 'Modificação',
  'inspecao': 'Inspeção', 'componente': 'Componente',
  'manutencao': 'Manutenção', 'reparo': 'Reparo', 'alteracao': 'Alteração',
};

export default function MroStatusBadge({ status, className }: MroStatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', style, className)}>
      {label}
    </span>
  );
}

export { STATUS_LABELS };

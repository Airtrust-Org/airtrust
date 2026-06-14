import { cn } from '@/react-app/lib/utils';

interface StatCardData {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  subtitle?: string;
}

interface ControleVoosStatCardsProps {
  cards: StatCardData[];
  className?: string;
}

const variantStyles: Record<string, { bg: string; iconBg: string; text: string }> = {
  default: { bg: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900', iconBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', text: 'text-slate-900 dark:text-slate-100' },
  success: { bg: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30', iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300', text: 'text-emerald-900 dark:text-emerald-100' },
  warning: { bg: 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30', iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300', text: 'text-amber-900 dark:text-amber-100' },
  danger: { bg: 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30', iconBg: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300', text: 'text-red-900 dark:text-red-100' },
  info: { bg: 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30', iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300', text: 'text-blue-900 dark:text-blue-100' },
};

export default function ControleVoosStatCards({ cards, className }: ControleVoosStatCardsProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {cards.map((card, i) => {
        const styles = variantStyles[card.variant || 'default'];
        return (
          <div key={i} className={cn('flex items-start gap-4 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md', styles.bg)}>
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', styles.iconBg)}>
              {card.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className={cn('mt-1 text-2xl font-bold tracking-tight', styles.text)}>{card.value}</p>
              {card.subtitle && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{card.subtitle}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

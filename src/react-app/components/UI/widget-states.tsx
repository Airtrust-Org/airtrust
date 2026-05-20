import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface WidgetLoadingProps {
  height?: string;
  className?: string;
}

export function WidgetLoading({ height = 'h-40', className = '' }: WidgetLoadingProps) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800 ${height} ${className}`}
    />
  );
}

interface WidgetEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function WidgetEmpty({
  icon,
  title,
  description,
  action,
  className = '',
}: WidgetEmptyProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50 ${className}`}
    >
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface WidgetErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function WidgetError({
  message = 'Erro ao carregar dados.',
  onRetry,
  className = '',
}: WidgetErrorProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-900/20 ${className}`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
        <p className="text-xs font-medium text-red-700 dark:text-red-400">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
        >
          <RefreshCw className="h-3 w-3" />
          Tentar novamente
        </button>
      )}
    </div>
  );
}

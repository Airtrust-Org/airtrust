import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '@/react-app/components/Button';

interface FrmsManualRefreshControlProps {
  loading: boolean;
  error?: string | null;
  lastUpdatedAt?: string | null;
  onRefresh: () => void | Promise<void>;
  className?: string;
}

function formatLastUpdated(value: string | null | undefined): string {
  if (!value) return 'Ainda não atualizado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário indisponível';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function FrmsManualRefreshControl({
  loading,
  error,
  lastUpdatedAt,
  onRefresh,
  className = '',
}: FrmsManualRefreshControlProps) {
  const hasValidSnapshot = Boolean(lastUpdatedAt);

  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      <div className="min-w-0 text-right text-[11px] leading-tight text-slate-500">
        <p>Última atualização</p>
        <p className="font-semibold text-slate-700 dark:text-slate-200">
          {formatLastUpdated(lastUpdatedAt)}
        </p>
        {error && hasValidSnapshot && (
          <p className="mt-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Falha ao atualizar; exibindo o último snapshot válido.
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        onClick={() => void onRefresh()}
        disabled={loading}
        aria-label={loading ? 'Atualizando painel operacional' : 'Atualizar painel operacional agora'}
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span>{loading ? 'Atualizando…' : 'Atualizar agora'}</span>
      </Button>
    </div>
  );
}

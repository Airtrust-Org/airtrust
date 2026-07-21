import { AlertCircle, CheckCircle2, CloudOff, Loader2, PencilLine } from 'lucide-react';
import { RDV_SAVE_STATUS_LABELS, type RdvSaveStatus } from '../data/rdvPilotFlow';

type Props = {
  status: RdvSaveStatus;
  error?: string | null;
  lastSavedAt?: string | null;
};

const STYLES: Record<RdvSaveStatus, string> = {
  idle: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  pendente:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300',
  salvando:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300',
  salvo:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300',
  erro: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300',
};

function StatusIcon({ status }: { status: RdvSaveStatus }) {
  if (status === 'salvando') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === 'salvo') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'erro') return <AlertCircle className="h-3.5 w-3.5" />;
  if (status === 'pendente') return <PencilLine className="h-3.5 w-3.5" />;
  return <CloudOff className="h-3.5 w-3.5 opacity-60" />;
}

export default function ControleVoosRdvSaveStatus({ status, error, lastSavedAt }: Props) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${STYLES[status]}`}
      data-testid="rdv-save-status"
    >
      <div className="flex items-center gap-2 font-medium">
        <StatusIcon status={status} />
        <span>{RDV_SAVE_STATUS_LABELS[status]}</span>
      </div>
      {status === 'erro' && error && <p className="mt-1 leading-snug">{error}</p>}
      {status === 'salvo' && lastSavedAt && (
        <p className="mt-1 text-[11px] opacity-80">
          Último salvamento:{' '}
          {new Date(lastSavedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}

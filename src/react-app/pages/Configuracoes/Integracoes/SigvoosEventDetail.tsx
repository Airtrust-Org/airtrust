import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SigvoosEventDetailProps {
  error?: string | null;
  status: string;
}

export function SigvoosEventDetail({ error, status }: SigvoosEventDetailProps) {
  if (error) {
    return (
      <span className="inline-flex items-start gap-1 text-xs text-rose-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
        Falha na sincronização. Verifique a execução e tente novamente.
      </span>
    );
  }

  if (status === 'SUCESSO') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Sem erro
      </span>
    );
  }

  return <span className="text-xs text-amber-700">Execução em andamento</span>;
}

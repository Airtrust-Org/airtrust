import { AlertTriangle } from 'lucide-react';

export default function ControleVoosPrototypeBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
      <span>
        <strong>Módulo Controle de Voos em prévia: Protótipo — não regulado.</strong>{' '}
        Dados demonstrativos para validação de fluxo. Não utilizar como registro oficial
        de voo, RDV, jornada, despacho ou fiscalização.
      </span>
    </div>
  );
}

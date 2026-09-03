import { AlertTriangle } from 'lucide-react';

export default function MroPrototypeBanner() {
  return (
    <aside
      aria-label="Aviso de dados demonstrativos do MRO"
      className="mb-3 flex min-w-0 items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 sm:items-center"
      role="note"
    >
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0">
        <span className="font-medium">Dados demonstrativos.</span>{' '}
        Não usar como registro oficial de manutenção ou aeronavegabilidade.
      </p>
    </aside>
  );
}

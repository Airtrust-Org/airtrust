import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

import type { LmsCompletionExplanation } from '@/react-app/utils/lmsDiagnosticContract';

/**
 * Painel "Pendências para concluir".
 *
 * Puramente apresentacional: nunca dispara finalização nem altera estado
 * canônico. Exibe apenas o que o pacote informou — jamais inventa itens e
 * jamais mostra respostas corretas.
 */
export function LmsPendingPanel({
  explanation,
  open,
  onToggle,
}: {
  explanation: LmsCompletionExplanation;
  open: boolean;
  onToggle: () => void;
}) {
  if (explanation.canComplete) return null;

  const { items, adminItems, summary } = explanation;

  return (
    <section
      data-testid="lms-pending-panel"
      aria-label="Pendências para concluir"
      className="mt-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
          Pendências para concluir
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        )}
      </button>

      {open && (
        <div className="border-t border-amber-200 px-4 py-3 dark:border-amber-800">
          <p className="text-sm text-amber-900 dark:text-amber-100">{summary}</p>

          {items.length > 0 && (
            <ul className="mt-3 space-y-1.5" data-testid="lms-pending-items">
              {items.map((item, i) => {
                const isScoreFailure = item.category === 'SCORE';
                return (
                  <li
                    key={`${item.category}-${item.ref?.id ?? i}`}
                    data-testid="lms-pending-item"
                    data-severity={isScoreFailure ? 'error' : 'warning'}
                    className={
                      isScoreFailure
                        ? 'flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
                        : 'flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100'
                    }
                  >
                    {isScoreFailure ? (
                      <AlertTriangle
                        aria-label="Avaliação abaixo da nota mínima"
                        className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      />
                    )}
                    <span>{item.label}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {adminItems.length > 0 && (
            <div
              className="mt-3 rounded border border-amber-300 bg-amber-100/60 p-3 dark:border-amber-700 dark:bg-amber-900/40"
              data-testid="lms-pending-admin"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                <ShieldAlert className="h-3.5 w-3.5" />
                Requer suporte administrativo
              </p>
              <ul className="mt-2 space-y-1.5">
                {adminItems.map((item, i) => (
                  <li
                    key={`admin-${i}`}
                    data-testid="lms-pending-admin-item"
                    className="text-sm text-amber-900 dark:text-amber-100"
                  >
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

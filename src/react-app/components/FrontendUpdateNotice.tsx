import { useEffect, useState } from 'react';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';
import {
  getPendingFrontendUpdate,
  onFrontendUpdateAvailable,
} from '@/react-app/lib/frontendVersionMonitor';

/**
 * A new release must not discard an unsaved form, LMS activity or an in-flight
 * operation. The operator decides when to refresh; runtime/chunk recovery uses
 * its own separate fail-safe contract.
 */
export default function FrontendUpdateNotice() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(
    getPendingFrontendUpdate,
  );
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => onFrontendUpdateAvailable(setAvailableVersion), []);

  if (!availableVersion || dismissedVersion === availableVersion) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[120] mx-3 max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <p className="font-semibold">Nova versão do AirTrust disponível</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Atualize quando terminar o trabalho atual para não perder dados não salvos.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void hardRefreshApp()}
          className="rounded-md bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800"
        >
          Atualizar agora
        </button>
        <button
          type="button"
          onClick={() => setDismissedVersion(availableVersion)}
          className="rounded-md border border-slate-300 px-3 py-2 font-medium dark:border-slate-600"
        >
          Mais tarde
        </button>
      </div>
    </div>
  );
}

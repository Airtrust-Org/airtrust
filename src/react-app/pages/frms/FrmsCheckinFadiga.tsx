import AppLayout from '@/react-app/components/AppLayout';
import { useFrmsOperationalAccess } from '@/react-app/hooks/useFrmsOperationalAccess';
import FrmsFlightCheckinFadiga from './FrmsFlightCheckinFadiga';
import FrmsMaintenanceCheckin from './FrmsMaintenanceCheckin';

// Preserve the public helpers used by existing tests/callers while the flight
// form itself lives in a dedicated component.
export {
  optionalBinaryResponseToPayload,
  mapKssToSubjectiveFatigue,
  normalizeWakeTimeInput,
  isValidWakeTime,
  isFadigaCheckinSubmitReady,
} from './FrmsFlightCheckinFadiga';

/**
 * Cargo-aware entry point for /frms/checkin.
 *
 * MECÂNICO/INSPETOR never falls through to pilot-only questions, FRAT or
 * flight-journey logic. Unknown/error state is fail-closed instead of showing
 * the wrong operational form.
 */
export default function FrmsCheckinFadiga() {
  const access = useFrmsOperationalAccess();

  if (access.isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-3 p-4" aria-label="Carregando formulário FRMS">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        </div>
      </AppLayout>
    );
  }

  if (access.isError || !access.data) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl p-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Não foi possível confirmar seu cargo para selecionar o formulário FRMS correto.
            <button
              type="button"
              onClick={() => void access.refetch()}
              className="mt-3 block rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/50"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (access.data.frms_profile === 'maintenance') {
    return <FrmsMaintenanceCheckin />;
  }

  return <FrmsFlightCheckinFadiga />;
}

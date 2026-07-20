import { Check } from 'lucide-react';
import { RDV_PILOT_STEPS, type RdvPilotStepId } from '../data/rdvPilotFlow';

type Props = {
  currentStep: RdvPilotStepId;
  completedSteps: Set<RdvPilotStepId>;
  onStepChange: (step: RdvPilotStepId) => void;
  progressPercent: number;
};

export default function ControleVoosRdvStepper({
  currentStep,
  completedSteps,
  onStepChange,
  progressPercent,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Progresso do preenchimento
        </p>
        <p className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {progressPercent}%
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do RDV"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-500"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>

      {/* Mobile: compact select */}
      <div className="sm:hidden">
        <label className="sr-only" htmlFor="rdv-step-select">
          Etapa do RDV
        </label>
        <select
          id="rdv-step-select"
          value={currentStep}
          onChange={(event) => onStepChange(event.target.value as RdvPilotStepId)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          {RDV_PILOT_STEPS.map((step, index) => (
            <option key={step.id} value={step.id}>
              {index + 1}. {step.label}
              {completedSteps.has(step.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tablet/desktop: horizontal stepper */}
      <nav
        aria-label="Etapas do preenchimento do RDV"
        className="hidden gap-1 overflow-x-auto pb-1 sm:flex md:gap-2"
      >
        {RDV_PILOT_STEPS.map((step, index) => {
          const active = step.id === currentStep;
          const done = completedSteps.has(step.id) && !active;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(step.id)}
              className={`flex min-w-[7.5rem] flex-1 flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors ${
                active
                  ? 'bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-950/40 dark:ring-blue-400'
                  : done
                    ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`text-[11px] font-medium leading-tight ${
                  active
                    ? 'text-blue-700 dark:text-blue-300'
                    : done
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

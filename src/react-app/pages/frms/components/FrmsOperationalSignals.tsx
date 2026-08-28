/**
 * FRMS — Apresentação dos quatro sinais operacionais.
 *
 * Este componente cuida APENAS de apresentação. A resolução de estado vive em
 * `../frmsOperationalSignals.ts` (funções puras e testáveis).
 *
 * Regra de acessibilidade: a cor nunca é o único canal. Todo sinal traz
 * rótulo textual, marcador (bolinha CSS) e `aria-label` explícito com o tom.
 */
import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert } from 'lucide-react';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { useReadinessTeam } from '@/react-app/hooks/useOperationalReadiness';
import {
  resolveOperationalSignals,
  type FrmsOperationalSignal,
  type FrmsReadinessAdapter,
  type FrmsSignalTone,
} from '../frmsOperationalSignals';

const TONE_TEXT: Record<FrmsSignalTone, string> = {
  ok: 'normal',
  warning: 'atenção',
  critical: 'crítico',
  unknown: 'sem dado',
};

const TONE_DOT: Record<FrmsSignalTone, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
  unknown: 'bg-slate-400',
};

const TONE_CHIP: Record<FrmsSignalTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  critical:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
  unknown:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

const TONE_ICON: Record<FrmsSignalTone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  critical: ShieldAlert,
  unknown: CircleHelp,
};

function ariaLabel(signal: FrmsOperationalSignal): string {
  return `${signal.label}: ${signal.value} — ${TONE_TEXT[signal.tone]}`;
}

function useAuthoritativeReadinessAdapter(
  item: FrmsOperationalSnapshotItem,
  override?: FrmsReadinessAdapter,
): FrmsReadinessAdapter {
  const { data: readinessRows } = useReadinessTeam(item.data_operacional);
  const readiness = readinessRows?.find(
    (candidate) => Number(candidate.funcionario_id) === Number(item.funcionario_id),
  );

  if (override) return override;

  return () => {
    if (!readiness) return null;
    return {
      classification: readiness.classification,
      detail:
        readiness.classification === 'baseline_building'
          ? `${readiness.baseline_sessions} sessões válidas no baseline`
          : undefined,
    };
  };
}

export function useOperationalSignals(
  item: FrmsOperationalSnapshotItem,
  readinessAdapter?: FrmsReadinessAdapter,
): FrmsOperationalSignal[] {
  const effectiveReadinessAdapter = useAuthoritativeReadinessAdapter(item, readinessAdapter);
  return resolveOperationalSignals(item, { readinessAdapter: effectiveReadinessAdapter });
}

/**
 * Chips compactos — uma linha da fila de decisão do Dashboard.
 * Em telas menores quebram com wrap (2x2 natural).
 */
export function FrmsSignalChips({
  item,
  readinessAdapter,
  className = '',
}: {
  item: FrmsOperationalSnapshotItem;
  readinessAdapter?: FrmsReadinessAdapter;
  className?: string;
}) {
  const signals = useOperationalSignals(item, readinessAdapter);

  return (
    <ul
      className={`flex flex-wrap gap-1.5 ${className}`}
      aria-label="Sinais operacionais do dia"
    >
      {signals.map((signal) => (
        <li key={signal.key}>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${TONE_CHIP[signal.tone]}`}
            title={signal.detail ? `${signal.label}: ${signal.value} — ${signal.detail}` : ariaLabel(signal)}
            aria-label={ariaLabel(signal)}
          >
            <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[signal.tone]}`} aria-hidden="true" />
            <span className="text-slate-500 dark:text-slate-400">{signal.label}</span>
            <span>{signal.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Grade 2x2 — bloco "Status operacional do dia" no Drawer e na Ficha.
 */
export function FrmsSignalGrid({
  item,
  readinessAdapter,
  className = '',
}: {
  item: FrmsOperationalSnapshotItem;
  readinessAdapter?: FrmsReadinessAdapter;
  className?: string;
}) {
  const signals = useOperationalSignals(item, readinessAdapter);

  return (
    <ul
      className={`grid grid-cols-2 gap-2 ${className}`}
      aria-label="Status operacional do dia"
    >
      {signals.map((signal) => {
        const Icon = TONE_ICON[signal.tone];
        return (
          <li
            key={signal.key}
            className={`rounded-xl border p-3 ${TONE_CHIP[signal.tone]}`}
            aria-label={ariaLabel(signal)}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              <span className={`h-1.5 w-1.5 flex-none rounded-full ${TONE_DOT[signal.tone]}`} aria-hidden="true" />
              {signal.label}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold">
              <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
              <span>{signal.value}</span>
            </div>
            {signal.detail ? (
              <p className="mt-1 text-xs font-medium opacity-80">{signal.detail}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

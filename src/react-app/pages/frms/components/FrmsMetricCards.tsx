/**
 * FrmsMetricCards — 4 cards de métricas no topo do dashboard
 * Clicáveis para filtrar por status.
 */
import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Brain, Moon, XCircle, ShieldAlert } from 'lucide-react';

interface Props {
  complianceCards: Array<{
    key: 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
    total: number;
  }>;
  effectivenessCards: Array<{
    key: 'PLENA' | 'ATENCAO' | 'DEGRADADA' | 'SEVERA';
    total: number;
  }>;
  effectivenessSemDados?: number;
  activeComplianceKey?: 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO' | null;
  onComplianceToggle?: (key: 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO') => void;
  activeEffectivenessKey?: 'PLENA' | 'ATENCAO' | 'DEGRADADA' | 'SEVERA' | null;
  onEffectivenessToggle?: (key: 'PLENA' | 'ATENCAO' | 'DEGRADADA' | 'SEVERA') => void;
}

function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setVal(0);
      return;
    }
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const id = setInterval(() => {
      start = Math.min(start + step, target);
      setVal(start);
      if (start >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

const CARDS = [
  {
    key: 'OK',
    label: 'Normal',
    icon: Shield,
    accent: 'bg-emerald-500',
    accentSoft:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30',
    ringColor: 'ring-emerald-100',
    description: 'Limite regulatório preservado',
    testId: 'frms-card-ok',
  },
  {
    key: 'ATENCAO',
    label: 'Atenção',
    icon: AlertTriangle,
    accent: 'bg-amber-500',
    accentSoft:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30',
    ringColor: 'ring-amber-100',
    description: 'Consumo regulatório elevado',
    testId: 'frms-card-atencao',
  },
  {
    key: 'CRITICO',
    label: 'Crítico',
    icon: ShieldAlert,
    accent: 'bg-orange-600',
    accentSoft:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-500/30',
    ringColor: 'ring-orange-100',
    description: 'Muito próximo do limite máximo',
    testId: 'frms-card-critico',
  },
  {
    key: 'VIOLACAO',
    label: 'Violação',
    icon: XCircle,
    accent: 'bg-red-600',
    accentSoft:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/30',
    ringColor: 'ring-red-100',
    description: 'Extrapolação confirmada no compliance',
    testId: 'frms-card-violacao',
  },
] as const;

const EFFECTIVENESS_CARDS = [
  {
    key: 'PLENA',
    label: 'Margem preservada',
    icon: Brain,
    accent: 'bg-teal-600',
    accentSoft:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:border-teal-500/30',
    description: 'Leitura estimada sem atenção imediata',
  },
  {
    key: 'ATENCAO',
    label: 'Atenção',
    icon: AlertTriangle,
    accent: 'bg-orange-500',
    accentSoft:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-500/30',
    description: 'Sinal de atenção na leitura estimada',
  },
  {
    key: 'DEGRADADA',
    label: 'Degradada',
    icon: Moon,
    accent: 'bg-amber-500',
    accentSoft:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30',
    description: 'Redução relevante na margem estimada',
  },
  {
    key: 'SEVERA',
    label: 'Atenção elevada',
    icon: AlertTriangle,
    accent: 'bg-rose-700',
    accentSoft:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30',
    description: 'Risco alto — revisar com gestor',
  },
] as const;

function MetricCard({
  label,
  accent,
  accentSoft,
  description,
  total,
  icon: Icon,
  testId,
  active = false,
  onClick,
  unitLabel = 'tripulantes',
}: {
  label: string;
  accent: string;
  accentSoft: string;
  description: string;
  total: number;
  icon: React.ElementType;
  testId?: string;
  active?: boolean;
  onClick?: () => void;
  unitLabel?: string;
}) {
  const animated = useCountUp(total);
  const isClickable = Boolean(onClick);
  const ariaLabel = `${label}: ${total} ${unitLabel} — ${description}`;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={isClickable ? active : undefined}
      className={`group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 ${
        active
          ? 'min-h-[144px] border-slate-300 bg-white shadow-md ring-2 ring-slate-200 ring-offset-1 dark:border-slate-600 dark:bg-slate-900 dark:ring-slate-700/80 dark:ring-offset-slate-900'
          : total === 0
            ? 'min-h-[88px] border-slate-100 bg-white/70 shadow-sm dark:border-slate-700/50 dark:bg-slate-900/70 dark:shadow-none'
            : 'min-h-[144px] border-slate-200 bg-white/95 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none dark:hover:border-slate-600'
      } ${isClickable ? 'cursor-pointer' : 'cursor-default motion-safe:hover:translate-y-0 motion-safe:hover:shadow-sm'}`}
    >
      <div className="relative z-10 flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${accentSoft}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <span className={`h-2.5 w-2.5 rounded-full ${accent}`} aria-hidden="true" />
          </div>
          <p className="mt-2 text-[2rem] font-black leading-none tabular-nums text-slate-900 dark:text-slate-100">
            {animated}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {unitLabel}
          </span>
          {total > 0 && (
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function FrmsMetricCards({
  complianceCards,
  effectivenessCards,
  effectivenessSemDados = 0,
  activeComplianceKey = null,
  onComplianceToggle,
  activeEffectivenessKey = null,
  onEffectivenessToggle,
}: Props) {
  const visibleComplianceCards = complianceCards.filter((entry) => entry.total > 0);
  const visibleEffectivenessCards = effectivenessCards.filter((entry) => entry.total > 0);
  const showComplianceSection = complianceCards.length > 0;
  const showEffectivenessSection = effectivenessCards.length > 0;
  const allComplianceZero = visibleComplianceCards.length === 0 && showComplianceSection;
  const allEffectivenessZero = visibleEffectivenessCards.length === 0 && showEffectivenessSection;

  return (
    <div className="space-y-3" role="region" aria-label="Indicadores de compliance e efetividade">
      {showComplianceSection && (
      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-none">
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Compliance regulatório
            </p>
            <h2 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">Jornada e HV</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Limites legais de jornada e horas de voo.
            </p>
          </div>

          {allComplianceZero ? (
            <p className="self-center text-sm text-slate-500 dark:text-slate-400" role="status">
              ✅ Compliance: sem violações no período.
            </p>
          ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
            {CARDS.filter((card) =>
              complianceCards.some((entry) => entry.key === card.key),
            ).map((card) => {
              const values = complianceCards.find((entry) => entry.key === card.key)!;
              const isActive = activeComplianceKey === card.key;
              return (
                <MetricCard
                  key={card.key}
                  label={card.label}
                  accent={card.accent}
                  accentSoft={card.accentSoft}
                  description={card.description}
                  total={values.total}
                  icon={card.icon}
                  testId={card.testId}
                  active={isActive}
                  onClick={onComplianceToggle ? () => onComplianceToggle(card.key) : undefined}
                  unitLabel="ocorrências"
                />
              );
            })}
          </div>
          )}
        </div>
      </section>
      )}

      {showEffectivenessSection && (
      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-none">
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Efetividade estimada
            </p>
            <h2 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">Prontidão operacional</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Proxy de apoio — não é diagnóstico médico.
            </p>
            {effectivenessSemDados > 0 && (
              <span className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {effectivenessSemDados} sem leitura
              </span>
            )}
          </div>

          {allEffectivenessZero ? (
            <p className="self-center text-sm text-slate-500 dark:text-slate-400" role="status">
              ✅ Efetividade: sem ocorrências no período.
            </p>
          ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
            {EFFECTIVENESS_CARDS.filter((card) =>
              effectivenessCards.some((entry) => entry.key === card.key),
            ).map((card) => {
              const values = effectivenessCards.find((entry) => entry.key === card.key)!;
              const isActive = activeEffectivenessKey === card.key;
              return (
                <MetricCard
                  key={card.key}
                  label={card.label}
                  accent={card.accent}
                  accentSoft={card.accentSoft}
                  description={card.description}
                  total={values.total}
                  icon={card.icon}
                  active={isActive}
                  onClick={
                    onEffectivenessToggle ? () => onEffectivenessToggle(card.key) : undefined
                  }
                  unitLabel="ocorrências"
                />
              );
            })}
          </div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}

/**
 * FrmsMetricCards — 4 cards de métricas no topo do dashboard
 * Clicáveis para filtrar por status.
 */
import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Brain, Moon } from 'lucide-react';

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
    icon: AlertTriangle,
    accent: 'bg-orange-700',
    accentSoft:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-500/30',
    ringColor: 'ring-orange-100',
    description: 'Muito próximo do limite máximo',
    testId: 'frms-card-critico',
  },
  {
    key: 'VIOLACAO',
    label: 'Violação',
    icon: AlertTriangle,
    accent: 'bg-red-700',
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
    label: 'Plena',
    icon: Brain,
    accent: 'bg-teal-600',
    accentSoft:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:border-teal-500/30',
    description: 'Capacidade preservada',
  },
  {
    key: 'ATENCAO',
    label: 'Atenção',
    icon: AlertTriangle,
    accent: 'bg-orange-500',
    accentSoft:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-500/30',
    description: 'Queda inicial de performance',
  },
  {
    key: 'DEGRADADA',
    label: 'Degradada',
    icon: Moon,
    accent: 'bg-amber-500',
    accentSoft:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30',
    description: 'Redução mensurável',
  },
  {
    key: 'SEVERA',
    label: 'Severa',
    icon: AlertTriangle,
    accent: 'bg-rose-700',
    accentSoft:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30',
    description: 'Pede ação operacional',
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

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`group relative min-h-[144px] overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-slate-300 bg-white shadow-md ring-2 ring-slate-200 ring-offset-1 dark:border-slate-600 dark:bg-slate-900 dark:ring-slate-700/80 dark:ring-offset-slate-900'
          : 'border-slate-200 bg-white/95 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none dark:hover:border-slate-600'
      } ${onClick ? '' : 'cursor-default hover:translate-y-0 hover:shadow-sm'}`}
    >
      <div className="relative z-10 flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${accentSoft}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
          </div>
          <p className="mt-2 text-[2rem] font-black leading-none tabular-nums text-slate-900 dark:text-slate-100">
            {animated}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {unitLabel}
          </span>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
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
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-none sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Leitura operacional
            </p>
            <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">Compliance Regulatório</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Mantém o filtro principal do painel e mostra risco de jornada e horas de voo.
            </p>
            <span className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              clique em um status para filtrar
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {CARDS.map((card) => {
              const values = complianceCards.find((entry) => entry.key === card.key) ?? {
                key: card.key,
                total: 0,
              };
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
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-r from-white via-slate-50/90 to-white p-4 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-900 dark:shadow-none sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-950/85">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Leitura estimada
            </p>
            <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">Índice de efetividade</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Proxy local de degradação operacional separado da lógica regulatória do compliance.
            </p>
            <span className="mt-4 inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {effectivenessSemDados > 0
                ? `${effectivenessSemDados} sem leitura no período`
                : 'ocorrências por dia processado'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {EFFECTIVENESS_CARDS.map((card) => {
              const values = effectivenessCards.find((entry) => entry.key === card.key) ?? {
                key: card.key,
                total: 0,
              };
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
        </div>
      </section>
    </div>
  );
}

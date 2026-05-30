/**
 * FrmsEffectivenessPanel — Painel A: índice estimado de prontidão operacional
 * Mostra score circular, decomposição por componente e nível textual.
 */
import { getEffectivenessBg, getEffectivenessLabel, getEffectivenessHex } from '../frmsUtils';

// ── Types ──

interface EffectivenessComponentes {
  processo_s: number;
  processo_c: number;
  repouso: number;
  hv: number;
  duracao: number;
}

interface Props {
  effectiveness_pct: number;
  effectiveness_nivel?: string;
  componentes?: EffectivenessComponentes | null;
  config: Partial<Record<string, number>> | null;
  compact?: boolean;
}

// ── Component bar for decomposition ──
function ComponentBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.abs(value) * 100));
  const isNegative = value < 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-20 text-right truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] tabular-nums w-12 text-right ${isNegative ? 'text-red-500' : 'text-slate-500'}`}
      >
        {isNegative ? '' : '+'}
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── Main ──

export default function FrmsEffectivenessPanel({
  effectiveness_pct,
  effectiveness_nivel,
  componentes,
  config,
  compact = false,
}: Props) {
  const pct = effectiveness_pct;
  const bgClass = getEffectivenessBg(pct, config);
  const hex = getEffectivenessHex(pct, config);
  const label = getEffectivenessLabel(pct, config);
  const nivel = effectiveness_nivel || label;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2"
        title={`Índice estimado de prontidão operacional: ${pct.toFixed(1)}% — ${nivel}`}
      >
        <div className="relative w-8 h-8">
          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={hex}
              strokeWidth="3"
              strokeDasharray={`${(pct / 100) * 94.25} 94.25`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-700">
            {Math.round(pct)}
          </span>
        </div>
        <span className="text-[10px] text-slate-500">{nivel}</span>
      </div>
    );
  }

  const componentLabels: Record<string, string> = {
    processo_s: 'Proc. S',
    processo_c: 'Proc. C',
    repouso: 'Repouso',
    hv: 'Horas Voo',
    duracao: 'Duração',
  };

  return (
    <div className="rounded-xl border border-slate-200/50 bg-white/80 backdrop-blur-sm p-4 shadow-md">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Índice estimado de prontidão operacional
      </h4>

      {/* Score circle + label */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
            <defs>
              <linearGradient id="eff-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b77f" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="url(#eff-gradient)"
              strokeWidth="2.5"
              strokeDasharray={`${(pct / 100) * 94.25} 94.25`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-800">
            {Math.round(pct)}
          </span>
        </div>
        <div>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${bgClass}`}
          >
            {nivel}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">
            Proxy local inspirado em modelos biomatemáticos; não substitui avaliação operacional
            humana e não representa validação formal SAFTE-FAST
          </p>
        </div>
      </div>

      {/* Component decomposition */}
      {componentes && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
            Decomposição
          </p>
          {(Object.keys(componentLabels) as (keyof EffectivenessComponentes)[]).map((key) => (
            <ComponentBar
              key={key}
              label={componentLabels[key]}
              value={componentes[key]}
              color={
                componentes[key] < -0.05
                  ? 'bg-red-400'
                  : componentes[key] < 0
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * FrmsEffectivenessPanel — índice estimado de prontidão operacional
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
  /** Operational Load V1 (OPERATIONAL_POLICY_V1), signed fraction. Optional for legacy rows. */
  carga_operacional?: number;
}

export interface OperationalLoadDetail {
  policy_version: string;
  landings_count: number;
  landings_evidence_quality?: 'OBSERVED' | 'CONFIRMED_ZERO' | 'INCOMPLETE';
  temperature_max_c: number | null;
  weather_evidence_quality: 'OBSERVED' | 'NOT_APPLICABLE' | 'INCOMPLETE';
  data_quality: 'COMPLETE' | 'INCOMPLETE';
  landings_delta: number;
  temperature_delta: number;
  total_delta: number;
}

interface Props {
  effectiveness_pct: number;
  effectiveness_nivel?: string;
  componentes?: EffectivenessComponentes | null;
  operationalLoad?: OperationalLoadDetail | null;
  config: Partial<Record<string, number>> | null;
  compact?: boolean;
}

function fmtPoints(points: number): string {
  return points.toFixed(1).replace('.', ',');
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
          className={`h-1.5 rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${color}`}
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

function landingsEvidenceLine(operationalLoad: OperationalLoadDetail): string {
  if (operationalLoad.landings_evidence_quality === 'INCOMPLETE') {
    return '• pousos: SIGVOOS indisponível (sem penalidade; evidência incompleta)';
  }
  if (operationalLoad.landings_evidence_quality === 'CONFIRMED_ZERO') {
    return '• 0 pousos: ausência de voo confirmada pelo SIGVOOS';
  }
  return `• ${operationalLoad.landings_count} ${
    operationalLoad.landings_count === 1 ? 'pouso' : 'pousos'
  }: ${fmtPoints(operationalLoad.landings_delta)}`;
}

function weatherEvidenceLine(operationalLoad: OperationalLoadDetail): string {
  if (
    operationalLoad.weather_evidence_quality === 'OBSERVED' &&
    operationalLoad.temperature_max_c != null
  ) {
    return `• temperatura máxima ${Math.round(operationalLoad.temperature_max_c)} °C: ${fmtPoints(
      operationalLoad.temperature_delta,
    )}`;
  }
  if (operationalLoad.weather_evidence_quality === 'NOT_APPLICABLE') {
    return '• temperatura: não aplicável à carga de voo (sem voo confirmado)';
  }
  return '• temperatura: evidência meteorológica indisponível (sem penalidade)';
}

// ── Main ──

export default function FrmsEffectivenessPanel({
  effectiveness_pct,
  effectiveness_nivel,
  componentes,
  operationalLoad,
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
    carga_operacional: 'Carga Op.',
  };
  const componentKeys = (Object.keys(componentLabels) as (keyof EffectivenessComponentes)[]).filter(
    (key) => componentes != null && typeof componentes[key] === 'number',
  );

  return (
    <div className="rounded-xl border border-slate-200/50 bg-white/80 backdrop-blur-sm p-4 shadow-md">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        Efetividade estimada
      </h4>
      <p className="mb-3 text-[11px] text-slate-500">
        Proxy operacional/fisiológico derivado de jornada, repouso, sono, circadiano e ciclo.
        Quanto maior, melhor.
      </p>

      {/* Score circle + label */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={hex}
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
          {componentKeys.map((key) => {
            const value = componentes[key] as number;
            return (
              <ComponentBar
                key={key}
                label={componentLabels[key]}
                value={value}
                color={value < -0.05 ? 'bg-red-400' : value < 0 ? 'bg-amber-400' : 'bg-emerald-400'}
              />
            );
          })}
          {operationalLoad && (
            <div className="mt-1 rounded-md bg-slate-50 px-2 py-1.5 text-[10px] leading-4 text-slate-500">
              <p className="font-semibold text-slate-600">
                Carga operacional: {fmtPoints(operationalLoad.total_delta)}
              </p>
              <p>{landingsEvidenceLine(operationalLoad)}</p>
              <p>{weatherEvidenceLine(operationalLoad)}</p>
              {operationalLoad.data_quality === 'INCOMPLETE' && (
                <p className="mt-0.5 font-medium text-amber-700">
                  Evidência operacional incompleta — nenhuma condição ausente foi presumida.
                </p>
              )}
              <p className="mt-0.5 text-slate-400">
                Coeficientes internos OPERATIONAL_POLICY_V1 — conservadores e sujeitos a calibração.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

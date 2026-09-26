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
  /** Legacy aggregate retained for historical rows; V2 uses independent dimensions. */
  carga_operacional?: number;
  recuperacao?: number;
  pousos?: number;
  temperatura?: number;
  imc?: number;
  noite_circadiano?: number;
  hv_credito_aplicado?: number;
}

export interface OperationalLoadDetail {
  policy_version: string;
  landings_count: number;
  landings_evidence_quality?: 'OBSERVED' | 'CONFIRMED_ZERO' | 'INCOMPLETE';
  temperature_max_c: number | null;
  weather_evidence_quality: 'OBSERVED' | 'NOT_APPLICABLE' | 'INCOMPLETE';
  imc_evidence_quality?: 'OBSERVED' | 'NOT_APPLICABLE' | 'INCOMPLETE';
  data_quality: 'COMPLETE' | 'INCOMPLETE' | 'SIGVOOS_UNAVAILABLE';
  landings_delta: number;
  temperature_delta: number;
  imc_delta?: number;
  imc_legs?: Array<{
    legId: string;
    departure: { condition: 'VMC' | 'IMC' | 'INDETERMINATE' };
    arrival: { condition: 'VMC' | 'IMC' | 'INDETERMINATE' };
    departureDelta: number; arrivalDelta: number; totalDelta: number;
    departureRawMetar?: string | null; arrivalRawMetar?: string | null;
    departureStationIcao?: string | null; arrivalStationIcao?: string | null;
    departureObservedAtUtc?: string | null; arrivalObservedAtUtc?: string | null;
    departureEventAtUtc?: string | null; arrivalEventAtUtc?: string | null;
  }>;
  total_delta: number;
}

interface Props {
  effectiveness_pct: number;
  effectiveness_nivel?: string;
  componentes?: EffectivenessComponentes | null;
  operationalLoad?: OperationalLoadDetail | null;
  config: Partial<Record<string, number>> | null;
  dataSource?:
    | 'REAL'
    | 'MANUAL'
    | 'ESTIMADO'
    | 'AUSENTE'
    | 'INCONSISTENTE'
    | 'PROJETADA_APRESENTACAO'
    | 'PROJETADA_ATIVIDADE'
    | null;
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
  if (
    operationalLoad.landings_evidence_quality === 'INCOMPLETE' ||
    operationalLoad.data_quality === 'SIGVOOS_UNAVAILABLE'
  ) {
    return '• pousos: SIGVOOS indisponível (sem penalidade; evidência incompleta)';
  }
  if (
    operationalLoad.landings_evidence_quality === 'CONFIRMED_ZERO' ||
    operationalLoad.weather_evidence_quality === 'NOT_APPLICABLE'
  ) {
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
  dataSource = null,
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
    processo_s: 'Período embarcado',
    processo_c: 'Ritmo circadiano',
    recuperacao: 'Recuperação',
    repouso: 'Sono / repouso',
    hv: 'Voo / simulador',
    pousos: 'Pousos',
    temperatura: 'Temperatura',
    imc: 'IMC',
    noite_circadiano: 'Noite/WOCL',
    duracao: 'Duração',
  };
  const componentKeys = (Object.keys(componentLabels) as (keyof EffectivenessComponentes)[]).filter(
    (key) => componentes != null && typeof componentes[key] === 'number',
  );

  return (
    <div className="rounded-xl border border-slate-200/50 bg-white/80 backdrop-blur-sm p-4 shadow-md">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        Efetividade estimada
      </h4>
      <p className="mb-2 text-[11px] text-slate-500">
        Estimativa operacional que combina jornada, sono/repouso, ritmo circadiano e carga de voo.
        100% representa a referência do modelo; reduções mostram os fatores que degradaram o índice.
      </p>
      <p className={`mb-3 text-[11px] font-medium ${
        dataSource === 'REAL'
          ? 'text-emerald-700'
          : dataSource === 'PROJETADA_APRESENTACAO' || dataSource === 'PROJETADA_ATIVIDADE' || dataSource === 'ESTIMADO'
            ? 'text-amber-700'
            : 'text-slate-500'
      }`}>
        Fonte do cálculo:{' '}
        {dataSource === 'REAL'
          ? 'real — jornada realizada/confirmada'
          : dataSource === 'PROJETADA_ATIVIDADE'
            ? 'projeção da manhã — check-in + atividade planejada do dia'
            : dataSource === 'PROJETADA_APRESENTACAO'
              ? 'projeção da manhã — check-in + horário de apresentação; carga futura ainda não incorporada'
              : dataSource === 'ESTIMADO'
                ? 'histórica estimada — janela operacional derivada do SIGVOOS'
                : dataSource === 'MANUAL'
                  ? 'manual — janela informada'
                  : 'não confirmada'}.
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
            O que alterou o índice
          </p>
          <p className="text-[10px] leading-4 text-slate-500">
            Valores negativos reduzem a efetividade; 0,0% significa que o fator calculado não alterou o índice.
            Evidência ausente é indicada separadamente e não deve ser interpretada como zero.
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
              <p className="font-semibold text-slate-600">Fatores offshore independentes</p>
              <p>{landingsEvidenceLine(operationalLoad)}</p>
              <p>{weatherEvidenceLine(operationalLoad)}</p>
              <p>
                • IMC: {operationalLoad.imc_evidence_quality === 'OBSERVED'
                  ? fmtPoints(operationalLoad.imc_delta ?? 0)
                  : operationalLoad.imc_evidence_quality === 'NOT_APPLICABLE'
                    ? 'não aplicável'
                    : 'evidência incompleta (sem presumir VMC)'}
              </p>
              {(operationalLoad.imc_legs ?? []).map((leg) => (
                <div key={leg.legId} className="mt-1 rounded border border-slate-200 bg-white px-2 py-1">
                  <p className="font-medium text-slate-600">Etapa {leg.legId}</p>
                  <p>Saída: {leg.departure.condition} · {fmtPoints(leg.departureDelta)} · {leg.departureStationIcao ?? 'estação indisponível'} · {leg.departureObservedAtUtc ?? 'horário indisponível'}</p>
                  {leg.departureRawMetar && <p className="break-all font-mono text-[9px] text-slate-400">METAR: {leg.departureRawMetar}</p>}
                  <p>Chegada: {leg.arrival.condition} · {fmtPoints(leg.arrivalDelta)} · {leg.arrivalStationIcao ?? 'estação indisponível'} · {leg.arrivalObservedAtUtc ?? 'horário indisponível'}</p>
                  {leg.arrivalRawMetar && <p className="break-all font-mono text-[9px] text-slate-400">METAR: {leg.arrivalRawMetar}</p>}
                </div>
              ))}
              {operationalLoad.data_quality !== 'COMPLETE' && (
                <p className="mt-0.5 font-medium text-amber-700">
                  {operationalLoad.data_quality === 'SIGVOOS_UNAVAILABLE'
                    ? 'SIGVOOS indisponível — carga de pousos não presumida.'
                    : 'Evidência meteorológica incompleta — nenhuma temperatura foi presumida.'}
                </p>
              )}
              <p className="mt-0.5 text-slate-400">
                Coeficientes da revisão governada {operationalLoad.policy_version}; cada dimensão possui limiar e cap próprios.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

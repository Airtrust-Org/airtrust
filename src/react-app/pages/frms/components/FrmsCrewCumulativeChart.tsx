import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightTimeline } from '../fortnightOperationalTimeline';
import { formatFortnightMinutes } from '../fortnightOperationalLabels';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChartDay {
  label: string;
  isoDate: string;
  jornadaH: number | null; // null = sem jornada (barra não renderiza)
  statusColor: string;
  statusLabel: string;
  hasData: boolean;
  teveJornada: boolean;
  checkinPend: boolean;
  effectiveness: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusToColor(status: string, teveJornada: boolean): string {
  if (status === 'CRITICO')    return '#f87171'; // red-400
  if (status === 'ATENCAO')    return '#fbbf24'; // amber-400
  if (status === 'INCOMPLETO') return '#94a3b8'; // slate-400
  if (teveJornada)             return '#6ee7b7'; // emerald-300
  return '#e2e8f0';                              // slate-200 (sem jornada mas com dado)
}

function statusToLabel(status: string, hasData: boolean, teveJornada: boolean): string {
  if (!hasData)              return 'Sem registro';
  if (status === 'CRITICO')  return 'Crítico';
  if (status === 'ATENCAO')  return 'Atenção';
  if (status === 'INCOMPLETO') return 'Dados incompletos';
  if (teveJornada)           return 'OK — jornada confirmada';
  return 'Sem jornada FRMS';
}

function formatH(h: number | null): string {
  if (h == null || !Number.isFinite(h)) return '--';
  return `${h.toFixed(1)}h`;
}

// ── Tooltip customizado ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDay }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="min-w-[160px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-slate-800">{d.label}</p>
      <p className={`mb-1 text-[11px] font-medium ${d.statusLabel === 'Crítico' ? 'text-red-600' : d.statusLabel === 'Atenção' ? 'text-amber-700' : 'text-slate-500'}`}>
        {d.statusLabel}
      </p>
      {d.teveJornada ? (
        <p className="text-slate-700">
          Jornada: <span className="font-medium">{formatH(d.jornadaH)}</span>
        </p>
      ) : d.hasData ? (
        <p className="text-slate-400">Sem jornada FRMS neste dia</p>
      ) : (
        <p className="text-slate-400">
          Sem registro — pode ser descanso ou dado não disponível.
        </p>
      )}
      {d.checkinPend && <p className="mt-1 text-yellow-700">⋯ Check-in pendente</p>}
      {d.effectiveness != null && (
        <p className="mt-0.5 text-slate-500">
          Efetividade est.: <span className="font-medium">{d.effectiveness.toFixed(1)}%</span>
        </p>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  funcionarioId: number;
  displayName: string;
  periodStart: string;
  periodEnd: string;
  onClose?: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function FrmsCrewCumulativeChart({
  funcionarioId,
  displayName,
  periodStart,
  periodEnd,
  onClose,
}: Props) {
  const { data, loading, error } = useFrmsOperationalSnapshot(
    {
      data_inicio: periodStart,
      data_fim: periodEnd,
      funcionario_id: String(funcionarioId),
      include_inconsistencies: true,
    },
    { enabled: Boolean(funcionarioId && periodStart && periodEnd) },
  );

  const timeline = useMemo(() => {
    if (!data.length || !periodStart || !periodEnd) return null;
    return buildFortnightTimeline(data, { periodStart, periodEnd });
  }, [data, periodStart, periodEnd]);

  // Acumulado canônico: usar o valor do backend (fortnight_indicator) quando disponível.
  // O fortnight_indicator.duty_time_periodo_min vem do item mais recente com indicador.
  const canonicalAccum = useMemo(() => {
    if (!data.length) return null;
    for (let i = data.length - 1; i >= 0; i--) {
      const fi = data[i]!.fortnight_indicator;
      if (fi?.duty_time_periodo_min != null) return fi.duty_time_periodo_min;
    }
    // Fallback: soma local (menos preciso se período não cobrir quinzena completa)
    return timeline?.summary.cumulative_duty_min ?? null;
  }, [data, timeline]);

  // Limite de referência (HV ou duty) do fortnight_indicator
  const limitRef = useMemo(() => {
    for (const item of data) {
      const lim = item.fortnight_indicator?.limite_referencia;
      if (lim) return lim;
    }
    return null;
  }, [data]);

  const chartData = useMemo<ChartDay[]>(() => {
    if (!timeline) return [];
    const byDate = new Map(data.map((item) => [item.data_operacional, item]));
    return timeline.days.map((day) => {
      const raw = byDate.get(day.data_operacional);
      const status = raw?.snapshot_status ?? 'SEM_REGISTRO';
      const hasData = Boolean(raw);
      const teveJornada = day.teve_jornada;
      const checkinPend = raw?.checkin_status === 'PENDENTE' || raw?.checkin_status === 'AUSENTE';
      return {
        label: day.label,
        isoDate: day.data_operacional,
        // null → Recharts não renderiza barra para esse dia
        jornadaH: teveJornada ? Math.round((day.jornada_min / 60) * 10) / 10 : null,
        statusColor: statusToColor(status, teveJornada),
        statusLabel: statusToLabel(status, hasData, teveJornada),
        hasData,
        teveJornada,
        checkinPend,
        effectiveness: raw?.effectiveness_pct ?? null,
      };
    });
  }, [timeline, data]);

  // Linha de limite no gráfico (em horas)
  const limitLineH = useMemo(() => {
    if (!limitRef) return null;
    const h = limitRef.valor_limite / 60;
    return Number.isFinite(h) && h > 0 ? h : null;
  }, [limitRef]);

  const jornadaDays = timeline?.summary.jornadas_days ?? 0;
  const criticalDays = timeline?.summary.critical_days ?? 0;
  const attentionDays = timeline?.summary.attention_days ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Jornada diária — {displayName}
          </h2>
          <p className="text-xs text-slate-500">
            {periodStart} → {periodEnd}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        )}
      </div>

      {/* KPIs do período */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {canonicalAccum != null && (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
            Acumulado quinzena: {formatFortnightMinutes(canonicalAccum)}
            {canonicalAccum !== (timeline?.summary.cumulative_duty_min ?? 0) && (
              <span className="ml-1 text-slate-400">(fonte: quinzena)</span>
            )}
          </span>
        )}
        {jornadaDays > 0 && (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
            {jornadaDays} dias com jornada
          </span>
        )}
        {criticalDays > 0 && (
          <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
            {criticalDays} críticos
          </span>
        )}
        {attentionDays > 0 && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            {attentionDays} em atenção
          </span>
        )}
        {limitRef && (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
            Limite ref. ({limitRef.tipo}): {formatFortnightMinutes(limitRef.valor_limite)} —{' '}
            {limitRef.pct_atingido.toFixed(0)}% atingido
          </span>
        )}
      </div>

      {/* Gráfico */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          Carregando...
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Não foi possível carregar os dados.
        </div>
      ) : !timeline || chartData.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          Sem dados suficientes para o período.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                unit="h"
                width={32}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />

              {/* Linha de limite regulatório (se disponível) */}
              {limitLineH != null && (
                <ReferenceLine
                  y={limitLineH}
                  stroke="#ef4444"
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  label={{ value: `limite ${limitLineH.toFixed(0)}h`, fontSize: 9, fill: '#ef4444', position: 'insideTopRight' }}
                />
              )}

              <Bar dataKey="jornadaH" name="Jornada diária" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {chartData.map((d) => (
                  <Cell key={d.isoDate} fill={d.statusColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legenda de cores */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-400" /> Crítico
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Atenção
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-300" /> OK
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-slate-300" /> Incompleto
            </span>
            <span className="inline-flex items-center gap-1.5 italic text-slate-400">
              Dias sem barra = sem jornada FRMS ou sem registro
            </span>
          </div>
        </>
      )}

      <p className="text-[10px] text-slate-400">
        Indicador operacional de apoio à decisão — não substitui avaliação regulatória.
        Acumulado de quinzena usa dado do servidor quando disponível; fallback é soma local do período consultado.
      </p>
    </div>
  );
}

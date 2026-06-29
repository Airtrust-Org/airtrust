import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
} from 'recharts';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightTimeline } from '../fortnightOperationalTimeline';
import { formatFortnightMinutes } from '../fortnightOperationalLabels';

interface Props {
  funcionarioId: number;
  displayName: string;
  periodStart: string;
  periodEnd: string;
  onClose?: () => void;
}

type DayType = 'absent' | 'estimated' | 'confirmed' | 'rest';

interface ChartDay {
  label: string;
  isoDate: string;
  jornadaDia: number | null;
  jornadaAcum: number;
  hvAcum: number;
  effectiveness: number | null;
  hasData: boolean;
  teveJornada: boolean;
  isEstimated: boolean;
  dayType: DayType;
  sleepSource: string | null;
  jornadaSource: string | null;
}

function dayTypeLabel(dayType: DayType): string {
  if (dayType === 'absent') return 'Dado ausente';
  if (dayType === 'estimated') return 'Dado estimado';
  if (dayType === 'confirmed') return 'Jornada confirmada';
  return 'Sem jornada registrada';
}

function formatHours(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}h`;
}

function formatPct(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDay }>;
}) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  const typeLabel = dayTypeLabel(day.dayType);
  const typeColor =
    day.dayType === 'absent'
      ? 'text-slate-500'
      : day.dayType === 'estimated'
        ? 'text-amber-700'
        : day.dayType === 'confirmed'
          ? 'text-emerald-700'
          : 'text-slate-600';

  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-slate-800">{day.label}</p>
      <p className={`mb-1.5 font-medium ${typeColor}`}>{typeLabel}</p>
      {day.dayType === 'absent' ? (
        <p className="text-slate-400">Sem registro operacional neste dia.</p>
      ) : (
        <div className="space-y-0.5 text-slate-600">
          {day.teveJornada ? (
            <p>
              Jornada do dia:{' '}
              <span className="font-medium">{formatHours(day.jornadaDia)}</span>
            </p>
          ) : (
            <p className="text-slate-400">Sem jornada FRMS registrada neste dia</p>
          )}
          <p>
            Jornada acumulada:{' '}
            <span className="font-medium">{formatHours(day.jornadaAcum)}</span>
          </p>
          <p>
            HV acumulada: <span className="font-medium">{formatHours(day.hvAcum)}</span>
          </p>
          {day.effectiveness != null && (
            <p>
              Efetividade estimada:{' '}
              <span className="font-medium">{formatPct(day.effectiveness)}</span>
            </p>
          )}
          {day.isEstimated && (
            <p className="mt-1 text-amber-600">
              Jornada: {day.jornadaSource ?? '--'} · Sono: {day.sleepSource ?? '--'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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

  const chartData = useMemo<ChartDay[]>(() => {
    if (!timeline) return [];
    const byDate = new Map(data.map((item) => [item.data_operacional, item]));
    return timeline.days.map((day) => {
      const raw = byDate.get(day.data_operacional);
      const isEstimated = Boolean(
        raw &&
          (raw.sleep_data_source === 'ESTIMADO' ||
            raw.jornada_data_source === 'ESTIMADO' ||
            raw.jornada_data_source === 'INCONSISTENTE'),
      );
      const dayType: DayType = !day.has_snapshot_data
        ? 'absent'
        : isEstimated
          ? 'estimated'
          : day.teve_jornada
            ? 'confirmed'
            : 'rest';
      return {
        label: day.label,
        isoDate: day.data_operacional,
        jornadaDia: day.teve_jornada
          ? Math.round((day.jornada_min / 60) * 10) / 10
          : null,
        jornadaAcum: Math.round((day.jornada_acumulada_min / 60) * 10) / 10,
        hvAcum: Math.round((day.voo_acumulada_min / 60) * 10) / 10,
        effectiveness: day.effectiveness_pct,
        hasData: day.has_snapshot_data,
        teveJornada: day.teve_jornada,
        isEstimated,
        dayType,
        sleepSource: raw?.sleep_data_source ?? null,
        jornadaSource: raw?.jornada_data_source ?? null,
      };
    });
  }, [timeline, data]);

  const absentDayLabels = useMemo(
    () => chartData.filter((d) => !d.hasData).map((d) => d.label),
    [chartData],
  );
  const estimatedDayPoints = useMemo(
    () => chartData.filter((d) => d.isEstimated),
    [chartData],
  );

  const hasAbsentDays = absentDayLabels.length > 0;
  const hasEstimatedDays = estimatedDayPoints.length > 0;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Acumulado da quinzena — {displayName}
          </h2>
          <p className="text-xs text-slate-500">
            {periodStart} → {periodEnd}
            {timeline && (
              <>
                {' · '}
                {timeline.summary.jornadas_days} dias com jornada · Jornada acumulada{' '}
                {formatFortnightMinutes(timeline.summary.cumulative_duty_min)} · HV acumulada{' '}
                {formatFortnightMinutes(timeline.summary.cumulative_flight_min)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {timeline && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {timeline.summary.critical_days > 0 && (
                <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">
                  {timeline.summary.critical_days} dias críticos
                </span>
              )}
              {timeline.summary.attention_days > 0 && (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                  {timeline.summary.attention_days} dias em atenção
                </span>
              )}
              {timeline.summary.pending_checkins > 0 && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600">
                  {timeline.summary.pending_checkins} check-ins pendentes
                </span>
              )}
              {timeline.summary.estimated_days > 0 && (
                <span className="rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-amber-600">
                  {timeline.summary.estimated_days} dias estimados
                </span>
              )}
            </div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              aria-label="Fechar gráfico"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400">
          Carregando acumulado...
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Não foi possível carregar o acumulado da quinzena.
        </div>
      ) : !timeline || chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400">
          Sem dados suficientes para o período.
        </div>
      ) : (
        <>
          {/* Legenda de interpretação — só quando há dias ausentes */}
          {(hasAbsentDays || hasEstimatedDays) && (
            <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              {hasAbsentDays && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-5 rounded-sm bg-slate-300/60 border border-slate-300" />
                  Dado ausente — sem registro operacional
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-slate-100 border border-slate-200" />
                Sem jornada — dado válido, sem voo FRMS
              </span>
              {hasEstimatedDays && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Dado estimado
                </span>
              )}
              {hasAbsentDays && (
                <span className="italic text-slate-400">Dado ausente ≠ dia de descanso</span>
              )}
            </div>
          )}

          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="hours"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                unit="h"
                width={36}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                unit="%"
                width={36}
                domain={[0, 100]}
              />
              <Tooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />

              {/* Faixa cinza para dias sem registro operacional */}
              {absentDayLabels.map((label) => (
                <ReferenceArea
                  key={`absent-${label}`}
                  x1={label}
                  x2={label}
                  yAxisId="hours"
                  fill="#cbd5e1"
                  fillOpacity={0.45}
                  ifOverflow="visible"
                />
              ))}

              <Bar
                yAxisId="hours"
                dataKey="jornadaDia"
                name="Jornada diária"
                fill="#cbd5e1"
                opacity={0.9}
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="hours"
                type="monotone"
                dataKey="jornadaAcum"
                name="Jornada acumulada"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="hours"
                type="monotone"
                dataKey="hvAcum"
                name="HV acumulada"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="effectiveness"
                name="Efetividade estimada"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                strokeDasharray="4 2"
              />

              {/* Marcadores âmbar para dias com dado estimado */}
              {estimatedDayPoints.map((d) => (
                <ReferenceDot
                  key={`est-${d.isoDate}`}
                  x={d.label}
                  y={d.jornadaAcum}
                  yAxisId="hours"
                  r={3}
                  fill="#f59e0b"
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      <p className="text-[10px] text-slate-400">
        Indicador operacional de apoio à decisão — não substitui avaliação regulatória. Dados
        estimados podem divergir da jornada real confirmada.
      </p>
    </div>
  );
}

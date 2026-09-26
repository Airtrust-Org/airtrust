/**
 * FrmsEffectivenessTimeline — leitura temporal orientada à decisão.
 *
 * A efetividade permanece como referência central. O gestor pode sobrepor
 * grupos coerentes de drivers sem transformar o gráfico em um painel poluído.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFrmsJornadasEffectiveness } from '@/react-app/hooks/useFrms';
import type { FrmsEffectivenessJornadaRow } from '@/react-app/hooks/useFrms';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { getEffectivenessHex, getEffectivenessLabel, type ConfigLimites } from '../frmsUtils';

type ViewMode = 'effectiveness' | 'workload' | 'operational' | 'recovery';

interface ChartPoint {
  data_apresentacao: string;
  effectiveness_pct: number | null;
  processado_com_bug: number | null;
  jornada_boundary_source: 'REAL' | 'ESTIMADO' | 'AUSENTE' | null;
  duty_hours: number | null;
  flight_hours: number | null;
  simulator_hours: number | null;
  training_hours: number | null;
  sleep_hours: number | null;
  landings_count: number | null;
  temperature_c: number | null;
  recovery_points: number | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  operational_load_data_quality: string | null;
  tempo_abaixo_limiar_min: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
}

interface Props {
  tripulanteId: string | null | undefined;
  tripulanteNome?: string;
  config: ConfigLimites;
  mapPeriodoDias?: number;
  mapPeriodoInicio?: string;
  mapPeriodoFim?: string;
  mapPeriodoLabel?: string;
  compact?: boolean;
  snapshotItems?: FrmsOperationalSnapshotItem[];
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const minutes = Math.round(value * 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

function parseRecoveryPoints(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = Number(parsed.recuperacao ?? 0);
    return Number.isFinite(value) ? Math.round(value * 1000) / 10 : null;
  } catch {
    return null;
  }
}

function getNivelDotColor(pct: number | null, config: ConfigLimites): string {
  if (pct == null) return '#94A3B8';
  return getEffectivenessHex(pct, config);
}

function ColoredDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  config: ConfigLimites;
}) {
  const { cx, cy, payload, config } = props;
  if (cx == null || cy == null || payload?.effectiveness_pct == null) return null;
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.jornada_boundary_source === 'ESTIMADO' ? '#fff' : getNivelDotColor(payload.effectiveness_pct, config)}
      stroke={getNivelDotColor(payload.effectiveness_pct, config)}
      strokeWidth={payload.jornada_boundary_source === 'ESTIMADO' ? 2.5 : 1.5}
    />
  );
}

function CustomTooltip({
  active,
  payload,
  config,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  config: ConfigLimites;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-[220px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold text-slate-800">{formatDate(point.data_apresentacao)}</p>
      {point.effectiveness_pct != null ? (
        <p className="mt-1 font-semibold" style={{ color: getNivelDotColor(point.effectiveness_pct, config) }}>
          Efetividade {point.effectiveness_pct.toFixed(1)}% · {getEffectivenessLabel(point.effectiveness_pct, config)}
        </p>
      ) : (
        <p className="mt-1 font-semibold text-rose-600">Efetividade indisponível — check-in/dados insuficientes</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
        <span>Jornada</span><strong>{formatHours(point.duty_hours)}</strong>
        <span>Voo real</span><strong>{formatHours(point.flight_hours)}</strong>
        <span>Simulador</span><strong>{formatHours(point.simulator_hours)}</strong>
        <span>Treinamento</span><strong>{formatHours(point.training_hours)}</strong>
        <span>Sono/repouso</span><strong>{formatHours(point.sleep_hours)}</strong>
        <span>Pousos</span><strong>{point.landings_count ?? '—'}</strong>
        <span>Temperatura máx.</span><strong>{point.temperature_c == null ? '—' : `${point.temperature_c.toFixed(1)} °C`}</strong>
        <span>Recuperação</span><strong>{point.recovery_points == null ? '—' : `+${point.recovery_points.toFixed(1)} pt`}</strong>
      </div>
      {point.hora_apresentacao && point.hora_termino && (
        <p className="mt-2 text-slate-500">
          Jornada {point.jornada_boundary_source === 'REAL' ? 'real (check-in)' : point.jornada_boundary_source === 'ESTIMADO' ? 'estimada (janela operacional)' : 'não classificada'}: {point.hora_apresentacao.slice(0, 5)}–{point.hora_termino.slice(0, 5)}
        </p>
      )}
      {point.operational_load_data_quality && point.operational_load_data_quality !== 'COMPLETE' && (
        <p className="mt-1 text-amber-700">Carga operacional: {point.operational_load_data_quality}</p>
      )}
    </div>
  );
}

const MODE_LABELS: Array<{ value: ViewMode; label: string }> = [
  { value: 'effectiveness', label: 'Efetividade' },
  { value: 'workload', label: 'Jornada / HV' },
  { value: 'operational', label: 'Pousos / temperatura' },
  { value: 'recovery', label: 'Sono / recuperação' },
];

export default function FrmsEffectivenessTimeline({
  tripulanteId,
  tripulanteNome,
  config,
  mapPeriodoDias = 30,
  mapPeriodoInicio,
  mapPeriodoFim,
  mapPeriodoLabel,
  compact = false,
  snapshotItems = [],
}: Props) {
  const [dias, setDias] = useState(mapPeriodoDias);
  const [usarPeriodoMapa, setUsarPeriodoMapa] = useState(true);
  const [mode, setMode] = useState<ViewMode>('effectiveness');

  useEffect(() => {
    setDias(mapPeriodoDias);
    setUsarPeriodoMapa(true);
  }, [mapPeriodoDias, mapPeriodoInicio, mapPeriodoFim]);

  const range =
    usarPeriodoMapa && mapPeriodoInicio && mapPeriodoFim
      ? { inicio: mapPeriodoInicio, fim: mapPeriodoFim }
      : undefined;
  const { data: jornadasRaw, loading } = useFrmsJornadasEffectiveness(tripulanteId, dias, range);
  const jornadas = useMemo(
    () => (jornadasRaw as FrmsEffectivenessJornadaRow[] | null) ?? [],
    [jornadasRaw],
  );

  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;

  const chartData = useMemo<ChartPoint[]>(() => {
    const byDate = new Map<string, ChartPoint>();

    for (const j of jornadas) {
      byDate.set(j.data_apresentacao, {
        data_apresentacao: j.data_apresentacao,
        effectiveness_pct: j.effectiveness_pct,
        processado_com_bug: j.processado_com_bug ?? null,
        jornada_boundary_source: j.jornada_boundary_source ?? null,
        duty_hours:
          j.duracao_jornada_minutos == null ? null : Number(j.duracao_jornada_minutos) / 60,
        flight_hours: j.horas_voo_minutos == null ? null : Number(j.horas_voo_minutos) / 60,
        simulator_hours: null,
        training_hours: null,
        sleep_hours:
          j.duracao_sono_efetiva_min == null ? null : Number(j.duracao_sono_efetiva_min) / 60,
        landings_count:
          j.operational_load_landings_count == null ? null : Number(j.operational_load_landings_count),
        temperature_c:
          j.operational_load_temperature_max_c == null ? null : Number(j.operational_load_temperature_max_c),
        recovery_points: parseRecoveryPoints(j.effectiveness_componentes_json),
        hora_apresentacao: j.hora_apresentacao ?? null,
        hora_termino: j.hora_termino ?? null,
        operational_load_data_quality: j.operational_load_data_quality ?? null,
        tempo_abaixo_limiar_min: j.tempo_abaixo_limiar_min ?? null,
        dia_periodo_embarcado: j.dia_periodo_embarcado ?? null,
        total_dias_periodo: j.total_dias_periodo ?? null,
      });
    }

    for (const snapshot of snapshotItems) {
      const current = byDate.get(snapshot.data_operacional);
      const snapshotBoundary =
        snapshot.jornada_data_source === 'REAL'
          ? 'REAL'
          : snapshot.jornada_data_source === 'ESTIMADO' || snapshot.jornada_data_source === 'MANUAL'
            ? 'ESTIMADO'
            : 'AUSENTE';
      byDate.set(snapshot.data_operacional, {
        data_apresentacao: snapshot.data_operacional,
        effectiveness_pct: snapshot.effectiveness_pct ?? current?.effectiveness_pct ?? null,
        processado_com_bug: current?.processado_com_bug ?? null,
        jornada_boundary_source: snapshotBoundary,
        duty_hours:
          snapshot.atividade_frms_minutos != null
            ? Number(snapshot.atividade_frms_minutos) / 60
            : snapshot.duracao_jornada_minutos > 0
              ? Number(snapshot.duracao_jornada_minutos) / 60
              : current?.duty_hours ?? null,
        flight_hours:
          snapshot.horas_voo_minutos > 0
            ? Number(snapshot.horas_voo_minutos) / 60
            : current?.flight_hours ?? null,
        simulator_hours:
          Number(snapshot.simulador_minutos ?? 0) > 0 ? Number(snapshot.simulador_minutos) / 60 : null,
        training_hours:
          Number(snapshot.treinamento_minutos ?? 0) > 0 ? Number(snapshot.treinamento_minutos) / 60 : null,
        sleep_hours:
          snapshot.horas_sono != null ? Number(snapshot.horas_sono) : current?.sleep_hours ?? null,
        landings_count: current?.landings_count ?? null,
        temperature_c: current?.temperature_c ?? null,
        recovery_points:
          snapshot.recovery_credit_points != null
            ? Number(snapshot.recovery_credit_points)
            : current?.recovery_points ?? null,
        hora_apresentacao:
          snapshot.hora_apresentacao ?? snapshot.atividade_hora_inicio ?? current?.hora_apresentacao ?? null,
        hora_termino:
          snapshot.hora_termino ?? snapshot.atividade_hora_fim ?? current?.hora_termino ?? null,
        operational_load_data_quality: current?.operational_load_data_quality ?? null,
        tempo_abaixo_limiar_min: current?.tempo_abaixo_limiar_min ?? null,
        dia_periodo_embarcado: snapshot.fortnight_indicator?.dia_periodo ?? current?.dia_periodo_embarcado ?? null,
        total_dias_periodo: snapshot.fortnight_indicator?.total_dias_periodo ?? current?.total_dias_periodo ?? null,
      });
    }

    return [...byDate.values()].sort((a, b) => a.data_apresentacao.localeCompare(b.data_apresentacao));
  }, [jornadas, snapshotItems]);

  const hasValidEffectiveness = chartData.some(
    (point) => point.effectiveness_pct != null && Number.isFinite(point.effectiveness_pct),
  );
  const hasOperationalHistory = chartData.some(
    (point) =>
      (point.duty_hours != null && Number.isFinite(point.duty_hours)) ||
      (point.flight_hours != null && Number.isFinite(point.flight_hours)) ||
      (point.simulator_hours != null && Number.isFinite(point.simulator_hours)) ||
      (point.training_hours != null && Number.isFinite(point.training_hours)),
  );
  const hasOperationalMetrics = chartData.some(
    (point) => point.landings_count != null || point.temperature_c != null,
  );
  const hasRecoveryMetrics = chartData.some(
    (point) => point.sleep_hours != null || point.recovery_points != null,
  );
  const modeHasData =
    mode === 'effectiveness'
      ? hasValidEffectiveness
      : mode === 'workload'
        ? hasOperationalHistory
        : mode === 'operational'
          ? hasOperationalMetrics
          : hasRecoveryMetrics;

  useEffect(() => {
    if (!loading && !hasValidEffectiveness && hasOperationalHistory && mode === 'effectiveness') {
      setMode('workload');
    }
  }, [hasOperationalHistory, hasValidEffectiveness, loading, mode]);

  if (!tripulanteId) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-center text-sm text-slate-400">Selecione um tripulante para ver a evolução diária.</p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-800">Evolução diária</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {tripulanteNome || 'Tripulante'} · efetividade e drivers operacionais
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MODE_LABELS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                mode === item.value
                  ? 'border-slate-300 bg-slate-800 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          Passe o cursor sobre um dia para ver o cenário completo e a qualidade dos dados.
        </p>
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => {
              setUsarPeriodoMapa(true);
              setDias(mapPeriodoDias);
            }}
            className={`rounded-md px-2 py-1 ${
              usarPeriodoMapa ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
            title={mapPeriodoLabel ?? 'Período atual'}
          >
            Mapa
          </button>
          {[30, 90, 180, 365].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setUsarPeriodoMapa(false);
                setDias(value);
              }}
              className={`rounded-md px-2 py-1 ${
                !usarPeriodoMapa && dias === value
                  ? 'bg-white font-semibold text-slate-800 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-44 items-center justify-center">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        </div>
      ) : !modeHasData ? (
        <div className="flex min-h-44 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {mode === 'effectiveness'
                ? 'Efetividade indisponível'
                : mode === 'workload'
                  ? 'Sem carga operacional registrada'
                  : mode === 'operational'
                    ? 'Sem dados de pousos ou temperatura'
                    : 'Sem dados de sono ou recuperação'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'effectiveness'
                ? 'O cálculo só é apresentado quando o check-in diário contém apresentação, sono/repouso e despertar válidos.'
                : 'Não há dados confiáveis desta dimensão no período selecionado; ausência não é tratada como zero.'}
            </p>
            {mode === 'effectiveness' && hasOperationalHistory ? (
              <button type="button" onClick={() => setMode('workload')} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                Ver histórico de atividade / voo
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={compact ? 230 : 270}>
          <LineChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <ReferenceArea yAxisId="effectiveness" y1={0} y2={amarelo} fill="#F8FAFC" fillOpacity={0.9} />
            <XAxis dataKey="data_apresentacao" tickFormatter={formatDate} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} />
            <YAxis
              yAxisId="effectiveness"
              domain={[0, 100]}
              width={36}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickFormatter={(value) => `${value}%`}
            />
            {mode === 'workload' || mode === 'recovery' ? (
              <YAxis
                yAxisId="hours"
                orientation="right"
                width={36}
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickFormatter={(value) => `${value}h`}
              />
            ) : null}
            {mode === 'operational' ? (
              <>
                <YAxis yAxisId="count" orientation="right" width={30} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  width={42}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#B45309' }}
                  tickFormatter={(value) => `${value}°`}
                />
              </>
            ) : null}
            {mode === 'recovery' ? (
              <YAxis
                yAxisId="points"
                orientation="right"
                width={36}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: '#047857' }}
              />
            ) : null}

            <Tooltip content={<CustomTooltip config={config} />} />
            <ReferenceLine yAxisId="effectiveness" y={verde} stroke="#0F766E" strokeDasharray="6 3" />
            <ReferenceLine yAxisId="effectiveness" y={amarelo} stroke="#D97706" strokeDasharray="6 3" />
            <ReferenceLine yAxisId="effectiveness" y={vermelho} stroke="#DC2626" strokeDasharray="6 3" />

            <Line
              yAxisId="effectiveness"
              type="monotone"
              dataKey="effectiveness_pct"
              name="Efetividade"
              stroke="#334155"
              strokeWidth={2.2}
              dot={(props) => <ColoredDot {...props} config={config} />}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />

            {mode === 'workload' ? (
              <>
                <Line yAxisId="hours" type="monotone" dataKey="duty_hours" name="Jornada" stroke="#2563EB" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="hours" type="monotone" dataKey="flight_hours" name="Voo real" stroke="#7C3AED" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="hours" type="monotone" dataKey="simulator_hours" name="Simulador" stroke="#0F766E" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="hours" type="monotone" dataKey="training_hours" name="Treinamento" stroke="#D97706" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
              </>
            ) : null}

            {mode === 'operational' ? (
              <>
                <Line yAxisId="count" type="monotone" dataKey="landings_count" name="Pousos" stroke="#0F766E" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="temp" type="monotone" dataKey="temperature_c" name="Temperatura" stroke="#D97706" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
              </>
            ) : null}

            {mode === 'recovery' ? (
              <>
                <Line yAxisId="hours" type="monotone" dataKey="sleep_hours" name="Sono/repouso" stroke="#0284C7" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
                <Line yAxisId="points" type="monotone" dataKey="recovery_points" name="Crédito recuperação" stroke="#059669" strokeWidth={1.8} dot={{ r: 3 }} connectNulls={false} />
              </>
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">Efetividade: somente check-in completo · Jornada/HV: real ou estimada, conforme fonte</span>
        {mode === 'workload' && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1">Atividade, voo real, simulador e treinamento em horas</span>}
        {mode === 'operational' && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1">Pousos + temperatura observada</span>}
        {mode === 'recovery' && <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1">Sono + crédito efetivamente aplicado</span>}
      </div>
    </div>
  );
}

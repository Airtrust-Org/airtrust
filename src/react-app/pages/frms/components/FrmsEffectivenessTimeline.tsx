/**
 * FrmsEffectivenessTimeline — Curva temporal do índice estimado de efetividade
 *
 * Exibe a curva de effectiveness ao longo do tempo para o tripulante selecionado.
 * Proxy local inspirado em referências ICAO e modelos biomatemáticos.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { useFrmsJornadasEffectiveness } from '@/react-app/hooks/useFrms';
import type { FrmsEffectivenessJornadaRow } from '@/react-app/hooks/useFrms';
import { getEffectivenessHex, getEffectivenessLabel, type ConfigLimites } from '../frmsUtils';

// ── Helpers ──────────────────────────

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function getNivelDotColor(pct: number | null, config: ConfigLimites): string {
  if (pct === null || pct === undefined) return '#94A3B8';
  return getEffectivenessHex(pct, config);
}

// ── Tooltip customizado ───────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartPoint }>;
  label?: string;
  config: ConfigLimites;
}

function CustomTooltip({ active, payload, config }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const pct = point.effectiveness_pct;
  const color = getNivelDotColor(pct, config);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-sm">
      <p className="font-semibold text-slate-700">{formatDate(point.data_apresentacao)}</p>
      {pct != null ? (
        <>
          <p style={{ color }}>
            <span className="font-bold">{pct.toFixed(1)}%</span>
          </p>
          <p className="text-xs text-slate-500">{getEffectivenessLabel(pct, config)}</p>
          {point.duracao_sono_efetiva_min != null && (
            <p className="text-xs text-slate-400 mt-1">
              Sono efetivo: {formatMinutes(point.duracao_sono_efetiva_min)}
            </p>
          )}
          {point.hora_despertar_estimada && (
            <p className="text-xs text-slate-400">
              Despertar: {point.hora_despertar_estimada.slice(0, 5)}
            </p>
          )}
          {point.processado_com_bug === 1 ? (
            <p className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Dado legado pré-C2
            </p>
          ) : point.processado_com_bug === 0 ? (
            <p className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              Cálculo C2 corrigido
            </p>
          ) : null}
          {!point.hora_despertar_estimada && point.duracao_sono_efetiva_min == null ? (
            <p className="mt-1 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              Sem horário de apresentação: recálculo pendente
            </p>
          ) : null}
          {point.tempo_abaixo_limiar_min != null && point.tempo_abaixo_limiar_min > 0 && (
            <p className="text-xs text-amber-600">
              ⚠ {formatMinutes(point.tempo_abaixo_limiar_min)} abaixo do limiar
            </p>
          )}
          {point.dia_periodo_embarcado != null &&
            point.total_dias_periodo != null &&
            point.total_dias_periodo > 1 && (
              <p className="text-xs text-blue-400 mt-1">
                📅 Dia {point.dia_periodo_embarcado} de {point.total_dias_periodo} embarcado
              </p>
            )}
        </>
      ) : (
        <p className="text-slate-400 text-xs">Sem dados de efetividade</p>
      )}
    </div>
  );
}

// ── Dot colorido por nível ────────────────────────────────────────────

function ColoredDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  config: ConfigLimites;
}) {
  const { cx, cy, payload, config } = props;
  if (cx == null || cy == null || payload?.effectiveness_pct == null) return null;
  const fill = getNivelDotColor(payload.effectiveness_pct, config);
  return <Dot cx={cx} cy={cy} r={4} fill={fill} stroke="#fff" strokeWidth={1.5} />;
}

// ── Tipos internos ──────────────────────────────────────────────────

interface ChartPoint {
  data_apresentacao: string;
  effectiveness_pct: number | null;
  processado_com_bug: number | null;
  duracao_sono_efetiva_min: number | null;
  hora_despertar_estimada: string | null;
  tempo_abaixo_limiar_min: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
}

// ── Props ───────────────────────────────────────────────────────────

interface Props {
  tripulanteId: string | null | undefined;
  tripulanteNome?: string;
  config: ConfigLimites;
  mapPeriodoDias?: number;
  mapPeriodoInicio?: string;
  mapPeriodoFim?: string;
  mapPeriodoLabel?: string;
}

// ── Componente ───────────────────────────────────────────────────────

export default function FrmsEffectivenessTimeline({
  tripulanteId,
  tripulanteNome,
  config,
  mapPeriodoDias = 30,
  mapPeriodoInicio,
  mapPeriodoFim,
  mapPeriodoLabel,
}: Props) {
  const [dias, setDias] = useState(mapPeriodoDias);
  const [usarPeriodoMapa, setUsarPeriodoMapa] = useState(true);

  useEffect(() => {
    setDias(mapPeriodoDias);
    setUsarPeriodoMapa(true);
  }, [mapPeriodoDias, mapPeriodoInicio, mapPeriodoFim]);

  const range =
    usarPeriodoMapa && mapPeriodoInicio && mapPeriodoFim
      ? { inicio: mapPeriodoInicio, fim: mapPeriodoFim }
      : undefined;

  const { data: jornadasRaw, loading } = useFrmsJornadasEffectiveness(tripulanteId, dias, range);
  const jornadas: FrmsEffectivenessJornadaRow[] = useMemo(
    () => (jornadasRaw as FrmsEffectivenessJornadaRow[] | null) ?? [],
    [jornadasRaw],
  );

  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;

  const chartData: ChartPoint[] = useMemo(
    () =>
      jornadas.map((j) => ({
        data_apresentacao: j.data_apresentacao,
        effectiveness_pct: j.effectiveness_pct,
        processado_com_bug: j.processado_com_bug ?? null,
        duracao_sono_efetiva_min: j.duracao_sono_efetiva_min ?? null,
        hora_despertar_estimada: j.hora_despertar_estimada ?? null,
        tempo_abaixo_limiar_min: j.tempo_abaixo_limiar_min ?? null,
        dia_periodo_embarcado: j.dia_periodo_embarcado ?? null,
        total_dias_periodo: j.total_dias_periodo ?? null,
      })),
    [jornadas],
  );
  const hasValidEffectiveness = chartData.some(
    (point) => point.effectiveness_pct != null && Number.isFinite(point.effectiveness_pct),
  );

  // Estado vazio — sem tripulante selecionado
  if (!tripulanteId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-center h-48 shadow-sm">
        <p className="text-sm text-slate-400 text-center">
          Selecione um tripulante no heatmap para ver a curva de efetividade
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-[0.16em]">
            Curva de Efetividade
          </h3>
          {tripulanteNome && <p className="text-xs text-slate-400 mt-0.5">{tripulanteNome}</p>}
        </div>
        {/* Toggle de período */}
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
          <button
            onClick={() => {
              setUsarPeriodoMapa(true);
              setDias(mapPeriodoDias);
            }}
            className={`px-3 py-1.5 transition-colors ${
              usarPeriodoMapa
                ? 'rounded-lg bg-white text-slate-800 font-semibold shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title={mapPeriodoLabel ?? 'Período atual do mapa'}
          >
            Mapa
          </button>
          {[30, 60, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => {
                setUsarPeriodoMapa(false);
                setDias(d);
              }}
              className={`px-3 py-1.5 transition-colors ${
                !usarPeriodoMapa && dias === d
                  ? 'rounded-lg bg-white text-slate-800 font-semibold shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-40 flex items-center justify-center">
          <div className="animate-pulse h-4 w-32 rounded bg-slate-200" />
        </div>
      )}

      {!loading && !hasValidEffectiveness && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Efetividade indisponível — sem base válida no período selecionado
            </p>
            <p className="mt-1 text-xs text-slate-500">
              O sistema não reutiliza um valor histórico de outro período para preencher esta visão.
            </p>
          </div>
        </div>
      )}

      {!loading && hasValidEffectiveness && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 10, right: 90, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />

            {/* Zona de risco (abaixo do limiar amarelo) */}
            <ReferenceArea y1={0} y2={amarelo} fill="#F8FAFC" fillOpacity={0.95} />

            <XAxis
              dataKey="data_apresentacao"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />

            <Tooltip content={<CustomTooltip config={config} />} />

            {/* Linha de referência: Pleno */}
            <ReferenceLine
              y={verde}
              stroke="#0F766E"
              strokeDasharray="6 3"
              label={{
                value: `Pleno (${verde}%)`,
                position: 'right',
                fontSize: 10,
                fill: '#0F766E',
              }}
            />
            {/* Linha de referência: Limiar de Degradação */}
            <ReferenceLine
              y={amarelo}
              stroke="#D97706"
              strokeDasharray="6 3"
              label={{
                value: `Limiar (${amarelo}%)`,
                position: 'right',
                fontSize: 10,
                fill: '#D97706',
              }}
            />
            {/* Linha de referência: degradação severa */}
            <ReferenceLine
              y={vermelho}
              stroke="#DC2626"
              strokeDasharray="6 3"
              label={{
                value: `Severo (${vermelho}%)`,
                position: 'right',
                fontSize: 10,
                fill: '#DC2626',
              }}
            />

            <Line
              type="monotone"
              dataKey="effectiveness_pct"
              stroke="#334155"
              strokeWidth={2}
              dot={(props) => <ColoredDot {...props} config={config} />}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          Linha temporal da efetividade
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
          Limiar de degradação
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
          Fadiga alta — revisar com gestor
        </span>
      </div>
    </div>
  );
}

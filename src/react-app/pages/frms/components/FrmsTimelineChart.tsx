/**
 * FrmsTimelineChart — Gráfico de fadiga no tempo (threshold line style)
 * Estilo dashboard financeiro com linhas de limite.
 */
import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { useApi } from '@/react-app/hooks/useApi';
import { useFrmsLimites, type FrmsFrotaRow } from '@/react-app/hooks/useFrms';
import { useFrmsFilters } from './FrmsFilterContext';
import { getComplianceHex, monthLabel } from '../frmsUtils';

// ── Helpers ──────────────────────────

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function getStatusColor(pct: number, config: Partial<Record<string, number>> | null): string {
  const hex = getComplianceHex(pct, config);
  if (hex === '#B91C1C' || hex === '#EF4444') return 'text-red-600 font-bold';
  if (hex === '#FB923C') return 'text-orange-600 font-semibold';
  if (hex === '#F59E0B') return 'text-yellow-600';
  return 'text-emerald-600';
}

// ── Tooltip ──────────────────────────

interface TimelinePoint {
  data: string;
  pct_fadiga: number;
  hv_7d: number;
  hv_28d: number;
  hv_dia: number;
  pct_dia: number;
  teve_jornada: boolean;
  hora_apresentacao: string | null;
  hora_termino: string | null;
}

function FrmsTimelineTooltip({
  active,
  payload,
  label,
  config,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimelinePoint }>;
  label?: string;
  config?: Partial<Record<string, number>> | null;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-slate-800">{formatDateShort(label || d.data)}</p>
      <p className="mt-1">
        Fadiga:{' '}
        <span className={getStatusColor(d.pct_fadiga, config ?? null)}>
          {d.pct_fadiga?.toFixed(1)}%
        </span>
      </p>
      <p className="text-slate-500">HV 7d: {formatMin(d.hv_7d)}</p>
      <p className="text-slate-500">HV 28d: {formatMin(d.hv_28d)}</p>
      {d.teve_jornada && d.hora_apresentacao && (
        <p className="text-xs text-slate-400 mt-1">
          Jornada: {d.hora_apresentacao} → {d.hora_termino || '?'}
        </p>
      )}
    </div>
  );
}

// ── Componente Principal ──────────────

interface Props {
  selectedTripulanteId?: string;
  frota?: FrmsFrotaRow[];
  onSelectTripulante?: (id: string) => void;
}

export default function FrmsTimelineChart({
  selectedTripulanteId,
  frota,
  onSelectTripulante,
}: Props) {
  const { filters, periodoNumDias, isMonthMode } = useFrmsFilters();
  const { data: limitesRaw } = useFrmsLimites();
  const limites = (limitesRaw as Record<string, number> | null) ?? {};
  const limiteAtencaoPct = Number(limites.ALERTA_ATENCAO_PCT ?? 85);
  const limiteCriticoPct = Number(limites.ALERTA_CRITICO_PCT ?? 95);

  // Se tem tripulante selecionado, buscar timeline individual
  const { data: timelineRaw, loading } = useApi<TimelinePoint[]>(
    selectedTripulanteId
      ? isMonthMode
        ? `/api/frms/tripulante/${selectedTripulanteId}/timeline?mes=${filters.mesReferencia}`
        : `/api/frms/tripulante/${selectedTripulanteId}/timeline?periodo=${periodoNumDias}`
      : '',
    {
      enabled: !!selectedTripulanteId,
      requireAuth: false,
      bypassGetCache: true,
      staleTime: 3 * 60 * 1000, // 3 min
    },
  );

  const timelineData = useMemo(() => timelineRaw ?? [], [timelineRaw]);

  const selectedNome = useMemo(() => {
    if (!frota) return '';
    const f = frota.find((t) => t.tripulante_id === selectedTripulanteId);
    return f ? f.nome_guerra || f.nome : '';
  }, [frota, selectedTripulanteId]);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-6"
      data-testid="frms-timeline-chart"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Fadiga no Tempo
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedNome ? `${selectedNome} — ` : 'Selecione um tripulante · '}
            {isMonthMode ? monthLabel(filters.mesReferencia) : `${periodoNumDias} dias`} com linhas
            de limite
          </p>
        </div>

        {/* Seletor de tripulante */}
        <select
          data-testid="frms-timeline-selector"
          value={selectedTripulanteId ?? ''}
          onChange={(e) => onSelectTripulante?.(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-xs"
        >
          <option value="">Selecione tripulante...</option>
          {(frota ?? []).map((t) => (
            <option key={t.tripulante_id} value={t.tripulante_id}>
              {t.nome_guerra || t.nome}
            </option>
          ))}
        </select>
      </div>

      {!selectedTripulanteId ? (
        <div className="flex items-center justify-center h-[250px] text-slate-400 text-sm">
          Clique em um nome no heatmap ou selecione um tripulante acima
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-[250px] text-slate-400 text-sm">
          Carregando...
        </div>
      ) : timelineData.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-slate-400 text-sm">
          Sem dados de fadiga para o período selecionado
        </div>
      ) : (
        <ResponsiveContainer
          key={`${selectedTripulanteId}-${isMonthMode ? filters.mesReferencia : periodoNumDias}`}
          width="100%"
          height={300}
        >
          <ComposedChart data={timelineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fadiga-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="data"
              tickFormatter={formatDateShort}
              tick={{ fontSize: 10 }}
              interval={Math.max(0, Math.floor(timelineData.length / 10))}
            />
            <YAxis domain={[0, 110]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />

            <Area
              type="monotone"
              dataKey="pct_fadiga"
              fill="url(#fadiga-gradient)"
              stroke="transparent"
            />

            <Line
              type="monotone"
              dataKey="pct_fadiga"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3B82F6' }}
            />

            <ReferenceLine
              y={limiteAtencaoPct}
              stroke="#F59E0B"
              strokeDasharray="6 3"
              label={{
                value: `Atenção ${limiteAtencaoPct}%`,
                fill: '#F59E0B',
                fontSize: 11,
                position: 'right',
              }}
            />

            <ReferenceLine
              y={limiteCriticoPct}
              stroke="#EF4444"
              strokeDasharray="6 3"
              label={{
                value: `Crítico ${limiteCriticoPct}%`,
                fill: '#EF4444',
                fontSize: 11,
                position: 'right',
              }}
            />

            <Tooltip content={<FrmsTimelineTooltip config={limites} />} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/**
 * FrmsComponentesChart — Decomposição de Fatores de Fadiga (Radar)
 *
 * Exibe a contribuição de cada fator no índice estimado de prontidão operacional.
 * Perfil de fatores FRMS em proxy local estimado.
 */
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// ── Config type alias ──
type ConfigLimites = Partial<Record<string, number>> | null;

// ── Types ──────────────────────────────────────────────────────────────

interface Componentes {
  processo_s: number;
  processo_c: number;
  repouso: number;
  hv: number;
  duracao: number;
}

interface Props {
  componentes: Componentes | null;
  config: ConfigLimites;
  tripulante?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

// Normaliza fator para 0-100 (abs * 100, capped 100)
function normalizeScore(raw: number | null | undefined): number {
  if (raw == null) return 0;
  return Math.min(100, Math.abs(raw) * 100);
}

const AXES = [
  { key: 'processo_s', label: 'Processo S\n(Ciclo Bio)' },
  { key: 'duracao', label: 'Duração\nJornada' },
  { key: 'processo_c', label: 'Processo C\n(Circadiano)' },
  { key: 'hv', label: 'HV\nAcumuladas' },
  { key: 'repouso', label: 'Repouso\nAnterior' },
];

// ── Tooltip customizado ─────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number; rawValue: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-md p-2 text-xs">
      <p className="font-semibold text-slate-700">{d.label}</p>
      <p className="text-slate-500">Intensidade: {d.value.toFixed(1)}%</p>
      <p className={d.rawValue >= 0 ? 'text-emerald-600' : 'text-red-600'}>
        Contribuição: {d.rawValue >= 0 ? '+' : ''}
        {(d.rawValue * 100).toFixed(1)}%
      </p>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────

export default function FrmsComponentesChart({ componentes, tripulante }: Props) {
  if (!componentes) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-center h-48">
        <p className="text-sm text-slate-400 text-center">
          🕸️ Sem dados de componentes para este tripulante
        </p>
      </div>
    );
  }

  // Calcular média para determinar cor da área
  const values = [
    componentes.processo_s,
    componentes.processo_c,
    componentes.repouso,
    componentes.hv,
    componentes.duracao,
  ];
  const avgRaw = values.reduce((s, v) => s + (v ?? 0), 0) / values.length;
  const areaColor = avgRaw >= 0 ? '#0F766E' : '#B91C1C';

  const chartData = AXES.map((ax) => {
    const raw = componentes[ax.key as keyof Componentes] ?? 0;
    return {
      label: ax.label,
      value: normalizeScore(raw),
      rawValue: raw,
    };
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-slate-800">Perfil de fatores operacionais</h4>
        {tripulante && <p className="text-xs text-slate-400">{tripulante}</p>}
        <p className="text-[10px] text-slate-400 mt-1">
          Proxy local estimado, sem validação formal SAFTE-FAST, para apoio de revisão humana.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748B' }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Radar
            dataKey="value"
            stroke={areaColor}
            fill={areaColor}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Mini-badges horizontais com valores exatos */}
      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
        {AXES.map((ax) => {
          const raw = componentes[ax.key as keyof Componentes] ?? 0;
          const positive = raw >= 0;
          return (
            <span
              key={ax.key}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium border ${
                positive
                  ? 'bg-teal-50 text-teal-700 border-teal-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {ax.label.split('\n')[0]}: {positive ? '+' : ''}
              {(raw * 100).toFixed(1)}%
            </span>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />
          Positivo (descansa)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-700 inline-block" />
          Negativo (fadiga)
        </span>
      </div>
    </div>
  );
}

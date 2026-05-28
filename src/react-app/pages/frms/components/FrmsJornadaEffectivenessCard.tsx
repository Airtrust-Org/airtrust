/**
 * FrmsJornadaEffectivenessCard — Cards de Efetividade por Jornada
 *
 * Exibe indicadores de efetividade por jornada individual
 * no estilo Leon Crew Panel, usando proxy local de efetividade.
 */
import type { FrmsEffectivenessJornadaRow } from '@/react-app/hooks/useFrms';
import { getEffectivenessHex, getEffectivenessLabel } from '../frmsUtils';

// ── Config type alias ──
type ConfigLimites = Partial<Record<string, number>> | null;

// ── Helpers ──────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function EffCircle({
  pct,
  config,
  label,
}: {
  pct: number | null;
  config: ConfigLimites;
  label: string;
}) {
  if (pct === null || pct === undefined) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center justify-center w-16 h-16 rounded-full border-2 border-slate-200 bg-slate-50">
          <span className="text-slate-400 text-lg font-bold">—</span>
        </div>
        <span className="text-xs text-slate-400 text-center">{label}</span>
        <span className="text-xs text-slate-300">Sem dados</span>
      </div>
    );
  }
  const color = getEffectivenessHex(pct, config);
  const nivelLabel = getEffectivenessLabel(pct, config);
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const progress = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
          <circle cx="30" cy="30" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="5" />
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${progress} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-sm font-bold"
          style={{ color }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
      <span className="text-[10px] font-medium" style={{ color }}>
        {nivelLabel}
      </span>
    </div>
  );
}

function ComponenteBadge({ nome, value }: { nome: string; value: number | null }) {
  if (value === null || value === undefined) return null;
  const pct = value * 100;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
        positive
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-700 border-red-200'
      }`}
    >
      {positive ? '+' : ''}
      {pct.toFixed(1)}% {nome}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  jornada: FrmsEffectivenessJornadaRow;
  nextJornada?: FrmsEffectivenessJornadaRow | null;
  config: ConfigLimites;
}

// ── Componente ────────────────────────────────────────────────────────

export default function FrmsJornadaEffectivenessCard({
  jornada,
  nextJornada = null,
  config,
}: Props) {
  // Estimar efetividade na chegada usando o componente de duração (quando disponível)
  // em vez de fator_basica_pct, que é apenas indicador de proporção de FDP usado.
  const effApresentacao = jornada.effectiveness_pct;
  let componenteDuracao = 0;
  let componenteProcessoS = 0;
  let componenteProcessoC = 0;
  let componenteRepouso = 0;
  let componenteHv = 0;
  if (jornada.effectiveness_componentes_json) {
    try {
      const parsed = JSON.parse(jornada.effectiveness_componentes_json) as {
        processo_s?: number;
        processo_c?: number;
        repouso?: number;
        hv?: number;
        duracao?: number;
      };
      if (typeof parsed?.processo_s === 'number' && Number.isFinite(parsed.processo_s)) {
        componenteProcessoS = parsed.processo_s;
      }
      if (typeof parsed?.processo_c === 'number' && Number.isFinite(parsed.processo_c)) {
        componenteProcessoC = parsed.processo_c;
      }
      if (typeof parsed?.repouso === 'number' && Number.isFinite(parsed.repouso)) {
        componenteRepouso = parsed.repouso;
      }
      if (typeof parsed?.hv === 'number' && Number.isFinite(parsed.hv)) {
        componenteHv = parsed.hv;
      }
      if (typeof parsed?.duracao === 'number' && Number.isFinite(parsed.duracao)) {
        componenteDuracao = parsed.duracao;
      }
    } catch {
      // fallback abaixo
    }
  }
  const duracaoImpacto = componenteDuracao * 100;
  const penalizacaoBaseDiaPts =
    Math.max(0, -componenteProcessoS * 100) +
    Math.max(0, -componenteProcessoC * 100) +
    Math.max(0, -componenteRepouso * 100) +
    Math.max(0, -componenteHv * 100);
  const penalizacaoIntrajornadaPts = Math.max(0, -duracaoImpacto);
  const semVariacaoPorDuracao = Math.abs(duracaoImpacto) < 0.05;
  const effFimJornada =
    effApresentacao != null ? Math.max(0, Math.min(100, effApresentacao + duracaoImpacto)) : null;
  const effProximaApresentacao = nextJornada?.effectiveness_pct ?? null;
  const proximaDataLabel = nextJornada?.data_apresentacao
    ? formatDate(nextJornada.data_apresentacao)
    : null;

  // Risco: usar tempo abaixo do limiar calculado no backend quando disponível.
  // Fallback para heurística legada apenas se esse campo vier nulo.
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const tempoRiscoHeuristico =
    (jornada.fator_noturno_dep_pct && jornada.fator_noturno_dep_pct !== 0 ? 30 : 0) +
    (jornada.fator_noturno_arr_pct && jornada.fator_noturno_arr_pct !== 0 ? 30 : 0) +
    (jornada.fator_repouso_pct != null && jornada.fator_repouso_pct < 0 ? 20 : 0);
  const tempoRisco =
    jornada.tempo_abaixo_limiar_min != null
      ? Math.max(0, Math.round(jornada.tempo_abaixo_limiar_min))
      : tempoRiscoHeuristico;
  const tempoRiscoLabel = tempoRisco > 0 ? `${tempoRisco} min` : '—';

  const showRisk = effFimJornada != null && effFimJornada < amarelo;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      {/* Data da jornada */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-600">
          📅 {formatDate(jornada.data_apresentacao)}
        </p>
        {showRisk && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            ⚠️ {tempoRisco > 0 ? `~${tempoRisco} min abaixo de ${amarelo}%` : 'Atenção'}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Para planejamento, o sinal mais útil é como a jornada terminou e como o tripulante tende a
        iniciar a próxima apresentação.
      </div>

      {/* Círculos de efetividade */}
      <div className="flex items-start justify-around mb-3">
        <EffCircle pct={effApresentacao} config={config} label="Início da Jornada" />
        <EffCircle pct={effFimJornada} config={config} label="Fim Estimado (Proxy)" />
        <EffCircle
          pct={effProximaApresentacao}
          config={config}
          label={proximaDataLabel ? `Próx. Apresentação ${proximaDataLabel}` : 'Próx. Apresentação'}
        />
        {/* Risco */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={`flex items-center justify-center w-16 h-16 rounded-full border-2 ${
              showRisk ? 'border-amber-400 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <span className={`text-lg ${showRisk ? 'text-amber-600' : 'text-emerald-500'}`}>
              {showRisk ? '⚠️' : '✅'}
            </span>
          </div>
          <span className="text-xs text-slate-400 text-center">Risco</span>
          <span
            className={`text-[10px] font-medium ${showRisk ? 'text-amber-600' : 'text-emerald-600'}`}
          >
            {showRisk ? tempoRiscoLabel : 'OK'}
          </span>
        </div>
      </div>

      {/* Componentes */}
      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
        <ComponenteBadge nome="Basal" value={jornada.fator_basica_pct} />
        <ComponenteBadge nome="S (Ciclo)" value={jornada.fator_ciclo_embarcado_pct} />
        <ComponenteBadge nome="C (Circ)" value={jornada.fator_apresentacao_pct} />
        <ComponenteBadge nome="Repouso" value={jornada.fator_repouso_pct} />
        <ComponenteBadge nome="HV" value={jornada.fator_hv_quantidade_pct} />
        <ComponenteBadge nome="Duração" value={componenteDuracao} />
      </div>

      {nextJornada ? (
        <p className="mt-3 text-xs text-slate-500">
          A próxima apresentação disponível no período é {proximaDataLabel}, com leitura já
          calculada para o início daquele dia.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          Sem jornada seguinte processada no período para estimar a próxima apresentação.
        </p>
      )}
    </div>
  );
}

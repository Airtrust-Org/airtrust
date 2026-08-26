import type { FrmsFrotaRow } from '@/react-app/hooks/useFrms';

interface RankingProps {
  items: FrmsFrotaRow[];
  selectedTripulanteId?: string;
  onSelectTripulante: (id: string) => void;
  limit?: number;
  title?: string;
  subtitle?: string;
}

function displayName(item: FrmsFrotaRow): string {
  return item.nome_guerra || item.nome || `ID ${item.tripulante_id}`;
}

function secondaryLabel(item: FrmsFrotaRow): string {
  return [item.funcao, item.aeronave_modelo, item.base]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ') || 'Contexto operacional';
}

export function FrmsCriticalRanking({
  items,
  selectedTripulanteId,
  onSelectTripulante,
  limit = 8,
  title = 'Prioridade da frota',
  subtitle = 'Casos ordenados automaticamente para investigação.',
}: RankingProps) {
  const visible = items.slice(0, limit);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={title}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      {visible.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          Nenhum tripulante localizado no recorte atual.
        </div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {visible.map((item, index) => {
            const selected = selectedTripulanteId === String(item.tripulante_id);
            return (
              <li key={item.tripulante_id}>
                <button
                  type="button"
                  onClick={() => onSelectTripulante(String(item.tripulante_id))}
                  aria-label={`Selecionar caso de ${displayName(item)}`}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 ${
                    selected ? 'bg-teal-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {displayName(item)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {secondaryLabel(item)}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-primary">Selecionar caso</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

interface MetricProps {
  label: string;
  value: number | string;
  helper: string;
  tone?: 'neutral' | 'danger' | 'warning' | 'info';
}

function Metric({ label, value, helper, tone = 'neutral' }: MetricProps) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50'
          : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

interface Props {
  loading: boolean;
  total: number;
  critical: number;
  attention: number;
  degraded: number;
  incomplete: number;
  totalSetores: number | null;
  totalPousos: number | null;
  avgEffectivenessPct: number | null;
  ranking: FrmsFrotaRow[];
  selectedTripulanteId?: string;
  onSelectTripulante: (id: string) => void;
}

export default function FrmsFleetOverview({
  loading,
  total,
  critical,
  attention,
  degraded,
  incomplete,
  totalSetores,
  totalPousos,
  avgEffectivenessPct,
  ranking,
  selectedTripulanteId,
  onSelectTripulante,
}: Props) {
  const formatOptionalNumber = (value: number | null): string =>
    value == null || !Number.isFinite(value) ? '—' : String(value);
  const formatOptionalPct = (value: number | null): string =>
    value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumo de monitoramento FRMS">
        <Metric
          label="Monitorados"
          value={loading && total === 0 ? '…' : total}
          helper="Tripulantes no recorte"
          tone="info"
        />
        <Metric
          label="Críticos / violações"
          value={critical}
          helper="Exigem decisão prioritária"
          tone={critical > 0 ? 'danger' : 'neutral'}
        />
        <Metric
          label="Atenção"
          value={attention}
          helper="Acompanhar e mitigar"
          tone={attention > 0 ? 'warning' : 'neutral'}
        />
        <Metric
          label="Efetividade degradada"
          value={degraded}
          helper="Degradada ou severa"
          tone={degraded > 0 ? 'warning' : 'neutral'}
        />
        <Metric
          label="Dados a confirmar"
          value={incomplete}
          helper="Ausência nunca vira normalidade"
          tone={incomplete > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <FrmsCriticalRanking
          items={ranking}
          selectedTripulanteId={selectedTripulanteId}
          onSelectTripulante={onSelectTripulante}
          limit={8}
          title="Casos para monitoramento"
          subtitle="Selecione um caso; a investigação aprofundada fica em Análise & Evidências."
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Operação no recorte</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Síntese de monitoramento; decisão imediata fica em Operação agora.
            </p>
          </div>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Setores</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatOptionalNumber(totalSetores)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Pousos</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatOptionalNumber(totalPousos)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Efetividade média</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatOptionalPct(avgEffectivenessPct)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Qualidade das fontes</dt>
              <dd className={`font-semibold ${incomplete > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {incomplete > 0 ? `${incomplete} a confirmar` : 'Sem pendência visível'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Dado ausente permanece indisponível. A interface não converte ausência em zero ou “Normal”.
          </p>
        </div>
      </section>
    </>
  );
}

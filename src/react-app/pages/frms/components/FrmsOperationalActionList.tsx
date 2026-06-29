import { CheckCircle2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  FortnightAttentionItem,
  FortnightOperationalSummaryView,
  FrmsActionGroup,
} from '../fortnightOperationalSummary';
import { formatFortnightMinutes } from '../fortnightOperationalLabels';

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

const GROUP_CONFIG: Record<
  FrmsActionGroup,
  { label: string; toneClass: string; order: number }
> = {
  critical: {
    label: 'Críticos',
    toneClass: 'text-red-700 bg-red-50 border-red-100',
    order: 0,
  },
  attention: {
    label: 'Atenção',
    toneClass: 'text-amber-700 bg-amber-50 border-amber-100',
    order: 1,
  },
  checkin: {
    label: 'Check-in pendente',
    toneClass: 'text-yellow-800 bg-yellow-50 border-yellow-200',
    order: 2,
  },
  source: {
    label: 'Fonte insuficiente / inconsistente',
    toneClass: 'text-slate-700 bg-slate-100 border-slate-200',
    order: 3,
  },
  observation: {
    label: 'Observação',
    toneClass: 'text-slate-600 bg-slate-50 border-slate-100',
    order: 4,
  },
};

function GroupHeader({
  label,
  count,
  toneClass,
}: {
  label: string;
  count: number;
  toneClass: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide ${toneClass}`}
    >
      <span>{label}</span>
      <span className="rounded-full px-2 py-0.5 text-[10px] bg-current/10">{count}</span>
    </div>
  );
}

function ActionCard({
  item,
  onSelectCrew,
}: {
  item: FortnightAttentionItem;
  onSelectCrew?: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{item.displayName}</span>
            <span className="text-xs text-slate-500">{item.secondaryLabel}</span>
          </div>
          <p className="text-xs text-slate-700">
            <span className="font-medium text-slate-800">Motivo:</span> {item.primaryReason}
          </p>
          <p className="text-xs text-slate-700">
            <span className="font-medium text-slate-800">Fonte:</span> {item.dataSourceLabel}
          </p>
          <p className="text-xs text-slate-700">
            <span className="font-medium text-slate-800">Ação:</span> {item.recommendedAction}
          </p>
          {(item.dutyTimeMin != null || item.effectivenessPct != null) && (
            <p className="text-[11px] text-slate-500">
              {item.dutyTimeMin != null
                ? `Acumulado quinzena ${formatFortnightMinutes(item.dutyTimeMin)}`
                : 'Acumulado quinzena indisponível'}
              {item.effectivenessPct != null
                ? ` · Efetividade estimada ${formatPct(item.effectivenessPct)}`
                : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {onSelectCrew && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => onSelectCrew(item.funcionarioId)}
          >
            Ver jornada
          </button>
        )}
        <Link
          to={item.tripulantePath}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Evidência / ficha
        </Link>
      </div>
    </div>
  );
}

interface Props {
  summary: FortnightOperationalSummaryView;
  loading: boolean;
  onSelectCrew?: (id: number) => void;
  maxItems?: number;
}

export default function FrmsOperationalActionList({
  summary,
  loading,
  onSelectCrew,
  maxItems,
}: Props) {
  const grouped = (Object.keys(GROUP_CONFIG) as FrmsActionGroup[])
    .sort((a, b) => GROUP_CONFIG[a].order - GROUP_CONFIG[b].order)
    .map((key) => ({
      key,
      config: GROUP_CONFIG[key],
      items: summary.attentionItems.filter((item) => item.actionGroup === key),
    }))
    .filter((group) => group.items.length > 0);

  const totalItems = grouped.reduce((acc, g) => acc + g.items.length, 0);
  let remaining = maxItems ?? Infinity;

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Montando lista de ação operacional...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Quem exige atenção agora</h2>
        <p className="text-xs text-slate-500">
          Prioridade: crítico → atenção → check-in → fonte → observação. Leitura humana obrigatória
          antes de qualquer decisão operacional.
        </p>
      </div>

      {totalItems === 0 ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-800">
            Nenhum tripulante com ação imediata identificada.
          </p>
          <p className="text-xs text-slate-500">
            {summary.monitoredCount} tripulantes no recorte — confira fontes incompletas no mapa
            detalhado se necessário.
          </p>
        </div>
      ) : (
        grouped.map(({ key, config, items }) => {
          const visible =
            remaining === Infinity ? items : items.slice(0, Math.max(0, remaining));
          remaining -= visible.length;
          if (visible.length === 0) return null;
          return (
            <div key={key}>
              <GroupHeader label={config.label} count={items.length} toneClass={config.toneClass} />
              {visible.map((item) => (
                <ActionCard key={item.funcionarioId} item={item} onSelectCrew={onSelectCrew} />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

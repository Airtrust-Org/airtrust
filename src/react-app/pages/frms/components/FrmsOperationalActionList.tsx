import { CheckCircle2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  FortnightAttentionItem,
  FortnightOperationalSummaryView,
} from '../fortnightOperationalSummary';
import { formatFortnightMinutes } from '../fortnightOperationalLabels';

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

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
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{item.displayName}</span>
            <span className="text-xs text-slate-500">{item.secondaryLabel}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-700">
            <span className="font-medium">Motivo:</span> {item.primaryReason}
          </p>
          <p className="text-xs text-slate-600">
            <span className="font-medium">Ação:</span> {item.recommendedAction}
          </p>
          {(item.dutyTimeMin != null || item.effectivenessPct != null) && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              {item.dutyTimeMin != null
                ? `Jornada acumulada ${formatFortnightMinutes(item.dutyTimeMin)}`
                : ''}
              {item.dutyTimeMin != null && item.effectivenessPct != null ? ' · ' : ''}
              {item.effectivenessPct != null
                ? `Efetividade estimada ${formatPct(item.effectivenessPct)}`
                : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {onSelectCrew && (
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => onSelectCrew(item.funcionarioId)}
          >
            Ver acumulado
          </button>
        )}
        <Link
          to={item.tripulantePath}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abrir ficha
        </Link>
      </div>
    </div>
  );
}

const KNOWN_LABELS = new Set(['Critico', 'Em atencao', 'Dados incompletos']);

interface Props {
  summary: FortnightOperationalSummaryView;
  loading: boolean;
  onSelectCrew?: (id: number) => void;
}

export default function FrmsOperationalActionList({ summary, loading, onSelectCrew }: Props) {
  const critical = summary.attentionItems.filter((item) => item.statusLabel === 'Critico');
  const attention = summary.attentionItems.filter((item) => item.statusLabel === 'Em atencao');
  const incomplete = summary.attentionItems.filter(
    (item) => item.statusLabel === 'Dados incompletos',
  );
  // Captura qualquer statusLabel não mapeado para evitar que itens acionáveis desapareçam
  const observed = summary.attentionItems.filter((item) => !KNOWN_LABELS.has(item.statusLabel));

  const hasAnyGroup =
    critical.length > 0 || attention.length > 0 || incomplete.length > 0 || observed.length > 0;

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Calculando lista de ação operacional...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Lista de ação operacional</h2>
        <p className="text-xs text-slate-500">
          Priorizado: crítico → atenção → dados insuficientes. Avaliação humana obrigatória antes de
          qualquer decisão.
        </p>
      </div>

      {!hasAnyGroup ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-800">
            Nenhum tripulante em atenção ou com dados insuficientes.
          </p>
          <p className="text-xs text-slate-500">
            {summary.monitoredCount} tripulantes monitorados no período sem ação imediata
            identificada.
          </p>
        </div>
      ) : (
        <>
          {critical.length > 0 && (
            <div>
              <GroupHeader
                label="Crítico"
                count={critical.length}
                toneClass="text-red-700 bg-red-50 border-red-100"
              />
              {critical.map((item) => (
                <ActionCard key={item.funcionarioId} item={item} onSelectCrew={onSelectCrew} />
              ))}
            </div>
          )}
          {attention.length > 0 && (
            <div>
              <GroupHeader
                label="Atenção"
                count={attention.length}
                toneClass="text-amber-700 bg-amber-50 border-amber-100"
              />
              {attention.map((item) => (
                <ActionCard key={item.funcionarioId} item={item} onSelectCrew={onSelectCrew} />
              ))}
            </div>
          )}
          {incomplete.length > 0 && (
            <div>
              <GroupHeader
                label="Dados insuficientes"
                count={incomplete.length}
                toneClass="text-slate-600 bg-slate-50 border-slate-200"
              />
              {incomplete.map((item) => (
                <ActionCard key={item.funcionarioId} item={item} onSelectCrew={onSelectCrew} />
              ))}
            </div>
          )}
          {observed.length > 0 && (
            <div>
              <GroupHeader
                label="Em observação"
                count={observed.length}
                toneClass="text-slate-500 bg-slate-50 border-slate-100"
              />
              {observed.map((item) => (
                <ActionCard key={item.funcionarioId} item={item} onSelectCrew={onSelectCrew} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

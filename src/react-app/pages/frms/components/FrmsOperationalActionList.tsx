import { CheckCircle2, UserRound, ShieldAlert, AlertTriangle, HelpCircle, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  FortnightAttentionItem,
  FortnightOperationalSummaryView,
  FrmsActionGroup,
} from '../fortnightOperationalSummary';
import {
  formatFortnightMinutesCompact,
  operationalSourceChipLabel,
  toneByOperationalSourceChip,
} from '../fortnightOperationalLabels';

const SECTION_CONFIG: Array<{
  key: FrmsActionGroup | 'action_now';
  groups: FrmsActionGroup[];
  label: string;
  toneClass: string;
  order: number;
}> = [
  {
    key: 'action_now',
    groups: ['critical', 'attention'],
    label: 'Exigem ação agora',
    toneClass: 'text-red-800 bg-red-50 border-red-100',
    order: 0,
  },
  {
    key: 'checkin',
    groups: ['checkin'],
    label: 'Check-ins pendentes',
    toneClass: 'text-yellow-900 bg-yellow-50 border-yellow-200',
    order: 1,
  },
  {
    key: 'source',
    groups: ['source'],
    label: 'Fonte insuficiente / incompleta',
    toneClass: 'text-slate-800 bg-slate-100 border-slate-200',
    order: 2,
  },
  {
    key: 'observation',
    groups: ['observation'],
    label: 'Em observação',
    toneClass: 'text-slate-600 bg-slate-50 border-slate-100',
    order: 3,
  },
];

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
      <span className="rounded-full bg-current/10 px-2 py-0.5 text-xs">{count}</span>
    </div>
  );
}

function SourceChip({ chip }: { chip: FortnightAttentionItem['sourceChip'] }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${toneByOperationalSourceChip(chip)}`}
    >
      {operationalSourceChipLabel(chip)}
    </span>
  );
}

function SeverityIcon({ actionGroup }: { actionGroup: FrmsActionGroup }) {
  if (actionGroup === 'critical') return <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Crítico" />;
  if (actionGroup === 'attention') return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Atenção" />;
  if (actionGroup === 'checkin') return <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" aria-label="Check-in pendente" />;
  if (actionGroup === 'source') return <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-label="Fonte incompleta" />;
  return <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Em observação" />;
}

function ActionCard({
  item,
  onSelectCrew,
}: {
  item: FortnightAttentionItem;
  onSelectCrew?: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 lg:flex-row lg:items-start lg:justify-between hover:bg-slate-50/50 cursor-pointer">
      <div className="flex min-w-0 items-start gap-3">
        <SeverityIcon actionGroup={item.actionGroup} />
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{item.displayName}</span>
            <span className="text-xs text-slate-500">{item.secondaryLabel}</span>
            <SourceChip chip={item.sourceChip} />
          </div>
          <p className="text-sm text-slate-800">{item.primaryReason}</p>
          <p className="text-xs text-slate-600">
            <span className="font-medium text-slate-700">Ação:</span> {item.recommendedAction}
          </p>
          {(item.dutyTimeMin != null || item.trendLabel !== 'Indeterminada') && (
            <p className="text-xs text-slate-500">
              {item.dutyTimeMin != null
                ? `Acumulado quinzena ${formatFortnightMinutesCompact(item.dutyTimeMin)}`
                : 'Acumulado quinzena indisponível'}
              {item.trendLabel !== 'Indeterminada' ? ` · Tendência ${item.trendLabel.toLowerCase()}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {onSelectCrew ? (
          <button
            type="button"
            aria-label={`Ver detalhe de ${item.displayName}`}
            className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            onClick={() => onSelectCrew(item.funcionarioId)}
          >
            Ver detalhe
          </button>
        ) : (
          <Link
            to={item.controlPath}
            aria-label={`Ver detalhe de ${item.displayName}`}
            className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Ver detalhe
          </Link>
        )}
        <Link
          to={item.tripulantePath}
          aria-label={`Evidência de ${item.displayName}`}
          className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Evidência
        </Link>
      </div>
    </div>
  );
}

interface Props {
  summary: FortnightOperationalSummaryView;
  loading: boolean;
  onSelectCrew?: (id: number) => void;
  /** Limite por seção (padrão 10) */
  maxItemsPerGroup?: number;
  /** @deprecated use maxItemsPerGroup */
  maxItems?: number;
  hideHeader?: boolean;
}

export default function FrmsOperationalActionList({
  summary,
  loading,
  onSelectCrew,
  maxItemsPerGroup = 10,
  maxItems,
  hideHeader = false,
}: Props) {
  const perGroupLimit = maxItems ?? maxItemsPerGroup;

  const sections = SECTION_CONFIG.map((section) => ({
    ...section,
    items: summary.attentionItems.filter((item) => section.groups.includes(item.actionGroup)),
  })).filter((section) => section.items.length > 0);

  const totalItems = sections.reduce((acc, section) => acc + section.items.length, 0);
  const actionNowCount = summary.attentionItems.filter(
    (item) => item.actionGroup === 'critical' || item.actionGroup === 'attention',
  ).length;

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500" role="status" aria-label="Carregando lista operacional">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
        Montando lista de ação operacional...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {!hideHeader && (
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Quem exige atenção agora</h2>
          <p className="text-xs text-slate-500">
            {actionNowCount > 0
              ? `${actionNowCount} tripulante(s) com ação imediata · check-ins e fontes listados abaixo`
              : 'Nenhuma ação crítica imediata — confira check-ins e fontes abaixo'}
          </p>
        </div>
      )}

      {totalItems === 0 ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-800">
            Nenhum tripulante com ação imediata identificada.
          </p>
          <p className="text-xs text-slate-500">
            {summary.monitoredCount} tripulantes no recorte — ausência de sinal não elimina validação
            manual da escala.
          </p>
        </div>
      ) : (
        sections.map((section) => {
          const visible = section.items.slice(0, perGroupLimit);
          const hidden = section.items.length - visible.length;
          return (
            <div key={section.key}>
              <GroupHeader
                label={section.label}
                count={section.items.length}
                toneClass={section.toneClass}
              />
              {visible.map((item) => (
                <ActionCard key={`${section.key}-${item.funcionarioId}`} item={item} onSelectCrew={onSelectCrew} />
              ))}
              {hidden > 0 && (
                <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 last:border-0">
                  +{hidden} oculto(s) nesta seção — refine filtros ou abra o controle operacional completo.
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

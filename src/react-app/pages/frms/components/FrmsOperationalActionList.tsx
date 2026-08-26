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
  key: 'dispatch_block' | 'decision' | 'source' | 'monitor';
  groups: FrmsActionGroup[];
  label: string;
  description: string;
  toneClass: string;
  order: number;
}> = [
  {
    key: 'dispatch_block',
    groups: ['critical'],
    label: 'Bloqueia despacho',
    description: 'Casos críticos que exigem decisão antes da liberação operacional.',
    toneClass: 'text-red-900 bg-red-50 border-red-200',
    order: 0,
  },
  {
    key: 'decision',
    groups: ['attention', 'checkin'],
    label: 'Exige decisão / mitigação',
    description: 'Atenções e check-ins pendentes que exigem revisão humana.',
    toneClass: 'text-amber-900 bg-amber-50 border-amber-200',
    order: 1,
  },
  {
    key: 'source',
    groups: ['source'],
    label: 'Confirmar dados',
    description: 'Fonte ausente, estimada, inconsistente ou incompleta; não tratar como normalidade.',
    toneClass: 'text-sky-900 bg-sky-50 border-sky-200',
    order: 2,
  },
  {
    key: 'monitor',
    groups: ['observation'],
    label: 'Monitorar',
    description: 'Sinais sem ação imediata, mantidos para acompanhamento.',
    toneClass: 'text-slate-700 bg-slate-50 border-slate-200',
    order: 3,
  },
];

function GroupHeader({
  label,
  description,
  count,
  toneClass,
}: {
  label: string;
  description: string;
  count: number;
  toneClass: string;
}) {
  return (
    <div className={`border-b px-4 py-2.5 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span>{label}</span>
        <span className="rounded-full bg-current/10 px-2 py-0.5 text-xs">{count}</span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium normal-case tracking-normal opacity-80">
        {description}
      </p>
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
  if (actionGroup === 'critical') {
    return <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Crítico" />;
  }
  if (actionGroup === 'attention') {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Atenção" />;
  }
  if (actionGroup === 'checkin') {
    return <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" aria-label="Check-in pendente" />;
  }
  if (actionGroup === 'source') {
    return <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-label="Fonte a confirmar" />;
  }
  return <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Monitorar" />;
}

function ActionCard({
  item,
  onSelectCrew,
}: {
  item: FortnightAttentionItem;
  onSelectCrew?: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 lg:flex-row lg:items-start lg:justify-between hover:bg-slate-50/50">
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
            <span className="font-medium text-slate-700">Ação recomendada:</span>{' '}
            {item.recommendedAction}
          </p>
          {(item.dutyTimeMin != null || item.trendLabel !== 'Indeterminada') && (
            <p className="text-xs text-slate-500">
              {item.dutyTimeMin != null
                ? `Acumulado quinzena ${formatFortnightMinutesCompact(item.dutyTimeMin)}`
                : 'Acumulado quinzena indisponível'}
              {item.trendLabel !== 'Indeterminada'
                ? ` · Tendência ${item.trendLabel.toLowerCase()}`
                : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {onSelectCrew ? (
          <button
            type="button"
            aria-label={`Abrir caso de ${item.displayName}`}
            className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            onClick={() => onSelectCrew(item.funcionarioId)}
          >
            Abrir caso
          </button>
        ) : (
          <Link
            to={item.controlPath}
            aria-label={`Abrir caso de ${item.displayName}`}
            className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Abrir caso
          </Link>
        )}
        <Link
          to={item.tripulantePath}
          aria-label={`Abrir evidência completa de ${item.displayName}`}
          className="inline-flex h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Evidência completa
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
  const blockingCount = summary.attentionItems.filter((item) => item.actionGroup === 'critical').length;
  const decisionCount = summary.attentionItems.filter(
    (item) => item.actionGroup === 'attention' || item.actionGroup === 'checkin',
  ).length;
  const confirmationCount = summary.attentionItems.filter(
    (item) => item.actionGroup === 'source',
  ).length;

  if (loading) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
        role="status"
        aria-label="Carregando lista operacional"
      >
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
        Montando fila operacional...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {!hideHeader && (
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Fila operacional priorizada</h2>
          <p className="text-xs text-slate-500">
            {blockingCount} bloqueio(s) · {decisionCount} decisão(ões) · {confirmationCount}{' '}
            confirmação(ões) de dados
          </p>
        </div>
      )}

      {totalItems === 0 ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-800">
            Nenhuma pendência operacional identificada no recorte.
          </p>
          <p className="text-xs text-slate-500">
            {summary.monitoredCount} tripulantes monitorados. Ausência de sinal não elimina validação
            manual da escala.
          </p>
        </div>
      ) : (
        sections.map((section) => {
          const visible = section.items.slice(0, perGroupLimit);
          const hidden = section.items.length - visible.length;
          const collapsedByDefault = section.key === 'monitor';

          const body = (
            <>
              {visible.map((item) => (
                <ActionCard
                  key={`${section.key}-${item.funcionarioId}`}
                  item={item}
                  onSelectCrew={onSelectCrew}
                />
              ))}
              {hidden > 0 && (
                <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 last:border-0">
                  +{hidden} oculto(s) nesta seção — refine filtros ou use Análise & Evidências.
                </p>
              )}
            </>
          );

          if (collapsedByDefault) {
            return (
              <details key={section.key} className="group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <GroupHeader
                    label={section.label}
                    description={section.description}
                    count={section.items.length}
                    toneClass={section.toneClass}
                  />
                </summary>
                {body}
              </details>
            );
          }

          return (
            <div key={section.key}>
              <GroupHeader
                label={section.label}
                description={section.description}
                count={section.items.length}
                toneClass={section.toneClass}
              />
              {body}
            </div>
          );
        })
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Bell,
  HelpCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { FrmsOperationalSnapshotItem } from '../../../hooks/useFrmsOperationalSnapshot';
import { Link } from 'react-router-dom';

interface Props {
  items: FrmsOperationalSnapshotItem[];
  loading: boolean;
  onSelectCrew?: (id: number) => void;
}

const SEVERITY_ORDER = {
  CRITICO_VIOLACAO: 0,
  MITIGACAO_NECESSARIA: 1,
  ATENCAO: 2,
  NAO_AVALIADO: 3,
  NORMAL: 4,
};

function SeverityIcon({ estado }: { estado: string }) {
  switch (estado) {
    case 'CRITICO_VIOLACAO':
      return <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" aria-label="Crítico / Violação" />;
    case 'MITIGACAO_NECESSARIA':
      return <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" aria-label="Mitigação Necessária" />;
    case 'ATENCAO':
      return <Bell className="h-5 w-5 shrink-0 text-amber-600" aria-label="Atenção" />;
    case 'NAO_AVALIADO':
      return <HelpCircle className="h-5 w-5 shrink-0 text-slate-500" aria-label="Não Avaliado" />;
    case 'NORMAL':
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Normal" />;
    default:
      return <HelpCircle className="h-5 w-5 shrink-0 text-slate-400" />;
  }
}

function getBadgeStyle(estado: string): string {
  switch (estado) {
    case 'CRITICO_VIOLACAO':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'MITIGACAO_NECESSARIA':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'ATENCAO':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'NAO_AVALIADO':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'NORMAL':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
}

function formatEstadoLabel(estado: string): string {
  switch (estado) {
    case 'CRITICO_VIOLACAO':
      return 'CRÍTICO / VIOLAÇÃO';
    case 'MITIGACAO_NECESSARIA':
      return 'MITIGAÇÃO NECESSÁRIA';
    case 'ATENCAO':
      return 'ATENÇÃO';
    case 'NAO_AVALIADO':
      return 'NÃO AVALIADO';
    case 'NORMAL':
      return 'NORMAL';
    default:
      return estado;
  }
}

function QueueCard({
  item,
  onSelectCrew,
}: {
  item: FrmsOperationalSnapshotItem;
  onSelectCrew?: (id: number) => void;
}) {
  const proximaMissao = item.escalado && item.hora_apresentacao
    ? `Apresentação ${item.hora_apresentacao}${item.aeronave ? ` (${item.aeronave})` : ''}`
    : 'Sem missão iminente';

  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 last:border-0 lg:flex-row lg:items-start lg:justify-between hover:bg-slate-50/50 transition-colors">
      <div className="flex min-w-0 items-start gap-3">
        <SeverityIcon estado={item.estado_operacional} />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900">{item.nome || item.nome_guerra || `ID: ${item.funcionario_id}`}</span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${getBadgeStyle(item.estado_operacional)}`}>
              {formatEstadoLabel(item.estado_operacional)}
            </span>
          </div>

          {item.motivos_principais?.length > 0 && (
            <ul className="list-disc pl-4 text-sm font-medium text-slate-700">
              {item.motivos_principais.map((motivo, idx) => (
                <li key={idx}>{motivo}</li>
              ))}
            </ul>
          )}

          <div className="text-xs space-y-1">
            <p className="text-slate-600">
              <span className="font-semibold text-slate-800">Próxima missão:</span> {proximaMissao}
            </p>
            <p className="text-slate-600">
              <span className="font-semibold text-slate-800">Ação recomendada:</span> {item.acao_recomendada_texto}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col sm:flex-row items-center gap-2 pt-2 lg:pt-0">
        {onSelectCrew ? (
          <button
            type="button"
            aria-label={`Ver detalhes operacionais de ${item.nome}`}
            className="w-full sm:w-auto inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
            onClick={() => onSelectCrew(item.funcionario_id)}
          >
            Abrir Detalhes
          </button>
        ) : (
          <Link
            to={`/frms/controle-operacional?funcionario_id=${item.funcionario_id}`}
            aria-label={`Ver detalhes operacionais de ${item.nome}`}
            className="w-full sm:w-auto inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-primary bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
          >
            Abrir Detalhes
          </Link>
        )}
      </div>
    </div>
  );
}

export function FrmsCoordQueuePanel({ items, loading, onSelectCrew }: Props) {
  const hasActionableItems = items.some((i) => i.estado_operacional !== 'NORMAL');
  const [expanded, setExpanded] = useState(hasActionableItems);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
        Sincronizando fila da coordenação...
      </div>
    );
  }

  const sortedItems = [...items].sort((a, b) => {
    const orderA = SEVERITY_ORDER[a.estado_operacional] ?? 99;
    const orderB = SEVERITY_ORDER[b.estado_operacional] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const nomeA = a.nome || '';
    const nomeB = b.nome || '';
    return nomeA.localeCompare(nomeB);
  });

  const criticalCount = sortedItems.filter((i) =>
    i.estado_operacional === 'CRITICO_VIOLACAO' ||
    i.estado_operacional === 'MITIGACAO_NECESSARIA'
  ).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        className="w-full flex items-center justify-between bg-slate-50 border-b border-slate-200 px-5 py-4 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <ShieldAlert className={`h-5 w-5 ${criticalCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          <div className="text-left">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Atenção da Coordenação
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {criticalCount > 0
                ? `${criticalCount} tripulante(s) requerem avaliação iminente.`
                : 'Nenhum tripulante em estado crítico ou de mitigação no momento.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {sortedItems.length}
          </span>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col">
          {sortedItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Nenhuma jornada operacional localizada no recorte atual.
            </div>
          ) : (
            sortedItems.map((item) => (
              <QueueCard
                key={`${item.funcionario_id}-${item.data_operacional}`}
                item={item}
                onSelectCrew={onSelectCrew}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

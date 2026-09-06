// FIX: [BUG 2] - Day events now use solid DB-driven colors with contrast-safe labels.
// FIX: [BUG 4] - Avulso cells now render and tooltip as Avulso/Sem aeronave, not Voo Operacional.

import React from 'react';
import { isSameMonth, isToday as isTodayDate } from 'date-fns';
import { cn } from '@/react-app/lib/utils';
import type { EscalaEvento } from '../../hooks/queries/useEscalasQuery';
import { CELL, EVENT_TOKENS } from '../../constants/escalaTokens';
import { TIPO_TO_CODIGO_MAP } from '../../constants/tiposEvento';
import { EscalaDayCell } from '../EscalaDayCell';
import type { DayEvent } from '../../utils/buildDayCellState';
import { useTiposEventoResolvidos } from '../../hooks/useTiposEventoResolvidos';

interface DayCellProps {
  date: Date;
  mesReferencia: number;
  anoReferencia: number;
  ativo?: boolean;
  corAtivo?: string;
  isAvulsa?: boolean;
  eventos: EscalaEvento[];
  placeholderOnly?: boolean;
  placeholderType?: DayEvent['type'];
  placeholderLabel?: string;
  placeholderExtra?: string;
  gapDoSlot?: boolean | null;
  onClick?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isBoundary?: boolean;
}

function isEventoOperacionalGenerico(tipo: string): boolean {
  return ['VOO', 'VIAGEM', 'TRABALHO', ''].includes(tipo);
}

/** Resolve any tipo_evento value (internal name or DB code) to uppercase DB code. */
function resolveToCode(tipoEvento: string | null | undefined): string {
  if (!tipoEvento) return '';
  const upper = tipoEvento.trim().toUpperCase();
  // Already an uppercase DB code? (e.g. 'VOO', 'FOL', 'SIM')
  if (Object.prototype.hasOwnProperty.call(TIPO_CODIGO_REVERSE, upper)) return upper;
  // Internal name like 'voo', 'folga', 'treinamento_simulador'
  const code = TIPO_TO_CODIGO_MAP[tipoEvento.trim().toLowerCase() as keyof typeof TIPO_TO_CODIGO_MAP];
  return code ?? upper;
}

const TIPO_CODIGO_REVERSE: Record<string, true> = Object.fromEntries(
  Object.values(TIPO_TO_CODIGO_MAP).map((code) => [code, true]),
) as Record<string, true>;

function resolveTipoEventoConfigKey(tipoEvento: string | null | undefined): string {
  return resolveToCode(tipoEvento);
}

function getEventoNomeCanonico(tipo: string): string | null {
  switch (tipo) {
    case 'TREINAMENTO_SIMULADOR':
      return 'Treinamento Simulador';
    case 'TREINAMENTO_SOLO':
      return 'Treinamento Solo';
    case 'MEDICO':
      return 'Exame Medico';
    case 'CHEQUE':
      return 'Cheque';
    case 'STANDBY':
      return 'Standby';
    case 'FERIAS':
      return 'Ferias';
    case 'LICENCA':
      return 'Licenca';
    case 'FOLGA':
      return 'Folga';
    case 'VOO':
      return 'Voo Operacional';
    case 'VIAGEM':
      return 'Viagem';
    case 'TRABALHO':
      return 'Trabalho Administrativo';
    case 'REAQUISI':
      return 'Reaquisicao';
    default:
      return null;
  }
}

function mapEventoType(evento: EscalaEvento, isAvulsa?: boolean): DayEvent['type'] {
  const code = resolveToCode(evento.tipo_evento);

  if (code === 'FOL') return 'FOLGA';
  if (code === 'FER') return 'FERIAS';
  if (code === 'LIC') return 'LICENCA';
  if (code === 'MED') return 'EXAME_MEDICO';
  if (code === 'CHK') return 'CHEQUE';
  if (code === 'SIM') return 'SIMULADOR';
  if (code === 'TSO') return 'CURSO';
  if (code === 'SMH') return 'STANDBY';
  if (isAvulsa && (code === 'VOO' || isEventoOperacionalGenerico(code))) return 'AVULSA';

  return 'ALOCACAO';
}

function getPlaceholderCode(placeholderType?: DayEvent['type']): string {
  switch (placeholderType) {
    case 'DISPONIVEL':
      return '';
    case 'FOLGA':
      return 'FOL';
    case 'FERIAS':
      return 'FER';
    case 'LICENCA':
      return 'LIC';
    case 'SIMULADOR':
      return 'SIM';
    case 'CURSO':
      return 'TSO';
    case 'EXAME_MEDICO':
      return 'MED';
    case 'CHEQUE':
      return 'CHK';
    case 'STANDBY':
      return 'SMH';
    case 'ALOCACAO':
    case 'ALOCACAO_Q2':
      return 'VOO';
    default:
      return '';
  }
}

function mapEventoLabel(
  evento: EscalaEvento,
  isAvulsa: boolean | undefined,
  configMap: ReturnType<typeof useTiposEventoResolvidos>['configMap'],
): string {
  const tipo = (evento.tipo_evento || '').toUpperCase();
  const configKey = resolveTipoEventoConfigKey(evento.tipo_evento);
  const conf = configKey ? configMap[configKey] : undefined;
  void tipo;

  if (isAvulsa && isEventoOperacionalGenerico(tipo)) return 'Avulso';
  if (conf?.label) return conf.label;

  const nomeCanonico = getEventoNomeCanonico(tipo);
  if (nomeCanonico) return nomeCanonico;

  return 'Voo';
}

function getEventPresentation(
  evento: EscalaEvento,
  isAvulsa: boolean | undefined,
  configMap: ReturnType<typeof useTiposEventoResolvidos>['configMap'],
): Pick<DayEvent, 'type' | 'label' | 'badgeLabel' | 'extra' | 'backgroundColor' | 'textColor'> {
  const configKey = resolveTipoEventoConfigKey(evento.tipo_evento);
  const conf = configKey ? configMap[configKey] : undefined;
  const type = mapEventoType(evento, isAvulsa);

  if (type === 'AVULSA') {
    const avulsoColor = '#F59E0B';
    return {
      type,
      label: 'Avulso',
      badgeLabel: 'A',
      extra: evento.local || evento.observacoes || 'Sem aeronave',
      backgroundColor: avulsoColor,
      textColor: '#FFFFFF',
    };
  }

  const backgroundColor = conf?.cor;
  return {
    type,
    label: mapEventoLabel(evento, isAvulsa, configMap),
    badgeLabel: conf?.sigla || undefined,
    extra: evento.aeronave || evento.local || evento.observacoes || undefined,
    backgroundColor,
    textColor: '#FFFFFF',
  };
}

function buildDayEvents(
  eventos: EscalaEvento[],
  ativo?: boolean,
  isAvulsa?: boolean,
  placeholderOnly?: boolean,
  placeholderType?: DayEvent['type'],
  placeholderLabel?: string,
  placeholderExtra?: string,
  corAtivo?: string,
  configMap?: ReturnType<typeof useTiposEventoResolvidos>['configMap'],
): DayEvent[] {
  const mapped = eventos.map((evento) => ({
    ...getEventPresentation(evento, isAvulsa, configMap || ({} as never)),
    autoGerado: evento.auto_gerado ?? evento.gerado_automaticamente === 1,
  }));

  if (mapped.length === 0 && ativo && !placeholderOnly) {
    const placeholderCode = getPlaceholderCode(placeholderType);
    const placeholderConf = placeholderCode ? configMap?.[placeholderCode] : undefined;
    const isAlocacaoSlot =
      !placeholderType || placeholderType === 'ALOCACAO' || placeholderType === 'ALOCACAO_Q2';
    const isFolgaSlot = placeholderType === 'FOLGA';
    const isDisponivelSlot = placeholderType === 'DISPONIVEL';
    const placeholderColor = isAvulsa
      ? '#F59E0B'
      : placeholderConf?.cor
        ? placeholderConf.cor
        : isFolgaSlot
          ? (configMap?.['FOL']?.cor ?? corAtivo ?? '#E2E8F0')
          : isDisponivelSlot
            ? (corAtivo ?? '#10B981')
          : isAlocacaoSlot
            ? (configMap?.['VOO']?.cor ?? '#3B82F6')
            : (corAtivo ?? '#6b7280');
    const placeholderBadge = placeholderConf?.sigla
      ? placeholderConf.sigla
      : isFolgaSlot
        ? configMap?.['FOL']?.sigla || 'FO'
        : isDisponivelSlot
          ? 'DIS'
          : placeholderLabel || (isAvulsa ? 'A' : configMap?.['VOO']?.sigla || 'V');
    mapped.push({
      type: placeholderType || (isAvulsa ? 'AVULSA' : 'ALOCACAO'),
      label: placeholderConf?.label
        ? placeholderConf.label
        : isFolgaSlot
          ? configMap?.['FOL']?.label || 'Folga'
          : isDisponivelSlot
            ? placeholderLabel || 'Disponível'
            : placeholderLabel || (isAvulsa ? 'Avulso' : 'Voo'),
      badgeLabel: placeholderBadge,
      extra: placeholderExtra || (isAvulsa ? 'Sem aeronave' : undefined),
      backgroundColor: placeholderColor,
      textColor: '#FFFFFF',
      autoGerado: false,
    });
  }

  if (mapped.length === 0 && placeholderOnly && placeholderType === 'FOLGA') {
    const folgaColor = configMap?.['FOL']?.cor ?? corAtivo ?? '#E2E8F0';
    mapped.push({
      type: 'FOLGA',
      label: configMap?.['FOL']?.label || 'Folga',
      badgeLabel: configMap?.['FOL']?.sigla || 'FO',
      backgroundColor: folgaColor,
      textColor: '#FFFFFF',
      autoGerado: false,
    });
  }

  return mapped;
}

export const DayCell = React.memo(function DayCell({
  date,
  mesReferencia,
  anoReferencia,
  ativo = false,
  corAtivo,
  isAvulsa = false,
  eventos,
  placeholderOnly = false,
  placeholderType,
  placeholderLabel,
  placeholderExtra,
  gapDoSlot = false,
  onClick,
  onDragOver,
  onDrop,
  draggable,
  onDragStart,
  isBoundary,
  onDragEnd,
}: DayCellProps) {
  const { configMap } = useTiposEventoResolvidos();
  const dayEvents = buildDayEvents(
    eventos,
    ativo,
    isAvulsa,
    placeholderOnly,
    placeholderType,
    placeholderLabel,
    placeholderExtra,
    corAtivo,
    configMap,
  );
  const isWeekend = [0, 6].includes(date.getDay());
  const isToday = isTodayDate(date);
  const inMonth = isSameMonth(date, new Date(anoReferencia, mesReferencia - 1, 1));

  return (
    <td
      className={cn(
        'border-r border-slate-100 px-0 text-center',
        CELL.width,
        isBoundary && 'border-r-[3px] border-r-slate-300',
      )}
    >
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'mx-auto flex items-center justify-center',
          CELL.height,
          !inMonth && 'opacity-35',
          gapDoSlot && 'bg-red-50/60',
        )}
      >
        <EscalaDayCell
          events={dayEvents}
          isWeekend={isWeekend}
          isToday={isToday}
          onClick={onClick}
          className={cn(ativo && !eventos.length && corAtivo && 'bg-slate-50')}
        />
      </div>
    </td>
  );
});

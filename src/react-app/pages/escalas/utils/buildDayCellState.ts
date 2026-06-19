// FIX: [BUG 2] - Day cell state now preserves solid event colors and contrast-safe text.

import { EVENT_PRIORITY, EVENT_TOKENS, EventType } from '../constants/escalaTokens';

export interface DayEvent {
  type: EventType;
  label: string;
  badgeLabel?: string;
  extra?: string;
  autoGerado?: boolean;
  backgroundColor?: string;
  textColor?: string;
}

export interface DayCellState {
  primary: DayEvent;
  secondaryList: DayEvent[];
  hasConflict: boolean;
  tooltipLines: string[];
  tokenBg: string;
  tokenText: string;
  primaryBackgroundColor: string | null;
  primaryTextColor: string | null;
}

export function buildDayCellState(events: DayEvent[]): DayCellState {
  if (!events || events.length === 0) {
    return {
      primary: { type: 'VAZIO', label: 'Disponível' },
      secondaryList: [],
      hasConflict: false,
      tooltipLines: [],
      tokenBg: EVENT_TOKENS.VAZIO.bg,
      tokenText: EVENT_TOKENS.VAZIO.text,
      primaryBackgroundColor: null,
      primaryTextColor: null,
    };
  }

  const realEvents = events.filter(
    (event) => event.type !== 'FOLGA' && event.type !== 'VAZIO' && event.type !== 'DISPONIVEL',
  );
  const hasConflict = realEvents.length > 1;

  const effectiveType: EventType = hasConflict
    ? 'CONFLITO'
    : (EVENT_PRIORITY.find((priority) => events.some((event) => event.type === priority)) ??
      'VAZIO');

  const primary = hasConflict
    ? {
        type: 'CONFLITO' as EventType,
        label: 'Conflito de agenda',
        extra: `${realEvents.length} eventos`,
      }
    : (events.find((event) => event.type === effectiveType) ?? {
        type: 'VAZIO' as EventType,
        label: 'Disponível',
      });

  const secondaryList = events.filter((event) => event !== primary);

  const tooltipLines = [
    `${primary.label}${primary.extra ? ` · ${primary.extra}` : ''}`,
    ...secondaryList.map((event) => `${event.label}${event.extra ? ` · ${event.extra}` : ''}`),
  ];

  return {
    primary,
    secondaryList,
    hasConflict,
    tooltipLines,
    tokenBg: primary.backgroundColor ? '' : EVENT_TOKENS[primary.type].bg,
    tokenText: primary.textColor ? '' : EVENT_TOKENS[primary.type].text,
    primaryBackgroundColor: primary.backgroundColor ?? null,
    primaryTextColor: primary.textColor ?? null,
  };
}

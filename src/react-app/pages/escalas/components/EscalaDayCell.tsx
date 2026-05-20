// FIX: [BUG 2] - Event pills now render with solid inline colors and contrast-safe icons.

import { cn } from '@/react-app/lib/utils';
import { CELL } from '../constants/escalaTokens';
import { buildDayCellState, DayEvent } from '../utils/buildDayCellState';

interface EscalaDayCellProps {
  events: DayEvent[];
  isWeekend?: boolean;
  isToday?: boolean;
  className?: string;
  onClick?: () => void;
}

function getEventInitial(label: string): string {
  const compactToken = label.trim().replace(/\s+/g, '');
  if (/^[A-Za-z0-9]{1,2}$/.test(compactToken)) return compactToken;

  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = normalized.match(/[A-Za-z]/);
  return match ? match[0]!.toUpperCase() : '•';
}

export function EscalaDayCell({
  events,
  isWeekend = false,
  isToday = false,
  className,
  onClick,
}: EscalaDayCellProps) {
  const state = buildDayCellState(events);
  const hasInlineColor = Boolean(state.primaryBackgroundColor);

  const tooltip = state.tooltipLines.length > 0 ? state.tooltipLines.join('\n') : undefined;

  return (
    <div
      title={tooltip}
      onClick={onClick}
      className={cn(
        CELL.width,
        CELL.height,
        CELL.radius,
        CELL.padding,
        'relative flex shrink-0 items-center justify-center transition-colors duration-100',
        isWeekend && !state.hasConflict ? 'bg-slate-50' : '',
        isToday ? 'ring-2 ring-blue-400 ring-offset-1' : '',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
    >
      {state.primary.type !== 'VAZIO' && (
        <div
          className={cn(
            'flex w-full items-center justify-center overflow-hidden',
            CELL.pillHeight,
            CELL.pillRadius,
            CELL.pillPaddingX,
            !hasInlineColor && state.tokenBg,
            !hasInlineColor && state.tokenText,
          )}
          style={
            hasInlineColor
              ? {
                  backgroundColor: state.primaryBackgroundColor || undefined,
                  color: state.primaryTextColor || undefined,
                }
              : undefined
          }
        >
          <span className="text-[11px] font-bold leading-none tracking-tight">
            {getEventInitial(state.primary.badgeLabel || state.primary.label)}
          </span>
          {!state.hasConflict && state.secondaryList.length > 0 && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-400 ring-1 ring-white" />
          )}
        </div>
      )}
    </div>
  );
}

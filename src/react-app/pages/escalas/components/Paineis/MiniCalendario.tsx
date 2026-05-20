/**
 * UX-09: Mini Calendar Navigation Sidebar
 * Compact month calendar with event density indicators.
 * Allows quick navigation to specific days.
 */

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarioProps {
  mes: number;
  ano: number;
  /** Map of date string (yyyy-MM-dd) to event count */
  eventosCount?: Map<string, number>;
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  onChangeMonth?: (mes: number, ano: number) => void;
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function MiniCalendario({
  mes,
  ano,
  eventosCount = new Map(),
  selectedDate,
  onSelectDate,
  onChangeMonth,
}: MiniCalendarioProps) {
  const { dias, offset } = useMemo(() => {
    const first = new Date(ano, mes - 1, 1);
    const last = new Date(ano, mes, 0);
    const numDays = last.getDate();
    const dayOfWeek = first.getDay();
    const d: number[] = [];
    for (let i = 1; i <= numDays; i++) d.push(i);
    return { dias: d, offset: dayOfWeek };
  }, [mes, ano]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === ano && today.getMonth() + 1 === mes;

  const prevMonth = () => {
    const m = mes <= 1 ? 12 : mes - 1;
    const y = mes <= 1 ? ano - 1 : ano;
    onChangeMonth?.(m, y);
  };
  const nextMonth = () => {
    const m = mes >= 12 ? 1 : mes + 1;
    const y = mes >= 12 ? ano + 1 : ano;
    onChangeMonth?.(m, y);
  };

  const MESES_CURTOS = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 w-full max-w-[240px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <span className="text-xs font-semibold text-gray-700">
          {MESES_CURTOS[mes - 1]} {ano}
        </span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-gray-400 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {/* empty cells for first day offset */}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`e${i}`} className="w-full aspect-square" />
        ))}
        {dias.map((d) => {
          const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const count = eventosCount.get(dateStr) || 0;
          const isToday = isCurrentMonth && d === today.getDate();
          const isSelected = dateStr === selectedDate;

          // density heat: 0 = none, 1-2 = light, 3+ = medium, 5+ = dense
          const density =
            count >= 5
              ? 'bg-blue-500 text-white'
              : count >= 3
                ? 'bg-blue-200 text-blue-800'
                : count >= 1
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600';

          return (
            <button
              key={d}
              onClick={() => onSelectDate?.(dateStr)}
              className={[
                'w-full aspect-square flex items-center justify-center rounded-md text-[10px] font-medium transition-all',
                isSelected ? 'ring-2 ring-blue-500 bg-blue-100' : '',
                isToday && !isSelected ? 'ring-1 ring-blue-300' : '',
                density,
                'hover:ring-1 hover:ring-blue-400',
              ]
                .filter(Boolean)
                .join(' ')}
              title={count > 0 ? `${count} ${count === 1 ? 'evento' : 'eventos'}` : undefined}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-blue-50" />
          <span className="text-[8px] text-gray-400">1-2</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-blue-200" />
          <span className="text-[8px] text-gray-400">3-4</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-blue-500" />
          <span className="text-[8px] text-gray-400">5+</span>
        </div>
      </div>
    </div>
  );
}

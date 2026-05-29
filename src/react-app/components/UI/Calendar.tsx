import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from './Card';
import { Badge } from './Badge';

interface CalendarEvent {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  piloto: string;
  instrutor: string;
  simulador: string;
  tipo: 'INICIAL' | 'RECORRENTE' | 'PROFICIENCIA';
  status:
    | 'AGENDADO'
    | 'AGENDADA'
    | 'EM_ANDAMENTO'
    | 'CONCLUIDO'
    | 'CONCLUIDA'
    | 'CANCELADO'
    | 'CANCELADA'
    | string;
}

interface CalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
}

const getEventColor = (tipo: CalendarEvent['tipo']) => {
  switch (tipo) {
    case 'INICIAL':
      return 'bg-blue-50 border-l-4 border-blue-500 text-blue-900';
    case 'RECORRENTE':
      return 'bg-yellow-50 border-l-4 border-yellow-500 text-yellow-900';
    case 'PROFICIENCIA':
      return 'bg-green-50 border-l-4 border-green-500 text-green-900';
    default:
      return 'bg-gray-50 border-l-4 border-gray-400 text-gray-900';
  }
};

export const Calendar: React.FC<CalendarProps> = ({ events, onEventClick, onDateClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Agrupar eventos por dia
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = format(event.date, 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <Card>
      {/* Header do Calendário */}
      <CardContent className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-100 rounded-md transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800 w-40 text-center">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-100 rounded-md transition-colors"
              title="Próximo mês"
            >
              <ChevronRight size={20} className="text-slate-600" />
            </button>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-3">
            <select className="px-3 py-2 border border-slate-300 rounded-md text-sm focus-visible:outline-none focus:ring-2 focus:ring-primary/50 bg-white">
              <option value="">Todos Simuladores</option>
              <option value="A320">A320 FFS</option>
              <option value="B737">B737 MAX FFS</option>
              <option value="E190">E190-E2 FTD</option>
            </select>
            <select className="px-3 py-2 border border-slate-300 rounded-md text-sm focus-visible:outline-none focus:ring-2 focus:ring-primary/50 bg-white">
              <option value="">Todos Instrutores</option>
            </select>
          </div>
        </div>
      </CardContent>

      {/* Grid do Calendário */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {/* Dias da Semana */}
        {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((dia) => (
          <div
            key={dia}
            className="text-center py-3 text-sm font-semibold text-slate-600 border-r border-slate-200 last:border-r-0 bg-slate-50"
          >
            {dia}
          </div>
        ))}
      </div>

      {/* Dias do Mês */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isTodayDate = isToday(day);

          return (
            <div
              key={i}
              onClick={() => onDateClick?.(day)}
              className={`
                min-h-[140px] border-b border-r border-slate-200 p-2 cursor-pointer
                hover:bg-slate-50 transition-colors
                ${!isCurrentMonth && 'bg-slate-50/50'}
                ${isTodayDate && 'bg-blue-50 border-r-2 border-b-2 border-blue-300'}
              `}
            >
              {/* Número do Dia */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`
                    text-sm font-medium
                    ${!isCurrentMonth && 'text-slate-400'}
                    ${
                      isTodayDate &&
                      'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs'
                    }
                  `}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <Badge variant="default" size="sm" className="text-xs px-1.5 py-0">
                    {dayEvents.length}
                  </Badge>
                )}
              </div>

              {/* Eventos do Dia */}
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(event);
                    }}
                    className={`
                      ${getEventColor(event.tipo)}
                      rounded-r-sm p-1.5 cursor-pointer
                      hover:shadow-md transition-all duration-200 text-xs
                    `}
                  >
                    <p className="font-bold truncate">
                      {event.startTime} - {event.endTime}
                    </p>
                    <p className="truncate">{event.piloto}</p>
                    <p className="truncate opacity-75">{event.simulador}</p>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-slate-500 text-center mt-1">
                    +{dayEvents.length - 3} mais
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default Calendar;

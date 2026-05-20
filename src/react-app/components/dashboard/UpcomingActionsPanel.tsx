import React from 'react';
import { Link } from 'react-router-dom';
import type { UpcomingAction } from '../../types/dashboard-enhanced.types';
import { groupActionsByPeriod } from '../../types/dashboard-enhanced.types';

interface UpcomingActionsPanelProps {
  actions: UpcomingAction[];
  onMarkComplete?: (actionId: string) => void;
}

export function UpcomingActionsPanel({ actions, onMarkComplete }: UpcomingActionsPanelProps) {
  const grouped = groupActionsByPeriod(actions);

  if (actions.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">📅 Próximas Ações</h3>
        <p className="text-sm text-gray-500">Nenhuma ação pendente no momento</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">📅 Próximas Ações</h3>
        <p className="text-sm text-gray-500 mt-1">
          {actions.length} {actions.length === 1 ? 'ação pendente' : 'ações pendentes'}
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Hoje */}
        {grouped.today.length > 0 && (
          <ActionGroup
            title="Hoje"
            actions={grouped.today}
            onMarkComplete={onMarkComplete}
            variant="urgent"
          />
        )}

        {/* Próximos 7 dias */}
        {grouped.next7Days.length > 0 && (
          <ActionGroup
            title="Próximos 7 dias"
            actions={grouped.next7Days}
            onMarkComplete={onMarkComplete}
            variant="soon"
          />
        )}

        {/* Próximos 30 dias */}
        {grouped.next30Days.length > 0 && (
          <ActionGroup
            title="Próximos 30 dias"
            actions={grouped.next30Days}
            onMarkComplete={onMarkComplete}
            variant="later"
          />
        )}
      </div>
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  onMarkComplete,
  variant,
}: {
  title: string;
  actions: UpcomingAction[];
  onMarkComplete?: (actionId: string) => void;
  variant: 'urgent' | 'soon' | 'later';
}) {
  const colors = {
    urgent: 'bg-red-50 text-red-700',
    soon: 'bg-amber-50 text-amber-700',
    later: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="px-6 py-4">
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold mb-3 ${colors[variant]}`}
      >
        {title}
      </div>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionItem key={action.id} action={action} onMarkComplete={onMarkComplete} />
        ))}
      </div>
    </div>
  );
}

function ActionItem({
  action,
  onMarkComplete,
}: {
  action: UpcomingAction;
  onMarkComplete?: (actionId: string) => void;
}) {
  const typeIcons = {
    simulador: '✈️',
    cheque: '✅',
    renovacao: '🔄',
    exame_medico: '🏥',
  };

  const priorityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-amber-200 bg-amber-50',
    low: 'border-gray-200 bg-gray-50',
  };

  return (
    <div
      className={`
      flex items-center gap-3 p-3 rounded-lg border
      ${priorityColors[action.priority]}
      transition-all duration-200 hover:shadow-sm
    `}
    >
      {/* Checkbox */}
      {onMarkComplete && (
        <input
          type="checkbox"
          checked={action.completed || false}
          onChange={() => onMarkComplete(action.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-primary/30"
        />
      )}

      {/* Icon */}
      <span className="text-xl flex-shrink-0">{typeIcons[action.type]}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Link
          to={action.url}
          className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
        >
          {action.title}
        </Link>
        {action.assignedTo && (
          <p className="text-xs text-gray-600 mt-0.5">Atribuído a: {action.assignedTo}</p>
        )}
      </div>

      {/* Due Date */}
      <div className="flex-shrink-0 text-right">
        <div
          className={`text-xs font-semibold ${
            action.daysUntil === 0
              ? 'text-red-700'
              : action.daysUntil <= 3
                ? 'text-amber-700'
                : 'text-gray-700'
          }`}
        >
          {action.daysUntil === 0
            ? 'Hoje'
            : action.daysUntil === 1
              ? 'Amanhã'
              : `${action.daysUntil} dias`}
        </div>
      </div>
    </div>
  );
}

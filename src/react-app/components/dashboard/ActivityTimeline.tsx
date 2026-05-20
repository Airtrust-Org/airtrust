import React from 'react';
import type { RecentActivity } from '../../types/dashboard-enhanced.types';
import { formatRelativeTime } from '../../types/dashboard-enhanced.types';

interface ActivityTimelineProps {
  activities: RecentActivity[];
  maxVisible?: number;
  filterTypes?: string[];
}

export function ActivityTimeline({
  activities,
  maxVisible = 5,
  filterTypes,
}: ActivityTimelineProps) {
  const [showAll, setShowAll] = React.useState(false);

  const filtered = filterTypes
    ? activities.filter((a) => filterTypes.includes(a.type))
    : activities;

  const visible = showAll ? filtered : filtered.slice(0, maxVisible);
  const hasMore = filtered.length > maxVisible;

  if (activities.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">🔔 Atividades Recentes</h3>
        <p className="text-sm text-gray-500">Nenhuma atividade recente</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">🔔 Atividades Recentes</h3>
        <p className="text-sm text-gray-500 mt-1">Últimas 4 horas</p>
      </div>

      <div className="px-6 py-4">
        <div className="space-y-4">
          {visible.map((activity, index) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              isLast={index === visible.length - 1}
            />
          ))}
        </div>

        {hasMore && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-4 w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            Mostrar mais {filtered.length - maxVisible} atividades
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity, isLast }: { activity: RecentActivity; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      {/* Timeline indicator */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <span className="text-sm">{activity.icon}</span>
        </div>
        {!isLast && <div className="w-0.5 h-full bg-gray-200 mt-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900">{activity.title}</h4>
            {activity.description && (
              <p className="text-sm text-gray-600 mt-0.5">{activity.description}</p>
            )}
            {activity.user && <p className="text-xs text-gray-500 mt-1">{activity.user.name}</p>}
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

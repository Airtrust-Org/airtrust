import React from 'react';

interface KPICardProps {
  label: string;
  value: number | string;
  icon?: string;
  color?: 'default' | 'success' | 'warning' | 'danger';
  trend?: string;
  trendDirection?: 'up' | 'down';
}

export function KPICard({
  label,
  value,
  icon,
  color = 'default',
  trend,
  trendDirection,
}: KPICardProps) {
  const iconColors = {
    default: 'text-primary-600',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {trend && (
            <p
              className={`text-sm mt-1 flex items-center gap-1 ${
                trendDirection ? trendColors[trendDirection] : 'text-slate-600'
              }`}
            >
              {trendDirection && (
                <span className="material-symbols-outlined text-sm">
                  {trendDirection === 'up' ? 'trending_up' : 'trending_down'}
                </span>
              )}
              {trend}
            </p>
          )}
        </div>
        {icon && (
          <span className={`material-symbols-outlined text-4xl ${iconColors[color]}`}>{icon}</span>
        )}
      </div>
    </div>
  );
}

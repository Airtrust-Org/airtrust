import React from 'react';
import { Link } from 'react-router-dom';
import type { CriticalAlert } from '../../types/dashboard-enhanced.types';

interface CriticalAlertsPanelProps {
  alerts: CriticalAlert[];
  maxVisible?: number;
  onActionClick?: (alert: CriticalAlert) => void;
  totalCount?: number;
}

export function CriticalAlertsPanel({
  alerts,
  maxVisible = 3,
  onActionClick,
  totalCount,
}: CriticalAlertsPanelProps) {
  const visibleAlerts = alerts.slice(0, maxVisible);
  const hasMore = alerts.length > maxVisible;
  const displayTotalCount = totalCount || alerts.reduce((sum, a) => sum + a.count, 0);

  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-xl">✅</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-emerald-900">Nenhum Alerta Crítico</h3>
            <p className="text-sm text-emerald-700">Todas as operações estão em conformidade</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-xl">🚨</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Alertas Críticos</h3>
            <p className="text-sm text-gray-500">
              {displayTotalCount} {displayTotalCount === 1 ? 'item requer' : 'itens requerem'}{' '}
              atenção imediata
            </p>
          </div>
        </div>
        <Link
          to="/alertas"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          Ver Todos →
        </Link>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-100">
        {visibleAlerts.map((alert) => (
          <AlertItem key={alert.id} alert={alert} onActionClick={onActionClick} />
        ))}
      </div>

      {/* Footer */}
      {hasMore && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl">
          <Link
            to="/alertas"
            className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            + {alerts.length - maxVisible} alertas adicionais
          </Link>
        </div>
      )}
    </div>
  );
}

function AlertItem({
  alert,
  onActionClick,
}: {
  alert: CriticalAlert;
  onActionClick?: (alert: CriticalAlert) => void;
}) {
  const severityColors = {
    critical: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  };

  const severityBadgeColors = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors group">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <span className="text-2xl">{alert.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-gray-900">{alert.title}</h4>
                <span
                  className={`
                  inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                  ${severityBadgeColors[alert.severity]}
                `}
                >
                  {alert.count}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{alert.description}</p>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link
                  to={alert.actionUrl}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                  onClick={() => onActionClick?.(alert)}
                >
                  {alert.actionLabel}
                </Link>
                {alert.secondaryActionLabel && alert.secondaryActionUrl && (
                  <Link
                    to={alert.secondaryActionUrl}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {alert.secondaryActionLabel}
                  </Link>
                )}
              </div>
            </div>

            {/* Urgency Indicator */}
            {alert.daysUntilDeadline !== undefined && (
              <div className="flex-shrink-0 text-right">
                <div
                  className={`
                  text-xs font-semibold px-2 py-1 rounded
                  ${
                    alert.daysUntilDeadline <= 3
                      ? 'bg-red-100 text-red-700'
                      : alert.daysUntilDeadline <= 7
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-700'
                  }
                `}
                >
                  {alert.daysUntilDeadline === 0
                    ? 'Vencido'
                    : alert.daysUntilDeadline === 1
                      ? '1 dia'
                      : `${alert.daysUntilDeadline} dias`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

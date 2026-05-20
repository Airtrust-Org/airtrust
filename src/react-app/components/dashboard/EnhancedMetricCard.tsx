import React from 'react';
import { Link } from 'react-router-dom';
import type { MetricWithTrend } from '../../types/dashboard-enhanced.types';
import { formatMetricDelta } from '../../types/dashboard-enhanced.types';

interface EnhancedMetricCardProps {
  title: string;
  metric: MetricWithTrend;
  icon?: string;
  href?: string;
  inversePolarity?: boolean; // true se diminuição é positivo (ex: alertas)
  description?: string;
}

export function EnhancedMetricCard({
  title,
  metric,
  icon,
  href,
  inversePolarity = false,
  description,
}: EnhancedMetricCardProps) {
  const delta = formatMetricDelta(metric.delta, metric.deltaPercent, inversePolarity);
  const hasTarget = metric.target !== undefined;
  const isAboveTarget = hasTarget && metric.current >= metric.target!;
  const isBelowTarget = hasTarget && metric.current < metric.target!;

  const CardWrapper = href ? Link : 'div';
  const cardProps = href ? { to: href } : {};

  return (
    <CardWrapper
      {...cardProps}
      className={`
        relative overflow-hidden bg-white border border-gray-200 rounded-xl p-6 shadow-sm
        transition-all duration-200
        ${href ? 'hover:shadow-md hover:border-gray-300 cursor-pointer' : ''}
        group
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-xl">{icon}</span>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-gray-600">{title}</h3>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
        </div>
      </div>

      {/* Main Metric */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {metric.current.toLocaleString('pt-BR')}
          </span>
          {metric.unit && <span className="text-lg font-medium text-gray-500">{metric.unit}</span>}
        </div>
      </div>

      {/* Trend Indicator */}
      {metric.delta !== 0 && (
        <div className="mb-3">
          <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${delta.color}`}>
            <span className="text-base">{delta.icon}</span>
            <span>{delta.text}</span>
            <span className="text-xs text-gray-500">vs semana anterior</span>
          </div>
        </div>
      )}

      {/* Target/Goal */}
      {hasTarget && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
            <span>
              Meta: {metric.target}
              {metric.unit || ''}
            </span>
            <span
              className={`font-semibold ${
                isAboveTarget
                  ? 'text-emerald-600'
                  : isBelowTarget
                    ? 'text-red-600'
                    : 'text-gray-600'
              }`}
            >
              {isAboveTarget ? '🎯 Atingida' : '⚠️ Abaixo'}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isAboveTarget ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{
                width: `${Math.min((metric.current / metric.target!) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Sparkline (if data available) */}
      {metric.sparkline && metric.sparkline.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <MiniSparkline data={metric.sparkline} />
        </div>
      )}

      {/* Hover Action */}
      {href && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium text-blue-600">Ver detalhes →</span>
        </div>
      )}
    </CardWrapper>
  );
}

/**
 * Mini sparkline chart
 */
function MiniSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;

  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((value, index) => {
        const height = range > 0 ? ((value - min) / range) * 100 : 50;
        return (
          <div
            key={index}
            className="flex-1 bg-blue-200 rounded-t transition-all duration-300 hover:bg-blue-400"
            style={{ height: `${height}%` }}
            title={`${value}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Versão compacta para uso em grids densos
 */
export function CompactMetricCard({
  title,
  value,
  unit,
  trend,
  icon,
  href,
}: {
  title: string;
  value: number;
  unit?: string;
  trend?: { delta: number; direction: 'up' | 'down' | 'stable' };
  icon?: string;
  href?: string;
}) {
  const CardWrapper = href ? Link : 'div';
  const cardProps = href ? { to: href } : {};

  return (
    <CardWrapper
      {...cardProps}
      className={`
        bg-white border border-gray-200 rounded-lg p-4
        transition-all duration-200
        ${href ? 'hover:shadow-md hover:border-gray-300 cursor-pointer' : ''}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600 mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">
              {value.toLocaleString('pt-BR')}
            </span>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {trend && trend.delta !== 0 && (
            <p
              className={`text-xs font-medium mt-1 ${
                trend.direction === 'up'
                  ? 'text-emerald-600'
                  : trend.direction === 'down'
                    ? 'text-red-600'
                    : 'text-gray-500'
              }`}
            >
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}{' '}
              {Math.abs(trend.delta)}%
            </p>
          )}
        </div>
        {icon && <div className="flex-shrink-0 text-2xl opacity-50">{icon}</div>}
      </div>
    </CardWrapper>
  );
}

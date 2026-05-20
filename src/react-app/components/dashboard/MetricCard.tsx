/**
 * MetricCard - Card de métrica MODERNO com drill-down
 * Sistema AirTrust - Dashboard Principal
 */

import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'amber' | 'red';
  badge?: string;
  trend?: 'subindo' | 'estavel' | 'descendo';
  isLoading?: boolean;
  onClick?: () => void;
}

const colorClasses = {
  blue: {
    gradient: 'from-blue-50 to-blue-100',
    iconBg: 'bg-blue-500',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    hover: 'hover:from-blue-100 hover:to-blue-200',
  },
  green: {
    gradient: 'from-emerald-50 to-emerald-100',
    iconBg: 'bg-emerald-500',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    hover: 'hover:from-emerald-100 hover:to-emerald-200',
  },
  amber: {
    gradient: 'from-amber-50 to-amber-100',
    iconBg: 'bg-amber-500',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    hover: 'hover:from-amber-100 hover:to-amber-200',
  },
  red: {
    gradient: 'from-red-50 to-red-100',
    iconBg: 'bg-red-500',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700 border-red-200',
    hover: 'hover:from-red-100 hover:to-red-200',
  },
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  badge,
  trend,
  isLoading,
  onClick,
}: MetricCardProps) {
  const colors = colorClasses[color];

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-14 bg-gray-200 rounded mb-3"></div>
        <div className="h-6 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  const TrendIcon = trend === 'subindo' ? TrendingUp : trend === 'descendo' ? TrendingDown : Minus;

  return (
    <div
      className={`
        bg-gradient-to-br ${colors.gradient}
        rounded-xl shadow-sm border border-gray-200
        p-6 transition-transform duration-200 ease-out
        ${onClick ? `cursor-pointer ${colors.hover} hover:shadow-md hover:scale-[1.01]` : ''}
      `}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Header com Ícone */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-12 h-12 ${colors.iconBg} rounded-xl flex items-center justify-center shadow-md`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <div className="flex items-center gap-1">
            <TrendIcon
              className={`w-4 h-4 ${
                trend === 'subindo'
                  ? 'text-green-600'
                  : trend === 'descendo'
                  ? 'text-red-600'
                  : 'text-gray-500'
              }`}
            />
          </div>
        )}
      </div>

      {/* Valor Principal */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-600 mb-1">{title}</h3>
        <p className={`text-2xl font-bold ${colors.text} tracking-tight`}>{value}</p>
      </div>

      {/* Subtitle */}
      <p className="text-sm text-gray-600 mb-3">{subtitle}</p>

      {/* Badge */}
      {badge && (
        <div
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colors.badge}`}
        >
          {badge}
        </div>
      )}

      {/* Indicador de Click */}
      {onClick && (
        <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Ver detalhes</span>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
      )}
    </div>
  );
}

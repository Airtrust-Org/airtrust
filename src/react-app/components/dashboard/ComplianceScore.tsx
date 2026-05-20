import React from 'react';
import type { MetricWithTrend, ComplianceBreakdown } from '../../types/dashboard-enhanced.types';

interface ComplianceScoreProps {
  compliance: MetricWithTrend & { breakdown: ComplianceBreakdown[] };
}

export function ComplianceScore({ compliance }: ComplianceScoreProps) {
  const score = compliance.current;
  const target = compliance.target || 90;
  const isAboveTarget = score >= target;

  // Calcular stroke-dasharray para gauge
  const circumference = 2 * Math.PI * 90; // raio = 90
  const progress = (score / 100) * circumference;
  const remaining = circumference - progress;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      {/* Title */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Score de Conformidade</h3>
        <p className="text-sm text-gray-500 mt-1">Medição geral de conformidade operacional</p>
      </div>

      {/* Radial Gauge */}
      <div className="flex items-center justify-center mb-8">
        <div className="relative">
          <svg width="200" height="120" viewBox="0 0 200 120" className="transform -rotate-90">
            {/* Background Arc */}
            <path
              d="M 20 100 A 90 90 0 0 1 180 100"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="16"
              strokeLinecap="round"
            />
            {/* Progress Arc */}
            <path
              d="M 20 100 A 90 90 0 0 1 180 100"
              fill="none"
              stroke={isAboveTarget ? '#10b981' : '#ef4444'}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${remaining}`}
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Center Score */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
            <span
              className={`text-5xl font-bold ${
                isAboveTarget ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {score.toFixed(0)}%
            </span>
            <span className="text-sm font-medium text-gray-500 mt-1">
              {isAboveTarget ? '🎯 Acima da Meta' : '⚠️ Abaixo da Meta'}
            </span>
          </div>
        </div>
      </div>

      {/* Target Line */}
      <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-600">
        <span>Meta:</span>
        <span className="font-semibold">{target}%</span>
        <span
          className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            isAboveTarget ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {isAboveTarget ? `+${(score - target).toFixed(1)}%` : `${(score - target).toFixed(1)}%`}
        </span>
      </div>

      {/* Breakdown by Category */}
      <div className="space-y-3 pt-6 border-t border-gray-100">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Breakdown por Categoria
        </h4>
        {compliance.breakdown.map((item) => (
          <BreakdownItem key={item.category} item={item} />
        ))}
      </div>

      {/* Trend (if available) */}
      {compliance.delta !== 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div
            className={`flex items-center gap-2 text-sm font-medium ${
              compliance.trend === 'up'
                ? 'text-emerald-600'
                : compliance.trend === 'down'
                  ? 'text-red-600'
                  : 'text-gray-600'
            }`}
          >
            <span className="text-lg">
              {compliance.trend === 'up' ? '↑' : compliance.trend === 'down' ? '↓' : '→'}
            </span>
            <span>
              {compliance.delta > 0 ? '+' : ''}
              {compliance.delta.toFixed(1)}% ({compliance.deltaPercent > 0 ? '+' : ''}
              {compliance.deltaPercent.toFixed(1)}%)
            </span>
            <span className="text-gray-500">vs mês anterior</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownItem({ item }: { item: ComplianceBreakdown }) {
  const percentage = (item.valid / item.total) * 100;
  const isGood = percentage >= 90;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${item.color}`} />
          <span className="font-medium text-gray-700">{item.category}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">
            {item.valid}/{item.total}
          </span>
          <span className={`font-semibold ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>
            {percentage.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${item.color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Versão compacta para uso em grids
 */
export function CompactComplianceScore({ score, target = 90 }: { score: number; target?: number }) {
  const isAboveTarget = score >= target;
  const circumference = 2 * Math.PI * 40;
  const progress = (score / 100) * circumference;
  const remaining = circumference - progress;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-4">
        {/* Mini Gauge */}
        <div className="relative flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 100 100" className="transform -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={isAboveTarget ? '#10b981' : '#ef4444'}
              strokeWidth="8"
              strokeDasharray={`${progress} ${remaining}`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`text-xl font-bold ${isAboveTarget ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {score}%
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Compliance</h4>
          <p className="text-xs text-gray-600 mb-2">Meta: {target}%</p>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              isAboveTarget ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {isAboveTarget ? '✓ Atingida' : '⚠ Abaixo'}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * ComplianceGauge - Gauge circular de compliance
 * Sistema AirTrust - Dashboard Principal
 */

import React from 'react';
import { useDashboardCompliance } from '../../hooks/useDashboardCompliance';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function ComplianceGauge() {
  const { compliance, isLoading, error } = useDashboardCompliance();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error || !compliance) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Erro ao carregar compliance score</p>
      </div>
    );
  }

  const score = compliance.scoreGeral;
  const color = score >= 86 ? 'green' : score >= 71 ? 'yellow' : 'red';
  const colorClasses = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Score de Compliance</h3>

      <div className="flex flex-col items-center justify-center">
        {/* Gauge circular simplificado */}
        <div className="relative w-48 h-48">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={color === 'green' ? '#10b981' : color === 'yellow' ? '#f59e0b' : '#ef4444'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - score / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${colorClasses[color]}`}>{score}%</span>
            <span className="text-sm text-gray-600 mt-1">Compliance</span>
          </div>
        </div>

        {/* Tendência */}
        <div className="mt-4 flex items-center text-sm">
          {compliance.tendencia === 'subindo' && (
            <>
              <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
              <span className="text-green-600">Em alta</span>
            </>
          )}
          {compliance.tendencia === 'descendo' && (
            <>
              <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
              <span className="text-red-600">Em baixa</span>
            </>
          )}
          {compliance.tendencia === 'estavel' && (
            <>
              <Minus className="w-4 h-4 text-gray-600 mr-1" />
              <span className="text-gray-600">Estável</span>
            </>
          )}
        </div>

        {/* Breakdown */}
        <div className="mt-6 w-full space-y-2">
          <BreakdownItem label="Qualificações" value={compliance.breakdown.qualificacoes} />
          <BreakdownItem label="Treinamentos" value={compliance.breakdown.treinamentos} />
          <BreakdownItem label="Simuladores" value={compliance.breakdown.simuladores} />
        </div>

        {/* Meta */}
        <div className="mt-4 text-center text-sm text-gray-600">
          Meta organizacional: {compliance.metaOrganizacional}%
        </div>
      </div>
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string; value: number }) {
  const color = value >= 86 ? 'bg-green-500' : value >= 71 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );
}

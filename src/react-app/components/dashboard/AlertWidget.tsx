/**
 * AlertWidget - Widget de alertas críticos ULTRA COMPACTO
 * Sistema AirTrust - Dashboard Principal
 */

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { AlertaCritico } from '../../types/dashboard.types';
import { useNavigate } from 'react-router-dom';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface AlertWidgetProps {
  alerts: AlertaCritico[];
  isLoading?: boolean;
  compact?: boolean;
}

export function AlertWidget({ alerts, isLoading, compact = false }: AlertWidgetProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">Nenhum alerta crítico</p>
        </div>
      </div>
    );
  }

  // Limitar alertas se compact
  const alertasExibir = compact ? alerts.slice(0, 6) : alerts;
  const temMais = compact && alerts.length > 6;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header Compacto */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h3 className="font-bold text-gray-900 text-sm">Alertas Críticos</h3>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
          {alerts.length}
        </span>
      </div>

      {/* Tabela Compacta */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {alertasExibir.map((alerta) => {
          const diasColor =
            alerta.diasRestantes === 0
              ? 'text-red-600 font-bold'
              : alerta.diasRestantes <= 7
                ? 'text-amber-600 font-semibold'
                : 'text-gray-600';

          const criticColor =
            alerta.criticidade === 'ALTA'
              ? 'bg-red-50'
              : alerta.criticidade === 'MEDIA'
                ? 'bg-amber-50'
                : 'bg-blue-50';

          return (
            <div
              key={alerta.id}
              className={`px-4 py-2.5 hover:${criticColor} cursor-pointer transition-colors flex items-center justify-between gap-3 group text-xs`}
              onClick={() => navigate(`/qualificacoes?funcionario_id=${alerta.tripulanteId}`)}
            >
              {/* Tripulante + Qualificação */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <FuncionarioLink
                    funcionarioId={alerta.tripulanteId}
                    nome={alerta.tripulanteNome}
                    className="font-bold text-gray-900 truncate hover:text-primary hover:underline"
                    stopPropagation
                  />
                  {alerta.tripulanteMatricula && (
                    <span className="text-gray-500 flex-shrink-0">
                      ({alerta.tripulanteMatricula})
                    </span>
                  )}
                </div>
                <div className="text-gray-600 mt-0.5">{alerta.qualificacaoNome}</div>
              </div>

              {/* Dias Restantes */}
              <div className={`flex-shrink-0 text-right ${diasColor}`}>
                <div className="font-bold">{alerta.diasRestantes}d</div>
              </div>

              {/* Ícone de Criticidade */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center ${
                  alerta.criticidade === 'ALTA'
                    ? 'bg-red-100'
                    : alerta.criticidade === 'MEDIA'
                      ? 'bg-amber-100'
                      : 'bg-blue-100'
                }`}
              >
                <AlertTriangle
                  className={`w-3 h-3 ${
                    alerta.criticidade === 'ALTA'
                      ? 'text-red-600'
                      : alerta.criticidade === 'MEDIA'
                        ? 'text-amber-600'
                        : 'text-blue-600'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Link para Ver Todos */}
      {(temMais || (!compact && alerts.length > 6)) && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => navigate('/qualificacoes?status=vencendo')}
            className="text-xs text-blue-600 font-medium hover:text-blue-800 w-full text-center py-1"
          >
            Ver todos os {alerts.length} alertas →
          </button>
        </div>
      )}
    </div>
  );
}

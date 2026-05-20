/**
 * SimulatorUtilization - Utilização de simuladores
 * Sistema AirTrust - Dashboard Principal
 */

import React, { useState, useEffect } from 'react';
import { Plane, Wrench, XCircle } from 'lucide-react';
import type { UtilizacaoSimuladores } from '../../types/dashboard.types';
import { API_BASE_URL } from '@/react-app/config/api';

export function SimulatorUtilization() {
  const [data, setData] = useState<UtilizacaoSimuladores | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/dashboard/utilizacao-simuladores?t=${new Date().getTime()}`,
          {
            headers: {
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
          },
        );
        const result = await response.json();
        setData(result.data);
      } catch (error) {
        console.error('Erro ao carregar utilização de simuladores:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Utilização de Simuladores</h3>
        <p className="text-sm text-gray-600 mt-1">Últimos 30 dias</p>
      </div>
      <div className="p-4 space-y-4">
        {!data || data.simuladores.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum simulador cadastrado</p>
        ) : (
          data.simuladores.map((sim) => (
            <div key={sim.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{sim.nome}</h4>
                  <p className="text-xs text-gray-600">
                    {sim.fabricante} {sim.modelo}
                  </p>
                </div>
                <StatusBadge status={sim.status} />
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Utilização</span>
                  <span>{sim.taxaUtilizacao}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      sim.taxaUtilizacao >= 80
                        ? 'bg-red-500'
                        : sim.taxaUtilizacao >= 60
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(sim.taxaUtilizacao, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {sim.horasProgramadas}h de {sim.horasDisponiveis}h disponíveis
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    operacional: {
      icon: Plane,
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Operacional',
    },
    manutencao: {
      icon: Wrench,
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Manutenção',
    },
    inoperante: {
      icon: XCircle,
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Inoperante',
    },
  };

  const statusConfig = config[status as keyof typeof config] || config.operacional;
  const Icon = statusConfig.icon;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {statusConfig.label}
    </span>
  );
}

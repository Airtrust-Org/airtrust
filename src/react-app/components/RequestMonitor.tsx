import React, { useEffect, useState } from 'react';
import { requestController } from '../utils/request-control';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';

/**
 * Componente de monitoramento de requests
 * Mostra estatísticas de uso de API em tempo real
 */
export function RequestMonitor() {
  const [stats, setStats] = useState(requestController.getStats());
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(requestController.getStats());
    }, 5000); // Atualiza a cada 5s

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (stats.percentDay >= 90) return 'bg-red-100 border-red-500 text-red-800';
    if (stats.percentDay >= 70) return 'bg-yellow-100 border-yellow-500 text-yellow-800';
    return 'bg-green-100 border-green-500 text-green-800';
  };

  const getIcon = () => {
    if (stats.percentDay >= 90) return <AlertTriangle className="w-4 h-4" />;
    if (stats.percentDay >= 70) return <Activity className="w-4 h-4" />;
    return <CheckCircle className="w-4 h-4" />;
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 shadow-lg transition-all ${getStatusColor()}`}
      >
        {getIcon()}
        <span className="font-mono text-sm font-semibold">{stats.percentDay}%</span>
      </button>

      {isExpanded && (
        <div className="absolute bottom-12 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Uso de API
          </h3>

          <div className="space-y-3 text-xs">
            {/* Uso diário */}
            <div>
              <div className="flex justify-between text-gray-600 mb-1">
                <span>Uso Diário</span>
                <span className="font-mono font-semibold">
                  {stats.perDay.toLocaleString()} / {stats.maxPerDay.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    stats.percentDay >= 90
                      ? 'bg-red-500'
                      : stats.percentDay >= 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(stats.percentDay, 100)}%` }}
                />
              </div>
            </div>

            {/* Uso por minuto */}
            <div>
              <div className="flex justify-between text-gray-600 mb-1">
                <span>Último Minuto</span>
                <span className="font-mono font-semibold">
                  {stats.perMinute} / {stats.maxPerMinute}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${Math.min((stats.perMinute / stats.maxPerMinute) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Alertas */}
            {stats.percentDay >= 90 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-800">
                <p className="font-semibold">⚠️ Limite crítico!</p>
                <p className="mt-1">Evite fazer mais requests até amanhã.</p>
              </div>
            )}

            {stats.percentDay >= 70 && stats.percentDay < 90 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-800">
                <p className="font-semibold">⚡ Uso elevado</p>
                <p className="mt-1">Reduza navegação intensiva.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

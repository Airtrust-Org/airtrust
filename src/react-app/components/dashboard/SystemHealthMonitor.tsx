/**
 * SystemHealthMonitor - Monitor de saúde do sistema
 * Sistema AirTrust - Dashboard Principal
 */

import React, { useState, useEffect } from 'react';
import { Database, HardDrive, Server, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { SystemHealth } from '../../types/dashboard.types';
import { API_BASE_URL } from '@/react-app/config/api';

export function SystemHealthMonitor() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchHealth = async () => {
      if (!isMounted || document.hidden) return;

      try {
        const response = await fetch(`${API_BASE_URL}/dashboard/system-health`);
        const result = await response.json();

        if (isMounted) {
          setHealth(result.data);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Erro ao verificar saúde do sistema:', error);
        }
      }
    };

    fetchHealth();

    // Auto-refresh a cada 10 minutos (era 3 min → 30s antes)
    const interval = setInterval(() => {
      if (!document.hidden && isMounted) {
        fetchHealth();
      }
    }, 600000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!health) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Saúde do Sistema</h3>
        <OverallStatusBadge status={health.status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComponentStatus
          icon={Database}
          label="Database"
          status={health.database.status}
          detail={`${health.database.latency}ms latência`}
        />
        <ComponentStatus
          icon={HardDrive}
          label="Storage"
          status={health.storage.status}
          detail={`${health.storage.espacoUsado}GB usado`}
        />
        <ComponentStatus
          icon={Server}
          label="Workers"
          status={health.workers.status}
          detail={`${health.workers.requestsUltima1h} req/h`}
        />
      </div>
    </div>
  );
}

function OverallStatusBadge({ status }: { status: string }) {
  const config = {
    healthy: {
      icon: CheckCircle,
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Saudável',
    },
    degraded: {
      icon: AlertTriangle,
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Degradado',
    },
    critical: {
      icon: XCircle,
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Crítico',
    },
  };

  const statusConfig = config[status as keyof typeof config] || config.healthy;
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

function ComponentStatus({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: any;
  label: string;
  status: string;
  detail: string;
}) {
  const iconColor =
    status === 'ok' ? 'text-green-600' : status === 'slow' ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="flex items-center space-x-3">
      <div className={`p-2 rounded-lg bg-gray-50`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-600">{detail}</p>
      </div>
    </div>
  );
}

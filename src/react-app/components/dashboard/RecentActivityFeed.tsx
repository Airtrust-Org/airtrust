/**
 * RecentActivityFeed - Feed de atividades recentes
 * Sistema AirTrust - Dashboard Principal
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle, Award, AlertTriangle, UserPlus, Inbox } from 'lucide-react';
import type { AtividadeRecente } from '../../types/dashboard.types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { POLLING_INTERVALS } from '../../utils/constants';
import { API_BASE_URL } from '@/react-app/config/api';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

const iconMap = {
  CheckCircle,
  Award,
  AlertTriangle,
  UserPlus,
};

export function RecentActivityFeed() {
  const [atividades, setAtividades] = useState<AtividadeRecente[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchAtividades = async () => {
      if (!isMounted || document.hidden) return;

      try {
        const response = await fetch(`${API_BASE_URL}/dashboard/atividades-recentes`);
        const result = await response.json();

        if (isMounted) {
          setAtividades(result.data || []);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Erro ao carregar atividades:', error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAtividades();

    // Auto-refresh a cada 10 minutos (NÃO usar visibilitychange - causa explosão de requests!)
    const interval = setInterval(() => {
      if (!document.hidden && isMounted) {
        fetchAtividades();
      }
    }, POLLING_INTERVALS.RECENT_ACTIVITY);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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
        <h3 className="text-lg font-semibold text-gray-900">Atividades Recentes</h3>
        <p className="text-sm text-gray-600 mt-1">Últimas atualizações do sistema</p>
      </div>
      <div className="p-4">
        {atividades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Inbox className="w-12 h-12 mb-3" />
            <p>Nenhuma atividade recente registrada</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {atividades.map((atividade) => (
              <ActivityItem key={atividade.id} atividade={atividade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ atividade }: { atividade: AtividadeRecente }) {
  const IconComponent = iconMap[atividade.icone as keyof typeof iconMap] || CheckCircle;
  const colorClasses = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
  };

  const iconClass = colorClasses[atividade.cor as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="flex items-start space-x-3">
      <div className={`p-2 rounded-lg ${iconClass}`}>
        <IconComponent className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{atividade.descricao}</p>
        {atividade.tripulanteNome && (
          <p className="text-xs text-gray-600 mt-0.5">
            <FuncionarioLink
              nome={atividade.tripulanteNome}
              className="font-medium hover:text-primary hover:underline"
            />{' '}
            ({atividade.tripulanteMatricula})
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {formatDistanceToNow(new Date(atividade.timestamp), {
            addSuffix: true,
            locale: ptBR,
          })}
        </p>
      </div>
    </div>
  );
}

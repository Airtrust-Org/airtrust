import { useApi } from '@/react-app/hooks/useApi';
import Card, { CardHeader, CardContent } from '@/react-app/components/Card';
import Badge from '@/react-app/components/Badge';
import PageHeader from '@/react-app/components/PageHeader';
import StatCard from '@/react-app/components/StatCard';
import ContentCard from '@/react-app/components/ContentCard';
import {
  Shield,
  Activity,
  Database,
  Server,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
} from 'lucide-react';

interface SystemHealth {
  status: string;
  checks: Array<{
    check?: string;
    module?: string;
    table?: string;
    status: string;
    details?: string;
    error?: string;
  }>;
  timestamp: string;
  environment: string;
}

interface SystemInfo {
  system: string;
  version: string;
  environment: string;
  timestamp: string;
  database_stats: Record<string, number | string>;
}

export default function Sistema() {
  const {
    data: health,
    loading: healthLoading,
    error: healthError,
  } = useApi<SystemHealth>('/api/system/health');
  const { data: systemInfo, loading: infoLoading } = useApi<SystemInfo>('/api/system/info');

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'OK':
      case 'HEALTHY':
        return CheckCircle;
      case 'FAIL':
      case 'DEGRADED':
        return XCircle;
      case 'SLOW':
      case 'WARNING':
        return AlertTriangle;
      default:
        return Activity;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status.toUpperCase()) {
      case 'OK':
      case 'HEALTHY':
        return 'success';
      case 'FAIL':
      case 'DEGRADED':
        return 'danger';
      case 'SLOW':
      case 'WARNING':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  return (
    <div>
      <PageHeader title="Sistema" subtitle="Monitoramento e status da infraestrutura AirTrust" />

      {/* Sistema Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Status Geral"
          value={healthLoading ? '...' : health?.status || 'UNKNOWN'}
          color="blue"
        />
        <StatCard
          label="Ambiente"
          value={infoLoading ? '...' : systemInfo?.environment?.toUpperCase() || 'DEV'}
          color="green"
        />
        <StatCard
          label="Versão"
          value={infoLoading ? '...' : systemInfo?.version || '1.0.0'}
          color="purple"
        />
        <StatCard
          label="Última Verificação"
          value={
            healthLoading
              ? '...'
              : health
              ? new Date(health.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '--:--'
          }
          color="yellow"
        />
      </div>

      {/* Health Checks */}
      <ContentCard>
        {healthLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
              >
                <div className="h-4 bg-neutral-200 rounded w-1/3"></div>
                <div className="h-6 bg-neutral-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : healthError ? (
          <div className="text-center py-8">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">Erro ao carregar status: {healthError}</p>
          </div>
        ) : health ? (
          <div className="space-y-3">
            {health.checks.map((check, index) => {
              const StatusIcon = getStatusIcon(check.status);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <StatusIcon
                      className={`w-5 h-5 ${
                        check.status === 'OK'
                          ? 'text-green-600'
                          : check.status === 'FAIL'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }`}
                    />
                    <div>
                      <p className="font-medium text-neutral-900">
                        {check.check || check.table || check.module || 'Verificação'}
                      </p>
                      {check.details && <p className="text-sm text-neutral-600">{check.details}</p>}
                      {check.error && <p className="text-sm text-red-600">{check.error}</p>}
                    </div>
                  </div>
                  <Badge variant={getStatusVariant(check.status)}>{check.status}</Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-neutral-500 text-center py-8">Nenhuma verificação disponível</p>
        )}
      </ContentCard>

      {/* Database Statistics */}
      <ContentCard>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
            <Database className="w-5 h-5 mr-2 text-primary" />
            Estatísticas do Banco de Dados
          </h3>
        </div>
        {infoLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse p-4 bg-neutral-50 rounded-lg">
                <div className="h-4 bg-neutral-200 rounded mb-2"></div>
                <div className="h-8 bg-neutral-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : systemInfo?.database_stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(systemInfo.database_stats).map(([table, count]) => (
              <div
                key={table}
                className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <HardDrive className="w-5 h-5 text-primary" />
                  <Badge variant="info" size="sm">
                    {typeof count === 'number' ? count : count.toString()}
                  </Badge>
                </div>
                <h4 className="font-medium text-neutral-900 capitalize">
                  {table.replace(/_/g, ' ')}
                </h4>
                <p className="text-sm text-neutral-600">registros</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500 text-center py-8">Estatísticas não disponíveis</p>
        )}
      </ContentCard>

      {/* System Information */}
      {systemInfo && (
        <ContentCard>
          <h3 className="text-lg font-semibold text-neutral-900 flex items-center mb-6">
            <Shield className="w-5 h-5 mr-2 text-purple-600" />
            Informações do Sistema
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Sistema:</span>
                <span className="text-neutral-900">{systemInfo.system}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Versão:</span>
                <span className="text-neutral-900">{systemInfo.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Ambiente:</span>
                <Badge variant={systemInfo.environment === 'production' ? 'danger' : 'info'}>
                  {systemInfo.environment}
                </Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Última Atualização:</span>
                <span className="text-neutral-900 text-sm">
                  {new Date(systemInfo.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Status de Saúde:</span>
                <Badge variant={getStatusVariant(health?.status || 'unknown')}>
                  {health?.status || 'UNKNOWN'}
                </Badge>
              </div>
            </div>
          </div>
        </ContentCard>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useApi } from '@/react-app/hooks/useApi';
import Badge from '@/react-app/components/Badge';
import PageHeader from '@/react-app/components/PageHeader';
import StatCard from '@/react-app/components/StatCard';
import ContentCard from '@/react-app/components/ContentCard';
import { Shield, Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

type HealthCheckItem = {
  status: string;
  latency?: number;
  error?: string;
};

interface SystemHealthResponse {
  success: boolean;
  status: string;
  checks: Record<string, HealthCheckItem>;
  stats: {
    timestamp: string;
    environment: string;
    version: string;
    region: string;
  };
  latency: number;
}

interface SystemVersionInfo {
  version: string;
  environment: string;
  builtAt: string | null;
  deploymentId: string;
}

export default function Sistema() {
  const {
    data: health,
    loading: healthLoading,
    error: healthError,
  } = useApi<SystemHealthResponse>('/api/health');

  const {
    data: version,
    loading: versionLoading,
    error: versionError,
  } = useApi<SystemVersionInfo>('/api/version');

  const checksList = useMemo(
    () =>
      Object.entries(health?.checks || {}).map(([name, check]) => ({
        name,
        ...check,
      })),
    [health?.checks],
  );

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'OK':
      case 'HEALTHY':
        return CheckCircle;
      case 'ERROR':
      case 'FAIL':
      case 'DEGRADED':
      case 'UNHEALTHY':
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
      case 'ERROR':
      case 'FAIL':
      case 'DEGRADED':
      case 'UNHEALTHY':
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Status Geral"
          value={healthLoading ? '...' : health?.status?.toUpperCase() || 'UNKNOWN'}
          color="blue"
        />
        <StatCard
          label="Ambiente"
          value={
            healthLoading
              ? '...'
              : health?.stats?.environment?.toUpperCase() ||
                version?.environment?.toUpperCase() ||
                'UNKNOWN'
          }
          color="green"
        />
        <StatCard
          label="Versão"
          value={versionLoading ? '...' : version?.version || health?.stats?.version || '0.0.0-dev'}
          color="purple"
        />
        <StatCard
          label="Última Verificação"
          value={
            healthLoading
              ? '...'
              : health?.stats?.timestamp
                ? new Date(health.stats.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '--:--'
          }
          color="yellow"
        />
      </div>

      <ContentCard>
        {healthLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
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
            <p className="text-red-600">Erro ao carregar /api/health: {healthError}</p>
          </div>
        ) : checksList.length > 0 ? (
          <div className="space-y-3">
            {checksList.map((check, index) => {
              const StatusIcon = getStatusIcon(check.status);
              return (
                <div
                  key={`${check.name}-${index}`}
                  className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <StatusIcon className="w-5 h-5 text-neutral-700" />
                    <div>
                      <p className="font-medium text-neutral-900 capitalize">{check.name}</p>
                      {typeof check.latency === 'number' && (
                        <p className="text-sm text-neutral-600">Latência: {check.latency}ms</p>
                      )}
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

      <ContentCard>
        <h3 className="text-lg font-semibold text-neutral-900 flex items-center mb-6">
          <Shield className="w-5 h-5 mr-2 text-purple-600" />
          Informações do Sistema
        </h3>

        {versionLoading ? (
          <p className="text-neutral-500">Carregando /api/version...</p>
        ) : versionError ? (
          <p className="text-red-600">Erro ao carregar /api/version: {versionError}</p>
        ) : version ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Sistema:</span>
                <span className="text-neutral-900">AirTrust Worker</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Versão:</span>
                <span className="text-neutral-900">{version.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Ambiente:</span>
                <Badge variant={version.environment === 'production' ? 'danger' : 'info'}>
                  {version.environment}
                </Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Build:</span>
                <span className="text-neutral-900 text-sm">
                  {version.builtAt ? new Date(version.builtAt).toLocaleString('pt-BR') : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Deployment ID:</span>
                <span className="text-neutral-900 text-sm">{version.deploymentId || 'unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-600">Status de Saúde:</span>
                <Badge variant={getStatusVariant(health?.status || 'unknown')}>
                  {health?.status || 'UNKNOWN'}
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-neutral-500">Informações de versão indisponíveis.</p>
        )}
      </ContentCard>
    </div>
  );
}

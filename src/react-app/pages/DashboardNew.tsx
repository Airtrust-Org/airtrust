import { memo } from 'react';
import { useApi } from '@/react-app/hooks/useApi';
import Badge from '@/react-app/components/Badge';
import AppLayout from '@/react-app/components/AppLayout';

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

function DashboardNew() {
  const {
    data: funcionarios,
    loading: loadingFuncionarios,
    error: errorFuncionarios,
  } = useApi<any[]>('/api/funcionarios?status=ativos&orderBy=nome&order=ASC');
  const {
    data: funcoes,
    loading: loadingFuncoes,
    error: errorFuncoes,
  } = useApi<any[]>('/api/funcoes');
  const {
    data: healthData,
    loading: loadingHealth,
    error: errorHealth,
  } = useApi<SystemHealth>('/api/sistema/health');
  const { data: qualificacoesStatsRaw } = useApi<any>('/api/dashboard/qualificacoes');

  // Extrair dados do envelope de resposta
  const qualificacoesStats = qualificacoesStatsRaw?.data || qualificacoesStatsRaw || {};

  // Converter checks de objeto para array se necessário
  const checksData = healthData?.checks;
  const checksArray = Array.isArray(checksData)
    ? checksData
    : checksData
      ? Object.entries(checksData).map(([key, value]) => ({
          check: key,
          status:
            typeof value === 'object' && value !== null && 'status' in value
              ? (value as { status: string }).status
              : 'OK',
          details:
            typeof value === 'object' && value !== null && 'latency' in value
              ? `${(value as { latency?: number }).latency}ms`
              : undefined,
        }))
      : [];

  const health = {
    status: healthData?.status || 'CHECKING',
    checks: checksArray,
    timestamp: healthData?.timestamp || new Date().toISOString(),
    environment: healthData?.environment || 'development',
  };

  return (
    <AppLayout>
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Painel de Conformidade Operacional
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Visão geral do sistema e indicadores de conformidade · Atualizado agora mesmo
        </p>
      </div>

      {/* Stats Grid - Redesenhado */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Tripulantes Ativos */}
        <div className="flex flex-col gap-2 rounded-lg p-6 border border-slate-200 bg-white">
          <p className="text-slate-600 text-base font-medium">Tripulantes Ativos</p>
          <p className="text-slate-900 tracking-tight text-2xl font-bold">
            {loadingFuncionarios ? '...' : funcionarios?.length || 0}
          </p>
        </div>

        {/* Qualificações Vencendo */}
        <div className="flex flex-col gap-2 rounded-lg p-6 border border-slate-200 bg-white">
          <p className="text-slate-600 text-base font-medium">Qualificações a Vencer</p>
          <p className="text-warning-600 tracking-tight text-2xl font-bold">
            {qualificacoesStats?.a_vencer_30_dias || 0}
          </p>
        </div>

        {/* Vencidas */}
        <div className="flex flex-col gap-2 rounded-lg p-6 border border-slate-200 bg-white">
          <p className="text-slate-600 text-base font-medium">Vencidas</p>
          <p className="text-critical-600 tracking-tight text-2xl font-bold">
            {qualificacoesStats?.vencidas || 0}
          </p>
        </div>

        {/* Demanda Futura */}
        <div className="flex flex-col gap-2 rounded-lg p-6 border border-slate-200 bg-white">
          <p className="text-slate-600 text-base font-medium">Demanda Futura (próximos 30 dias)</p>
          <p className="text-slate-900 tracking-tight text-2xl font-bold">
            {(qualificacoesStats?.renovadas || 0) + (qualificacoesStats?.a_vencer_30_dias || 0)}
          </p>
        </div>
      </div>

      {/* Gráficos de Análise */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Taxa de Conclusão de Treinamento por Mês */}
        <div className="lg:col-span-2 flex flex-col gap-4 rounded-lg border border-slate-200 p-6 bg-white">
          <div className="flex flex-col">
            <p className="text-slate-900 text-base font-medium">
              Taxa de Conclusão de Treinamento por Mês
            </p>
            <div className="flex items-baseline gap-3">
              <p className="text-slate-900 tracking-tight text-2xl font-bold">88%</p>
              <p className="text-success-600 text-sm font-medium">+2.5%</p>
            </div>
          </div>
          <div className="grid min-h-[220px] grid-flow-col gap-4 grid-rows-[1fr_auto] items-end justify-items-center px-3 pt-4">
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-slate-200 rounded-t w-3/4" style={{ height: '75%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Jan</p>
            </div>
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-slate-200 rounded-t w-3/4" style={{ height: '60%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Fev</p>
            </div>
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-slate-200 rounded-t w-3/4" style={{ height: '80%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Mar</p>
            </div>
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-primary-600 rounded-t w-3/4" style={{ height: '100%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Abr</p>
            </div>
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-slate-200 rounded-t w-3/4" style={{ height: '85%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Mai</p>
            </div>
            <div className="flex flex-col w-full h-full items-center justify-end gap-2">
              <div className="bg-slate-200 rounded-t w-3/4" style={{ height: '90%' }}></div>
              <p className="text-slate-500 text-xs font-medium">Jun</p>
            </div>
          </div>
        </div>

        {/* Demanda Futura de Treinamento */}
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-6 bg-white">
          <p className="text-slate-900 text-base font-medium">Demanda Futura de Treinamento</p>
          <div className="flex items-center justify-center min-h-[220px] my-auto">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="stroke-primary-600/70"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray="60, 100"
                  strokeWidth="3"
                />
                <path
                  className="stroke-warning-600"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray="25, 100"
                  strokeDashoffset="-60"
                  strokeWidth="3"
                />
                <path
                  className="stroke-critical-600"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray="15, 100"
                  strokeDashoffset="-85"
                  strokeWidth="3"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-slate-500 text-sm">Próx. 6 Meses</span>
                <span className="text-slate-900 text-2xl font-bold">~350</span>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-600/70"></span>
              <span className="text-slate-600">Agendados</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-warning-600"></span>
              <span className="text-slate-600">A Vencer</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-critical-600"></span>
              <span className="text-slate-600">Alto Risco</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tripulantes Recentes */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Tripulantes Recentes</h3>
          {loadingFuncionarios ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-background-light-hover rounded-lg animate-pulse"
                >
                  <div className="flex-1">
                    <div className="h-4 bg-gray-300700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200600 rounded w-1/2"></div>
                  </div>
                  <div className="h-6 bg-gray-300700 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : errorFuncionarios ? (
            <div className="text-center py-4">
              <p className="text-critical-500 mb-2">Erro ao carregar funcionários</p>
              <p className="text-sm text-text-secondary">{errorFuncionarios}</p>
            </div>
          ) : funcionarios && funcionarios.length > 0 ? (
            <div className="space-y-3">
              {funcionarios.slice(0, 5).map((funcionario: any) => (
                <div
                  key={funcionario.id}
                  className="flex items-center justify-between p-3 bg-background-light-hover rounded-lg"
                >
                  <div>
                    <p className="font-medium text-text-primary">{funcionario.nome}</p>
                    <p className="text-sm text-text-secondary">{funcionario.funcao}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={funcionario.status === 'ATIVO' ? 'success' : 'neutral'}>
                      {funcionario.status}
                    </Badge>
                    <p className="text-xs text-text-tertiary mt-1">{funcionario.base}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-center py-4">Nenhum funcionário encontrado</p>
          )}
        </div>

        {/* Health Check */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Status do Sistema</h3>
          {loadingHealth ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4 animate-pulse">
                <div className="h-4 bg-gray-300700 rounded w-24"></div>
                <div className="h-6 bg-gray-300700 rounded w-20"></div>
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-background-light-hover rounded animate-pulse"
                  >
                    <div className="h-3 bg-gray-300700 rounded w-32"></div>
                    <div className="h-6 bg-gray-300700 rounded w-12"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : errorHealth ? (
            <div className="text-center py-4">
              <p className="text-critical-500 mb-2">Erro ao carregar status</p>
              <p className="text-sm text-text-secondary">{errorHealth}</p>
            </div>
          ) : health ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-text-primary">Status Geral:</span>
                <Badge variant={health.status === 'HEALTHY' ? 'success' : 'warning'}>
                  {health.status}
                </Badge>
              </div>

              <div className="space-y-2">
                {health.checks.slice(0, 5).map((check, index) => (
                  <div
                    key={check.check || check.table || check.module || `check-${index}`}
                    className="flex items-center justify-between p-2 bg-background-light-hover rounded"
                  >
                    <span className="text-sm text-text-secondary">
                      {check.check || check.table || check.module}
                    </span>
                    <Badge
                      variant={
                        check.status === 'OK'
                          ? 'success'
                          : check.status === 'FAIL'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {check.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <p className="text-xs text-text-tertiary mt-3">
                Última verificação: {new Date(health.timestamp).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-text-secondary text-center py-4">Carregando status...</p>
          )}
        </div>
      </div>

      {/* Funções Overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Funções por Categoria</h3>
        {loadingFuncoes ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 border border-border-light rounded-lg animate-pulse">
                <div className="h-4 bg-gray-300700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200600 rounded w-full mb-2"></div>
                <div className="h-5 bg-gray-300700 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : errorFuncoes ? (
          <div className="text-center py-4">
            <p className="text-critical-500 mb-2">Erro ao carregar funções</p>
            <p className="text-sm text-text-secondary">{errorFuncoes}</p>
          </div>
        ) : funcoes && funcoes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {funcoes.map((funcao: any) => (
              <div
                key={funcao.id}
                className="p-4 border border-border-light rounded-lg bg-background-light-hover"
              >
                <h4 className="font-medium text-text-primary">{funcao.nome}</h4>
                <p className="text-sm text-text-secondary mt-1">{funcao.descricao}</p>
                <Badge variant="info" size="sm">
                  {funcao.categoria}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary text-center py-4">Nenhuma função encontrada</p>
        )}
      </div>
    </AppLayout>
  );
}

export default memo(DashboardNew);

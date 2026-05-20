/**
 * EXEMPLO DE INTEGRAÇÃO DO HOOK useQualificacoesStats
 *
 * Este é um exemplo de como usar o novo hook para exibir estatísticas
 * globais de qualificações no dashboard.
 *
 * Você pode aplicar este padrão em:
 * - /src/react-app/pages/Dashboard.tsx (principal)
 * - /src/react-app/pages/qualificacoes/Dashboard.tsx
 * - Ou qualquer outro componente que exiba cards de estatísticas
 */

import React from 'react';
import { useQualificacoesStats } from './src/react-app/hooks/useQualificacoesStats';

export function DashboardComStatsGlobais() {
  const { stats, loading, error, refresh } = useQualificacoesStats();

  // Estado de loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Carregando estatísticas globais...</p>
        </div>
      </div>
    );
  }

  // Estado de erro
  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8 max-w-2xl mx-auto">
        <div className="text-center">
          <span className="text-6xl mb-4 block">❌</span>
          <h2 className="text-xl font-bold text-red-900 mb-2">Erro ao Carregar Estatísticas</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={refresh}
            className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  // Estado sem dados
  if (!stats) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p className="text-lg">Nenhuma estatística disponível</p>
      </div>
    );
  }

  // Calcular percentuais
  const percentualValidas = stats.total > 0 ? (stats.validas / stats.total) * 100 : 0;
  const percentualVencendo = stats.total > 0 ? (stats.vencendo / stats.total) * 100 : 0;
  const percentualVencidas = stats.total > 0 ? (stats.vencidas / stats.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header com botão refresh */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Estatísticas de Qualificações</h2>
          <p className="text-gray-600 mt-1">Visão global de todos os registros ativos</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span>
          <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
      </div>

      {/* Grid de Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card Total */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-medium uppercase opacity-90">Total</h3>
            <span className="text-4xl">📊</span>
          </div>
          <p className="text-5xl font-bold mb-2">{stats.total.toLocaleString('pt-BR')}</p>
          <p className="text-xs opacity-80">Qualificações no sistema</p>
        </div>

        {/* Card Válidas */}
        <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-medium uppercase opacity-90">Válidas</h3>
            <span className="text-4xl">✅</span>
          </div>
          <p className="text-5xl font-bold mb-2">{stats.validas.toLocaleString('pt-BR')}</p>
          <p className="text-xs opacity-80">{percentualValidas.toFixed(1)}% do total</p>
        </div>

        {/* Card Vencendo */}
        <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-medium uppercase opacity-90">Vencendo</h3>
            <span className="text-4xl">⚠️</span>
          </div>
          <p className="text-5xl font-bold mb-2">{stats.vencendo.toLocaleString('pt-BR')}</p>
          <p className="text-xs opacity-80">Próximos 30 dias ({percentualVencendo.toFixed(1)}%)</p>
        </div>

        {/* Card Vencidas */}
        <div className="bg-gradient-to-br from-red-500 to-red-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-medium uppercase opacity-90">Vencidas</h3>
            <span className="text-4xl">❌</span>
          </div>
          <p className="text-5xl font-bold mb-2">{stats.vencidas.toLocaleString('pt-BR')}</p>
          <p className="text-xs opacity-80">
            Requerem ação urgente ({percentualVencidas.toFixed(1)}%)
          </p>
        </div>
      </div>

      {/* Barra de Progresso Visual */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Geral do Compliance</h3>

        {/* Barra de progresso */}
        <div className="relative h-12 bg-gray-200 rounded-full overflow-hidden shadow-inner">
          <div
            className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-500 ease-out"
            style={{ width: `${percentualValidas}%` }}
          />
          <div
            className="absolute top-0 h-full bg-yellow-500 transition-all duration-500 ease-out"
            style={{
              left: `${percentualValidas}%`,
              width: `${percentualVencendo}%`,
            }}
          />
          <div
            className="absolute top-0 h-full bg-red-500 transition-all duration-500 ease-out"
            style={{
              left: `${percentualValidas + percentualVencendo}%`,
              width: `${percentualVencidas}%`,
            }}
          />
        </div>

        {/* Legenda */}
        <div className="flex justify-between mt-4 text-sm font-medium">
          <span className="text-green-700 flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
            {percentualValidas.toFixed(1)}% Válidas
          </span>
          <span className="text-yellow-700 flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full"></span>
            {percentualVencendo.toFixed(1)}% Vencendo
          </span>
          <span className="text-red-700 flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
            {percentualVencidas.toFixed(1)}% Vencidas
          </span>
        </div>
      </div>

      {/* Card Renovadas (se houver) */}
      {stats.renovadas > 0 && (
        <div className="bg-gradient-to-r from-purple-100 to-purple-200 rounded-xl shadow-md p-6 border-l-4 border-purple-600">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-700 font-semibold mb-1">Renovadas</h3>
              <p className="text-4xl font-bold text-purple-700">
                {stats.renovadas.toLocaleString('pt-BR')}
              </p>
            </div>
            <span className="text-6xl">🔄</span>
          </div>
          <p className="text-sm text-gray-600 mt-3">Qualificações com histórico de renovação</p>
        </div>
      )}

      {/* Debug Info (remover em produção) */}
      <details className="bg-gray-50 rounded-lg p-4 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-700 mb-2">
          🔍 Debug Info (dados brutos)
        </summary>
        <pre className="bg-gray-800 text-green-400 p-3 rounded overflow-auto">
          {JSON.stringify(stats, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/**
 * INSTRUÇÕES DE USO:
 *
 * 1. Importe este componente no seu Dashboard principal:
 *
 *    import { DashboardComStatsGlobais } from './EXEMPLO_INTEGRACAO_STATS_DASHBOARD';
 *
 * 2. Renderize no lugar dos cards existentes:
 *
 *    export function Dashboard() {
 *      return (
 *        <div className="p-6">
 *          <DashboardComStatsGlobais />
 *          // ... resto do conteúdo
 *        </div>
 *      );
 *    }
 *
 * 3. Ou copie apenas as partes que você precisa (cards, barra de progresso, etc.)
 *
 * 4. IMPORTANTE: Remova o bloco "Debug Info" em produção
 *
 * 5. Verifique o console do navegador para logs:
 *    📊 [useQualificacoesStats] Buscando de /api/qualificacoes/historico/stats...
 *    📊 [useQualificacoesStats] Resposta completa: {...}
 *    ✅ [useQualificacoesStats] Stats recebidos: {total: 617, validas: 505, ...}
 */

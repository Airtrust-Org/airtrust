import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { getAccessToken } from '@/react-app/config/api';

interface LogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  context: {
    requestId: string;
    userId?: number;
    userEmail?: string;
    environment: string;
    timestamp: string;
    module: string;
  };
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      // Tentar endpoint real; fallback para mock se não disponível
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/admin/logs?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setLogs(data.data);
          setLoading(false);
          return;
        }
      }

      // Fallback: mock data (endpoint ainda não implementado no backend)
      const mockLogs: LogEntry[] = [
      const mockLogs: LogEntry[] = [
        {
          level: 'INFO',
          message: 'Request de importação recebida',
          context: {
            requestId: '550e8400-e29b-41d4-a716-446655440000',
            userId: 1,
            userEmail: 'filipe@airtrust.com',
            environment: 'production',
            timestamp: new Date().toISOString(),
            module: 'ImportacaoRoute',
          },
          data: {
            entidade: 'qualificacoes_tipos',
            modo: 'UPSERT',
            total_linhas: 38,
          },
          duration: 0,
        },
        {
          level: 'ERROR',
          message: 'Erro ao processar CPF',
          context: {
            requestId: '550e8400-e29b-41d4-a716-446655440000',
            userId: 1,
            userEmail: 'filipe@airtrust.com',
            environment: 'production',
            timestamp: new Date(Date.now() - 1000).toISOString(),
            module: 'FuncionarioImportacao',
          },
          data: {
            linha: 5,
            cpf_original: '123.456.789-00',
          },
          error: {
            name: 'ValidationError',
            message: 'CPF inválido',
            stack: 'ValidationError: CPF inválido\n    at validateCPF (cpf.ts:42:11)',
          },
          duration: 234,
        },
      ];
      setLogs(mockLogs);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesText =
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      log.context.module.toLowerCase().includes(filter.toLowerCase());
    const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter;
    return matchesText && matchesLevel;
  });

  const levelColors = {
    DEBUG: 'bg-gray-100 text-gray-700 border-gray-300',
    INFO: 'bg-blue-100 text-blue-700 border-blue-300',
    WARN: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    ERROR: 'bg-red-100 text-red-700 border-red-300',
    FATAL: 'bg-purple-100 text-purple-700 border-purple-300',
  };

  const levelIcons = {
    DEBUG: '🔍',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    FATAL: '💀',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">📋 Logs do Sistema</h1>
        <p className="text-gray-600">
          Monitore e analise logs estruturados do backend em tempo real
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="🔍 Buscar nos logs (mensagem, módulo, request ID...)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="md:w-64">
          <select
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="ALL">📊 Todos os níveis</option>
            <option value="DEBUG">🔍 DEBUG</option>
            <option value="INFO">ℹ️ INFO</option>
            <option value="WARN">⚠️ WARN</option>
            <option value="ERROR">❌ ERROR</option>
            <option value="FATAL">💀 FATAL</option>
          </select>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '🔄 Carregando...' : '🔄 Atualizar'}
        </button>
      </div>

      {/* Status */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''} encontrado
          {filteredLogs.length !== 1 ? 's' : ''}
          {logs.length !== filteredLogs.length && ` (${logs.length} total)`}
        </div>
        <div className="flex gap-2 text-sm">
          {Object.entries(levelIcons).map(([level, icon]) => {
            const count = logs.filter((l) => l.level === level).length;
            return count > 0 ? (
              <span key={level} className="px-2 py-1 bg-gray-100 rounded">
                {icon} {count}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Lista de Logs */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-gray-600">
              {filter || levelFilter !== 'ALL'
                ? 'Nenhum log encontrado com os filtros aplicados'
                : 'Nenhum log disponível'}
            </div>
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div
              key={idx}
              className={`p-5 rounded-lg border-2 ${
                levelColors[log.level]
              } transition-all hover:shadow-md`}
            >
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{levelIcons[log.level]}</span>
                  <div>
                    <div className="font-mono text-sm font-bold">
                      [{log.level}] {log.context.module}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {new Date(log.context.timestamp).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                {log.duration !== undefined && (
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      log.duration > 1000
                        ? 'bg-red-200 text-red-800'
                        : log.duration > 500
                        ? 'bg-yellow-200 text-yellow-800'
                        : 'bg-green-200 text-green-800'
                    }`}
                  >
                    ⏱️ {log.duration}ms
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="font-semibold text-lg mb-3">{log.message}</div>

              {/* Context */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white px-2 py-1 rounded border">
                    🆔 {log.context.requestId.slice(0, 8)}...
                  </span>
                </div>
                {log.context.userEmail && (
                  <div className="flex items-center gap-2">
                    <span>👤</span>
                    <span className="text-xs">
                      {log.context.userEmail} (ID: {log.context.userId})
                    </span>
                  </div>
                )}
              </div>

              {/* Data */}
              {log.data && Object.keys(log.data).length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold hover:text-gray-700 select-none">
                    📊 Dados ({Object.keys(log.data).length} campos) - clique para expandir
                  </summary>
                  <pre className="mt-2 p-3 bg-white rounded text-xs overflow-auto border">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </details>
              )}

              {/* Error */}
              {log.error && (
                <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                  <div className="font-bold text-red-700 mb-1">💥 {log.error.name}</div>
                  <div className="text-sm text-red-600 mb-2">{log.error.message}</div>
                  {log.error.stack && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold hover:text-red-700 select-none">
                        Stack trace
                      </summary>
                      <pre className="mt-2 text-xs overflow-auto max-h-48">{log.error.stack}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div className="text-sm text-blue-800">
            <div className="font-semibold mb-1">Dica: Integração com GitHub Copilot</div>
            <div>
              Para debug mais rápido, copie o log completo (clique no card → selecione tudo) e cole
              no Copilot com:{' '}
              <code className="bg-blue-100 px-1">@workspace Copilot, veja este erro: [LOG]</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

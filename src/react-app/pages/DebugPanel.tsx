import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Trash2, Copy, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';

interface RequestLog {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status: string;
  responseTime: number;
  dataCount: number;
  hasError: boolean;
  errorMessage?: string;
  response?: Record<string, unknown>;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export default function DebugPanel() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [apiUrl, setApiUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>(
    'checking',
  );

  useEffect(() => {
    const url = API_BASE_URL.replace('/api', '');
    setApiUrl(url);

    // Test connection
    const handleTest = async () => {
      try {
        const response = await fetch(`${url}/api/qualificacoes?limit=1`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          addLog(
            'PING',
            'GET',
            `${response.status} ${response.statusText}`,
            [],
            0,
            true,
            `HTTP ${response.status}`,
          );
        }
      } catch (error) {
        setConnectionStatus('error');
        addLog('PING', 'GET', 'Connection Error', [], 0, true, (error as Error).message);
      }
    };

    handleTest();

    // Auto-refresh desabilidado por padrão para evitar excesso de requests
    // Remova este comentário se precisar re-ativar
    if (autoRefresh && false) {
      const interval = setInterval(() => {
        handleTest();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const testConnection = async (url: string) => {
    try {
      const response = await fetch(`${url}/api/qualificacoes?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setConnectionStatus('connected');
        await fetchDiagnosticData(url);
      } else {
        setConnectionStatus('error');
        addLog(
          'PING',
          'GET',
          `${response.status} ${response.statusText}`,
          [],
          0,
          true,
          `HTTP ${response.status}`,
        );
      }
    } catch (error) {
      setConnectionStatus('error');
      addLog('PING', 'GET', 'Connection Error', [], 0, true, (error as Error).message);
    }
  };

  const fetchDiagnosticData = async (url: string) => {
    const endpoints = [
      { name: 'qualificacoes', path: '/api/qualificacoes?limit=5' },
      {
        name: 'funcionarios',
        path: '/api/funcionarios?status=ativos&orderBy=nome&order=ASC&limit=5',
      },
      { name: 'qualificacoes-historico', path: '/api/qualificacoes-historico?limit=5' },
      { name: 'simuladores', path: '/api/simuladores?limit=5' },
      { name: 'sessoes', path: '/api/sessoes?limit=5' },
    ];

    for (const endpoint of endpoints) {
      try {
        const startTime = performance.now();
        const response = await fetch(`${url}${endpoint.path}`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const endTime = performance.now();

        const data = (await response.json()) as Record<string, unknown>;
        const responseTime = Math.round(endTime - startTime);
        const dataCount = (data.data as unknown[])?.length || 0;
        const hasError = !response.ok || !(data as Record<string, boolean>).success;

        addLog(
          endpoint.name.toUpperCase(),
          'GET',
          `${response.status}`,
          Array.from(response.headers.entries()),
          responseTime,
          hasError,
          hasError ? (data.error as string) || 'Unknown error' : undefined,
          data,
        );
      } catch (error) {
        addLog(endpoint.name.toUpperCase(), 'GET', 'ERROR', [], 0, true, (error as Error).message);
      }
    }
  };

  const addLog = (
    endpoint: string,
    method: string,
    status: string,
    responseHeaders: Array<[string, string]>,
    responseTime: number,
    hasError: boolean,
    errorMessage?: string,
    response?: Record<string, unknown>,
  ) => {
    const newLog: RequestLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      endpoint,
      method,
      status,
      responseTime,
      dataCount: (response?.data as unknown[])?.length || 0,
      hasError,
      errorMessage,
      response,
      responseHeaders: Object.fromEntries(responseHeaders.filter(([, v]) => v !== null)),
    };

    setLogs((prev) => [newLog, ...prev.slice(0, 19)]); // Keep last 20
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-1/2 max-h-[600px] bg-gray-900 border-t border-l border-gray-700 text-white z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-bold">🔧 Debug Panel</h3>
          <span className="text-xs bg-gray-700 px-2 py-1 rounded">
            {connectionStatus === 'connected' ? (
              <span className="text-green-400">✓ Connected</span>
            ) : connectionStatus === 'checking' ? (
              <span className="text-yellow-400">⏳ Checking...</span>
            ) : (
              <span className="text-red-400">✗ Error</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs flex items-center gap-1">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3 h-3"
            />
            Auto
          </label>
          <button
            onClick={() => testConnection(apiUrl)}
            className="p-1 hover:bg-gray-700 rounded"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={clearLogs}
            className="p-1 hover:bg-gray-700 rounded"
            title="Clear"
            aria-label="Clear logs"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* API URL Display */}
      <div className="bg-gray-850 border-b border-gray-700 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-gray-400">API:</span>
          <code className="flex-1 bg-gray-900 p-1 rounded text-green-400 truncate">{apiUrl}</code>
          <button
            onClick={() => copyToClipboard(apiUrl)}
            className="p-1 hover:bg-gray-700 rounded"
            title="Copy"
            aria-label="Copy API URL"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p>Nenhuma requisição ainda</p>
              <p className="text-xs mt-1">Aguardando tráfego de dados...</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {logs.map((log) => (
              <div key={log.id} className="border-b border-gray-700 hover:bg-gray-800 transition">
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full text-left p-2 text-xs flex items-center justify-between hover:bg-gray-800"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {expandedId === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span
                      className={`font-mono font-bold min-w-[120px] ${
                        log.hasError ? 'text-red-400' : 'text-green-400'
                      }`}
                    >
                      {log.endpoint}
                    </span>
                    <span className="text-gray-500">{log.method}</span>
                    <span
                      className={`px-1 rounded text-xs font-mono ${
                        log.status.startsWith('2')
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="text-gray-500">{log.responseTime}ms</span>
                    {log.dataCount > 0 && (
                      <span className="text-blue-400 text-xs">({log.dataCount} items)</span>
                    )}
                  </div>
                  <span className="text-gray-600 text-xs">{log.timestamp}</span>
                </button>

                {expandedId === log.id && (
                  <div className="bg-gray-800 border-t border-gray-700 p-2 text-xs space-y-2">
                    {log.errorMessage && (
                      <div className="bg-red-900/30 border border-red-700 p-2 rounded text-red-300">
                        ⚠️ {log.errorMessage}
                      </div>
                    )}

                    {log.response && (
                      <div>
                        <div className="text-gray-400 font-semibold mb-1">Response:</div>
                        <pre className="bg-gray-900 p-1 rounded overflow-x-auto text-gray-300 max-h-[200px] overflow-y-auto">
                          {JSON.stringify(log.response, null, 2).slice(0, 500)}
                        </pre>
                      </div>
                    )}

                    {log.responseHeaders && Object.keys(log.responseHeaders).length > 0 && (
                      <div>
                        <div className="text-gray-400 font-semibold mb-1">Headers:</div>
                        <div className="bg-gray-900 p-1 rounded space-y-1 max-h-[100px] overflow-y-auto">
                          {Object.entries(log.responseHeaders).map(([key, value]) => (
                            <div key={key} className="text-gray-400">
                              <span className="text-purple-300">{key}:</span>{' '}
                              <span className="text-gray-300">{String(value).slice(0, 50)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 px-3 py-2 text-xs text-gray-500">
        {logs.length} requisição(ões) monitorada(s)
      </div>
    </div>
  );
}

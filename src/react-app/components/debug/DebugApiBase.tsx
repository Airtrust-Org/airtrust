import React from 'react';
import { API_BASE_URL } from '@/react-app/config/api';

interface HistoricoHealth {
  success: boolean;
  data?: {
    table_exists: boolean;
    total_records: number;
    schema_columns: number;
    timestamp: string;
  };
  error?: string;
}

export const DebugApiBase: React.FC = () => {
  const [health, setHealth] = React.useState<HistoricoHealth | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      try {
        // Tenta health do histórico; se protegido sem token, retornará erro
        const res = await fetch(`${API_BASE_URL}/qualificacoes/historico/health`, {
          headers: { Authorization: 'Bearer dev-bypass', 'X-Dev-Auth-Bypass': '1' },
        });
        const json = (await res.json()) as HistoricoHealth;
        if (!ignore) setHealth(json);
      } catch (e) {
        if (!ignore) setHealth({ success: false, error: (e as Error).message } as HistoricoHealth);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999 }}>
      <div className="text-[10px] font-mono bg-black/80 text-white p-2 rounded shadow-lg space-y-1 max-w-xs">
        <div>API_BASE_URL:</div>
        <div className="truncate" title={API_BASE_URL}>
          {API_BASE_URL}
        </div>
        {loading && <div>health: carregando...</div>}
        {!loading && health && (
          <div>
            {health.success ? (
              <>
                <div>historico.total: {health.data?.total_records ?? '∅'}</div>
                <div>historico.exists: {String(health.data?.table_exists)}</div>
              </>
            ) : (
              <div className="text-red-400">erro: {health.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugApiBase;

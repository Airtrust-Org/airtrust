import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';

export function HardRefreshButton() {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Revalidar o frontend sem apagar autenticação, IndexedDB,
      // matrículas SCORM ou os dados offline do Pilot App.
      await hardRefreshApp();
    } catch (error) {
      console.error('[Refresh] Falha ao atualizar a aplicação:', error);
      toast.warning('Não foi possível atualizar o AirTrust. Tente recarregar a página.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-900">Atualizar AirTrust</h3>
          <p className="text-sm text-yellow-800 mt-1">
            Recarrega a versão mais recente sem apagar sua sessão, dados de treinamento
            ou conteúdo offline do Pilot App.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar sem apagar dados'}
          </button>
        </div>
      </div>
    </div>
  );
}

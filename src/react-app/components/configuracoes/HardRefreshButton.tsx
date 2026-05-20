import { useState } from 'react';
import { toast } from 'sonner';

import { RefreshCw, Trash2, AlertCircle } from 'lucide-react';

export function HardRefreshButton() {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleHardRefresh = async () => {
    setLoading(true);

    try {
      localStorage.clear();

      sessionStorage.clear();

      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      if ('indexedDB' in window) {
        try {
          const databases = await indexedDB.databases();
          await Promise.all(
            databases.map((db) => {
              if (db.name) {
                return new Promise((resolve) => {
                  const request = indexedDB.deleteDatabase(db.name!);
                  request.onsuccess = () => resolve(true);
                  request.onerror = () => resolve(false);
                });
              }
              return Promise.resolve(false);
            })
          );
        } catch (e) {
          console.warn('IndexedDB cleanup failed:', e);
        }
      }

      
      const timestamp = Date.now();
      const url = new URL(window.location.href);
      url.searchParams.set('_t', timestamp.toString());
      
      window.location.replace(url.toString());
      
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.error('❌ Erro ao limpar cache:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.warning(`Erro ao limpar cache: ${message}\n\nTente fechar e reabrir o navegador.`);
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-900">Hard Refresh</h3>
          <p className="text-sm text-yellow-800 mt-1">
            Se você não está vendo as mudanças recentes no sistema, clique aqui para limpar TODO o cache do navegador e recarregar a página.
          </p>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Limpar Cache e Recarregar
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-yellow-900">⚠️ Tem certeza? Isso irá:</p>
              <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                <li>Limpar LocalStorage e SessionStorage</li>
                <li>Apagar todos os cookies</li>
                <li>Desregistrar Service Workers</li>
                <li>Limpar Cache API do navegador</li>
                <li>Apagar IndexedDB</li>
                <li>Recarregar a página com cache bypass</li>
              </ul>

              <div className="flex gap-2">
                <button
                  onClick={handleHardRefresh}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Limpando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Sim, Limpar Tudo
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  disabled={loading}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

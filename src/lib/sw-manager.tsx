/**
 * Service Worker Manager para AirTrust
 *
 * Responsabilidades:
 * 1. Registrar SW na inicialização do app
 * 2. Ouvir mensagens de "update available"
 * 3. Oferecer reload ao usuário (toast)
 * 4. Monitorar versão do manifest.json (fallback se SW não funcionar)
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

interface ServiceWorkerUpdateEvent {
  type: 'AIRTRUST_UPDATE_AVAILABLE';
  version: string;
  message: string;
}

function shouldBypassServiceWorkerForPath(pathname: string): boolean {
  return /^\/lms\/player\//.test(pathname);
}

async function unregisterServiceWorkersAndCaches(): Promise<void> {
  await clearAllCaches();
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));
}

/**
 * Hook: registra SW e monitora atualizações
 */
export function useServiceWorkerUpdates(): void {
  useEffect(() => {
    if (shouldBypassServiceWorkerForPath(window.location.pathname)) {
      void unregisterServiceWorkersAndCaches();
      return;
    }

    const recoverKey = `airtrust-runtime-recover:${window.location.pathname}`;
    let recovering = false;

    const isRecoverableRuntimeError = (value: unknown): boolean => {
      const text = String(value ?? '').toLowerCase();
      return (
        text.includes('chunkloaderror') ||
        text.includes('loading chunk') ||
        text.includes('failed to fetch dynamically imported module') ||
        text.includes('importing a module script failed') ||
        (text.includes('javascript mime') && text.includes('text/html')) ||
        text.includes('not a valid javascript mime type')
      );
    };

    const recoverRuntime = async (reason: string) => {
      if (recovering) return;
      if (sessionStorage.getItem(recoverKey) === '1') return;
      recovering = true;
      sessionStorage.setItem(recoverKey, '1');

      try {
        await clearAllCaches();
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((reg) => reg.unregister()));
        }
      } catch {
        // Mesmo com falha na limpeza, seguimos para reload.
      }

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('runtime_recover', Date.now().toString());
      nextUrl.searchParams.set('reason', reason);
      window.location.replace(nextUrl.toString());
    };

    const onWindowError = (event: ErrorEvent) => {
      if (isRecoverableRuntimeError(event.error?.message || event.message)) {
        void recoverRuntime('window_error');
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? `${reason.message}\n${reason.stack || ''}`
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      if (isRecoverableRuntimeError(msg)) {
        void recoverRuntime('unhandled_rejection');
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Registrar SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('[App] Service Worker registrado:', registration);

          // Ouvir updates do SW
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // SW novo pronto, controler ativo → notificar
                showUpdateNotification();
              }
            });
          });

          // Ouvir mensagens do SW
          navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as ServiceWorkerUpdateEvent;
            if (data.type === 'AIRTRUST_UPDATE_AVAILABLE') {
              console.log('[App] Update disponível:', data);
              showUpdateNotification();
            }
          });
        })
        .catch((error) => {
          console.warn('[App] Erro registrando SW:', error);
        });
    }

    // Fallback: monitorar manifest.json a cada 60 minutos (era 1 minuto - muito agressivo!)
    const manifestCheckInterval = setInterval(
      () => {
        checkManifestVersion();
      },
      60 * 60 * 1000,
    ); // A cada 60 minutos

    return () => {
      clearInterval(manifestCheckInterval);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}

/**
 * Registrar SW (chamada isolada)
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers não suportado');
    return null;
  }

  if (shouldBypassServiceWorkerForPath(window.location.pathname)) {
    console.log('[SW] Desabilitado para rota LMS player');
    await unregisterServiceWorkersAndCaches();
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    console.log('[SW] Registrado com sucesso:', registration);
    return registration;
  } catch (error) {
    console.error('[SW] Erro ao registrar:', error);
    return null;
  }
}

/**
 * Forçar reload do cliente após novo SW estar pronto
 */
export function skipWaitingAndReload(): void {
  if (navigator.serviceWorker.controller) {
    // Enviar mensagem para SW pular espera
    navigator.serviceWorker.controller.postMessage({
      type: 'SKIP_WAITING',
    });

    // Aguardar controlador mudar (novo SW assume controle)
    let reloadCount = 0;
    const reloadCheckInterval = setInterval(() => {
      reloadCount++;
      if (!navigator.serviceWorker.controller || reloadCount > 30) {
        clearInterval(reloadCheckInterval);
        window.location.reload();
      }
    }, 100);
  } else {
    // Sem SW ativo, reload direto
    window.location.reload();
  }
}

/**
 * Limpar todos os caches (útil para reset manual)
 */
export async function clearAllCaches(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => name.startsWith('airtrust-')).map((name) => caches.delete(name)),
  );
  console.log('[App] Caches limpos');

  // Informar SW também
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_CACHE',
    });
  }
}

/**
 * Monitorar versão do manifest.json como fallback
 * Se mudou, forçar reload
 */
async function checkManifestVersion(): Promise<void> {
  try {
    const response = await fetch('/manifest.json?v=' + Date.now());
    if (!response.ok) return;

    const manifest = (await response.json()) as Record<string, unknown>;
    const currentVersion = sessionStorage.getItem('airtrust-manifest-version');
    const newVersion = JSON.stringify(manifest);

    if (currentVersion && currentVersion !== newVersion) {
      console.log('[App] Manifest mudou, reload necessário');
      showUpdateNotification();
    }

    sessionStorage.setItem('airtrust-manifest-version', newVersion);
  } catch (error) {
    console.warn('[App] Erro checando manifest:', error);
  }
}

/**
 * Notificar usuário de update com opção de reload
 */
function showUpdateNotification(): void {
  const toastId = `sw-update-${Date.now()}`;

  toast.custom(
    () => (
      <div className="flex flex-col gap-3 bg-white rounded-lg border border-gray-200 p-4 shadow-lg">
        <p className="font-semibold text-sm text-gray-900">Nova versao do AirTrust disponivel</p>
        <p className="text-xs text-gray-600">
          Clique em &quot;Atualizar&quot; para recarregar com as últimas melhorias.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => toast.dismiss(toastId)}
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300 transition"
          >
            Depois
          </button>
          <button
            onClick={() => {
              toast.dismiss(toastId);
              skipWaitingAndReload();
            }}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-medium transition"
          >
            Atualizar Agora
          </button>
        </div>
      </div>
    ),
    {
      duration: Infinity, // Mantém até usuário clicar
      position: 'bottom-right',
    },
  );
}

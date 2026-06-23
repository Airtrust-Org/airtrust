/**
 * Service Worker Manager para AirTrust
 *
 * Responsabilidades:
 * 1. Registrar SW na inicialização do app
 * 2. Ouvir mensagens de "update available"
 * 3. Oferecer reload ao usuário (toast)
 * 4. Monitorar a versão real servida em index.html (fallback se SW não funcionar)
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';
import {
  fetchServedFrontendVersion,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';

interface ServiceWorkerUpdateEvent {
  type: 'AIRTRUST_UPDATE_AVAILABLE';
  version: string;
  message: string;
}

const FRONTEND_VERSION_STORAGE_KEY = 'airtrust-frontend-version';
const LOGIN_CACHE_RECOVERY_SESSION_KEY = 'airtrust-login-cache-recovery-v3';
const LOGIN_CACHE_RECOVERY_QUERY_PARAM = 'airtrust_login_recovered';

function shouldBypassServiceWorkerForPath(pathname: string): boolean {
  return /^\/lms\/player\//.test(pathname);
}

function isLoginPath(pathname: string): boolean {
  return pathname === '/login';
}

async function unregisterServiceWorkersAndCaches(): Promise<void> {
  await clearAllCaches();
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));
}

async function updateServiceWorkerRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (!('serviceWorker' in navigator)) return [];

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.update().catch(() => undefined)));
  return registrations;
}

async function ensureKillSwitchRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    await registration.update().catch(() => undefined);
    return registration;
  } catch (error) {
    console.warn('[SW] Falha ao registrar kill switch:', error);
    return null;
  }
}

function cleanupLoginRecoveryQueryParam(): boolean {
  if (!isLoginPath(window.location.pathname)) return false;

  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(LOGIN_CACHE_RECOVERY_QUERY_PARAM)) return false;

  currentUrl.searchParams.delete(LOGIN_CACHE_RECOVERY_QUERY_PARAM);
  window.history.replaceState(window.history.state, document.title, currentUrl.toString());
  return true;
}

async function recoverLoginPageFromLegacyCaches(): Promise<void> {
  if (!isLoginPath(window.location.pathname)) return;

  const recoveredFromQueryParam = cleanupLoginRecoveryQueryParam();

  const cacheNames = await caches.keys();
  const airTrustCacheNames = cacheNames.filter((name) => name.startsWith('airtrust-'));
  const registrations = await updateServiceWorkerRegistrations();
  const hasController = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
  const shouldReloadOnce = hasController || airTrustCacheNames.length > 0 || registrations.length > 0;

  await ensureKillSwitchRegistration();
  await clearAllCaches();

  if (recoveredFromQueryParam) {
    await unregisterServiceWorkersAndCaches();
    sessionStorage.removeItem(LOGIN_CACHE_RECOVERY_SESSION_KEY);
    return;
  }

  if (!shouldReloadOnce) {
    sessionStorage.removeItem(LOGIN_CACHE_RECOVERY_SESSION_KEY);
    return;
  }

  if (sessionStorage.getItem(LOGIN_CACHE_RECOVERY_SESSION_KEY) === '1') {
    return;
  }

  sessionStorage.setItem(LOGIN_CACHE_RECOVERY_SESSION_KEY, '1');
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(LOGIN_CACHE_RECOVERY_QUERY_PARAM, '1');

  if (registrations.length > 0 || hasController || airTrustCacheNames.length > 0) {
    window.location.replace(nextUrl.toString());
  }
}

/**
 * Hook: registra SW e monitora atualizações
 */
export function useServiceWorkerUpdates(): void {
  useEffect(() => {
    if (isLoginPath(window.location.pathname)) {
      void recoverLoginPageFromLegacyCaches();
      return;
    }

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

    const currentVersion = readServedFrontendVersionFromDocument();
    if (currentVersion) {
      sessionStorage.setItem(FRONTEND_VERSION_STORAGE_KEY, currentVersion);
    }

    // Fallback: monitorar a versão do index.html servido a cada 60 minutos
    const manifestCheckInterval = setInterval(
      () => {
        checkServedFrontendVersion();
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
    await updateServiceWorkerRegistrations();
    const registration = await ensureKillSwitchRegistration();
    if (!registration) return null;

    if (isLoginPath(window.location.pathname)) {
      await clearAllCaches();
    }

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
    navigator.serviceWorker.controller.postMessage({
      type: 'SKIP_WAITING',
    });
  }
  void hardRefreshApp();
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
 * Monitorar a versão servida do frontend como fallback
 * Se mudou, forçar reload
 */
async function checkServedFrontendVersion(): Promise<void> {
  try {
    const currentVersion =
      sessionStorage.getItem(FRONTEND_VERSION_STORAGE_KEY) ||
      readServedFrontendVersionFromDocument();
    const newVersion = await fetchServedFrontendVersion();
    if (!newVersion) return;

    if (currentVersion && currentVersion !== newVersion) {
      console.log('[App] Versão servida mudou, reload necessário');
      showUpdateNotification();
    }

    sessionStorage.setItem(FRONTEND_VERSION_STORAGE_KEY, newVersion);
  } catch (error) {
    console.warn('[App] Erro checando versão servida:', error);
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

/**
 * Service Worker cleanup manager para AirTrust.
 *
 * Responsabilidades:
 * 1. Nunca registrar novos service workers no app
 * 2. Desregistrar service workers existentes
 * 3. Limpar caches AirTrust legados
 * 4. Oferecer um unico reload defensivo no login quando houver runtime legado preso
 * 5. Monitorar a versao servida em index.html como fallback de atualizacao
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';
import {
  fetchServedFrontendVersion,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';

const FRONTEND_VERSION_STORAGE_KEY = 'airtrust-frontend-version';
const LOGIN_CACHE_RECOVERY_SESSION_KEY = 'airtrust-login-cache-recovery-v4';
const LOGIN_CACHE_RECOVERY_QUERY_PARAM = 'airtrust_login_recovered';

function shouldBypassCleanupForPath(pathname: string): boolean {
  return /^\/lms\/player\//.test(pathname);
}

function isLoginPath(pathname: string): boolean {
  return pathname === '/login';
}

function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export async function clearAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => name.startsWith('airtrust-')).map((name) => caches.delete(name)),
  );
  console.log('[SW] Caches AirTrust limpos');
}

async function unregisterExistingServiceWorkers(): Promise<ServiceWorkerRegistration[]> {
  if (!isServiceWorkerSupported()) return [];

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  console.log('[SW] Service workers antigos removidos:', registrations.length);
  return registrations;
}

async function cleanupLegacyServiceWorkers(): Promise<{
  hadController: boolean;
  registrations: ServiceWorkerRegistration[];
  cacheNames: string[];
}> {
  const cacheNames = typeof caches !== 'undefined' ? await caches.keys() : [];
  const airTrustCacheNames = cacheNames.filter((name) => name.startsWith('airtrust-'));
  const hadController = isServiceWorkerSupported() && navigator.serviceWorker.controller !== null;
  const registrations = await unregisterExistingServiceWorkers();

  await clearAllCaches();

  return {
    hadController,
    registrations,
    cacheNames: airTrustCacheNames,
  };
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
  const { hadController, registrations, cacheNames } = await cleanupLegacyServiceWorkers();
  const shouldReloadOnce = hadController || registrations.length > 0 || cacheNames.length > 0;

  if (recoveredFromQueryParam) {
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
  window.location.replace(nextUrl.toString());
}

/**
 * Hook mantido apenas para limpeza defensiva e monitoramento de versao.
 */
export function useServiceWorkerUpdates(): void {
  useEffect(() => {
    if (isLoginPath(window.location.pathname)) {
      void recoverLoginPageFromLegacyCaches();
      return;
    }

    if (shouldBypassCleanupForPath(window.location.pathname)) {
      void cleanupLegacyServiceWorkers();
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
        await cleanupLegacyServiceWorkers();
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
    void cleanupLegacyServiceWorkers();

    const currentVersion = readServedFrontendVersionFromDocument();
    if (currentVersion) {
      sessionStorage.setItem(FRONTEND_VERSION_STORAGE_KEY, currentVersion);
    }

    const manifestCheckInterval = setInterval(
      () => {
        checkServedFrontendVersion();
      },
      60 * 60 * 1000,
    );

    return () => {
      clearInterval(manifestCheckInterval);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}

/**
 * Entrada unica chamada pelo app em producao.
 * Nao registra SW novo; apenas remove runtime legado.
 */
export async function registerServiceWorker(): Promise<null> {
  if (!isServiceWorkerSupported()) {
    console.warn('[SW] Service Workers nao suportado');
    return null;
  }

  if (shouldBypassCleanupForPath(window.location.pathname)) {
    console.log('[SW] Limpeza defensiva para rota LMS player');
    await cleanupLegacyServiceWorkers();
    return null;
  }

  await cleanupLegacyServiceWorkers();
  return null;
}

/**
 * Mantido para reaproveitar o fluxo de UX existente.
 */
export function skipWaitingAndReload(): void {
  void hardRefreshApp();
}

async function checkServedFrontendVersion(): Promise<void> {
  try {
    const currentVersion =
      sessionStorage.getItem(FRONTEND_VERSION_STORAGE_KEY) ||
      readServedFrontendVersionFromDocument();
    const newVersion = await fetchServedFrontendVersion();
    if (!newVersion) return;

    if (currentVersion && currentVersion !== newVersion) {
      console.log('[App] Versao servida mudou, reload necessario');
      showUpdateNotification();
    }

    sessionStorage.setItem(FRONTEND_VERSION_STORAGE_KEY, newVersion);
  } catch (error) {
    console.warn('[App] Erro checando versao servida:', error);
  }
}

function showUpdateNotification(): void {
  const toastId = `sw-update-${Date.now()}`;

  toast.custom(
    () => (
      <div className="flex flex-col gap-3 bg-white rounded-lg border border-gray-200 p-4 shadow-lg">
        <p className="font-semibold text-sm text-gray-900">Nova versao do AirTrust disponivel</p>
        <p className="text-xs text-gray-600">
          Clique em &quot;Atualizar&quot; para recarregar com as ultimas melhorias.
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
      duration: Infinity,
      position: 'bottom-right',
    },
  );
}

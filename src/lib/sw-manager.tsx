/**
 * Service Worker cleanup manager para AirTrust.
 *
 * Responsabilidades:
 * 1. Nunca registrar novos service workers no app
 * 2. Desregistrar service workers existentes
 * 3. Limpar caches AirTrust legados
 *
 * A recuperacao de entrada/login continua no bootstrap de index.html. O antigo
 * hook de polling/recuperacao deste modulo nunca era montado pelo app e foi
 * removido para nao manter uma segunda estrategia de runtime aparentemente ativa.
 */

function shouldBypassCleanupForPath(pathname: string): boolean {
  return /^\/lms\/player\//.test(pathname);
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

async function cleanupLegacyServiceWorkers(): Promise<void> {
  await unregisterExistingServiceWorkers();
  await clearAllCaches();
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

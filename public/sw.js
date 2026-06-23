/**
 * AirTrust Service Worker temporary kill switch.
 *
 * Objetivo operacional:
 * - expulsar clientes presos em runtimes legados;
 * - limpar todos os caches AirTrust conhecidos;
 * - evitar qualquer novo cache de HTML/app shell;
 * - desregistrar o service worker assim que a limpeza terminar.
 */

const CACHE_VERSION = 'airtrust-v12';
const CACHE_PREFIX = 'airtrust-';
const LOGIN_SW_RESET_PARAM = 'airtrust_sw_reset';
const CRITICAL_PATH_PATTERNS = [/^\/$/, /^\/login$/, /^\/dashboard(?:\/|$)/, /^\/mro(?:\/|$)/];

function matchesAnyPath(pathname, patterns) {
  return patterns.some((pattern) => pattern.test(pathname));
}

async function purgeLegacyAirTrustCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
      .map((cacheName) => {
        console.log(`[SW] Deletando cache legado: ${cacheName}`);
        return caches.delete(cacheName);
      }),
  );
}

async function forceRefreshCriticalClients() {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  await Promise.all(
    clientList.map(async (client) => {
      if (typeof client.navigate !== 'function') return;

      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) return;
        if (!matchesAnyPath(clientUrl.pathname, CRITICAL_PATH_PATTERNS)) return;
        if (clientUrl.searchParams.get(LOGIN_SW_RESET_PARAM) === CACHE_VERSION) return;

        clientUrl.searchParams.set(LOGIN_SW_RESET_PARAM, CACHE_VERSION);
        await client.navigate(clientUrl.toString());
      } catch (error) {
        console.warn('[SW] Falha ao recarregar cliente critico:', error);
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando kill switch temporario');
  event.waitUntil(Promise.resolve(self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando kill switch temporario');
  event.waitUntil(
    (async () => {
      await purgeLegacyAirTrustCaches();
      await clients.claim();
      await forceRefreshCriticalClients();

      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientList.forEach((client) => {
        client.postMessage({
          type: 'AIRTRUST_SW_RESET',
          version: CACHE_VERSION,
          message: 'Service worker legado removido. Recarregando o AirTrust.',
        });
      });

      await self.registration.unregister();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isHtmlNavigation =
    request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

  if (url.origin !== self.location.origin) return;

  if (isHtmlNavigation || url.pathname === '/sw.js') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => {
        return new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Cache-Control': 'no-store' },
        });
      }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        await purgeLegacyAirTrustCaches();
        await self.registration.unregister();
      })(),
    );
  }
});

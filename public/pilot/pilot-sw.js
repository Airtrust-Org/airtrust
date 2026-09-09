const PILOT_CACHE_VERSION = 'airtrust-pilot-shell-v6';
const PILOT_SCOPE_PATH = '/pilot/';
const PRECACHE_URLS = [
  '/pilot/',
  '/pilot/index.html',
  '/pilot/pilot-app.js',
  '/pilot/pilot-workspace.js',
  '/pilot/pilot-vault.js',
  '/pilot/pilot-rdv-draft.js',
  '/pilot/pilot-sync.js',
  '/pilot/pilot-lease.js',
  '/pilot/pilot-lease-trust.js',
  '/pilot/pilot.webmanifest',
  '/airtrust-site-logo-20260830-192.png',
  '/airtrust-site-logo-20260830-512.png',
  '/airtrust-site-logo-apple-20260830.png',
];

async function precachePilotShell() {
  const cache = await caches.open(PILOT_CACHE_VERSION);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) {
        throw new Error('Falha ao preparar recurso offline: ' + url);
      }
      await cache.put(url, response);
    }),
  );
}

async function deleteOldPilotCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) => name.startsWith('airtrust-pilot-shell-') && name !== PILOT_CACHE_VERSION,
      )
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precachePilotShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await deleteOldPilotCaches();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname.startsWith(PILOT_SCOPE_PATH)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request, { cache: 'no-store' });
          if (response.ok) {
            const cache = await caches.open(PILOT_CACHE_VERSION);
            await cache.put('/pilot/index.html', response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match('/pilot/index.html');
          return (
            cached ||
            new Response('Pilot Offline indisponível neste dispositivo.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })(),
    );
    return;
  }

  if (!PRECACHE_URLS.includes(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(PILOT_CACHE_VERSION);
        await cache.put(url.pathname, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

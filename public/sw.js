/**
 * AirTrust Service Worker v1.0
 *
 * Estratégia:
 * 1. index.html → network-first (sempre atualizar)
 * 2. assets com hash (*.js, *.css) → cache-first (imutáveis)
 * 3. API calls → network-only (sem cache autenticado)
 * 4. /escalas/minha-escala → app shell offline, dados sempre via rede
 * 5. Notificar cliente quando nova versão disponível
 *
 * Como usar:
 * - Registrar em src/main.tsx: navigator.serviceWorker.register('/sw.js')
 * - Ouvir mensagens: navigator.serviceWorker.addEventListener('message', handler)
 * - Cliente recebe {type: 'AIRTRUST_UPDATE_AVAILABLE'} quando SW atualizou
 */

const CACHE_VERSION = 'airtrust-v9';
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Assets que devem ser cacheados (com hash = imutáveis)
const ASSET_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.webp$/,
  /\.ico$/,
];

// Rotas SPA de Minha Escala → offline-first navigation
const MINHA_ESCALA_NAV_PATTERNS = [/\/escalas\/minha-escala/];

const LMS_PLAYER_NAV_PATTERNS = [/^\/lms\/player\//];
const API_BYPASS_PATHS = [/^\/api\//];

function shouldBypassAirTrustCaching(request) {
  const url = new URL(request.url);

  if (API_BYPASS_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return true;
  }

  if (
    url.origin === self.location.origin &&
    LMS_PLAYER_NAV_PATTERNS.some((pattern) => pattern.test(url.pathname))
  ) {
    return true;
  }

  return false;
}

function isJavaScriptAssetRequest(requestOrUrl) {
  const url = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
  const destination = typeof requestOrUrl === 'string' ? '' : requestOrUrl.destination || '';
  return destination === 'script' || /\.m?js($|[?#])/.test(url);
}

function isValidJavaScriptResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  // Accept any JavaScript MIME type variant:
  //   text/javascript, application/javascript, application/x-javascript,
  //   module scripts, and variants with charset (e.g. "text/javascript; charset=utf-8")
  return (
    contentType.includes('javascript') ||
    contentType.includes('ecmascript') ||
    contentType.startsWith('application/x-javascript')
  );
}

async function getSafeCachedAsset(request) {
  const cachedResponse = await caches.match(request);

  if (!cachedResponse) {
    return null;
  }

  if (isJavaScriptAssetRequest(request) && !isValidJavaScriptResponse(cachedResponse)) {
    const cache = await caches.open(ASSETS_CACHE);
    await cache.delete(request);
    return null;
  }

  return cachedResponse;
}

function shouldCacheAssetResponse(request, response) {
  if (!response.ok || response.status !== 200) {
    return false;
  }

  if (isJavaScriptAssetRequest(request)) {
    return isValidJavaScriptResponse(response);
  }

  return true;
}

/**
 * Instalação: SW novo limpa caches antigos
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando novo Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.startsWith('airtrust-')) return;
          if (
            cacheName !== CACHE_VERSION &&
            cacheName !== ASSETS_CACHE &&
            cacheName !== RUNTIME_CACHE
          ) {
            console.log(`[SW] Deletando cache antigo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  // Forçar SW ativar imediatamente
  self.skipWaiting();
});

/**
 * Ativação: tomar controle de todas as páginas abertas
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando novo Service Worker');
  event.waitUntil(
    clients.claim().then(() => {
      // Notificar TODOS os clientes que uma nova versão está disponível
      clients.matchAll({ type: 'window' }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'AIRTRUST_UPDATE_AVAILABLE',
            version: CACHE_VERSION,
            message: 'Nova versão do AirTrust disponível. Por favor, recarregue.',
          });
        });
      });
    }),
  );
});

/**
 * Fetch: estratégia mista
 * - index.html: network-first (sempre tentar servidor)
 * - assets com hash: cache-first (imutáveis)
 * - API: network-only (sem cache)
 * - Outros: cache-first com fallback network
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url, method } = request;

  if (shouldBypassAirTrustCaching(request)) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      }),
    );
    return;
  }

  // Ignorar GET requisições que não sejam de rede
  if (method !== 'GET') {
    return;
  }

  // Ignorar requisições para: chrome extensions, browser sync, localhost:3000 (dev)
  if (
    url.includes('chrome-extension://') ||
    url.includes('localhost:3000') ||
    url.includes('127.0.0.1:3000') ||
    url.includes('browser-sync')
  ) {
    return;
  }

  const isNavigationRequest =
    request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

  // ===== ESTRATÉGIA 0: Minha Escala navegação → offline-first (app shell) =====
  if (isNavigationRequest && MINHA_ESCALA_NAV_PATTERNS.some((p) => p.test(url))) {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const networkFetch = fetch('/index.html')
          .then((response) => {
            if (response.ok) {
              caches.open(RUNTIME_CACHE).then((c) => c.put('/index.html', response.clone()));
            }
            return response;
          })
          .catch(() => cached || new Response('<h1>Offline</h1>', { status: 503 }));
        return cached ?? networkFetch;
      }),
    );
    return;
  }

  // ===== ESTRATÉGIA 1: navegação SPA, index.html e HTML → network-first =====
  if (
    isNavigationRequest ||
    url.endsWith('/') ||
    url.endsWith('/index.html') ||
    url.includes('.html')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache sucesso
          if (response.ok && response.status === 200) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Fallback para cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Se não há cache, retornar página offline
            return caches.match('/offline.html').catch(() => {
              return new Response(
                '<h1>Offline</h1><p>Sem conexão e nenhuma versão em cache disponível.</p>',
                { status: 503, statusText: 'Service Unavailable' },
              );
            });
          });
        }),
    );
    return;
  }

  // ===== ESTRATÉGIA 2: Assets com hash (*.js, *.css, fonts, imagens) → cache-first =====
  if (ASSET_PATTERNS.some((pattern) => pattern.test(url))) {
    event.respondWith(
      getSafeCachedAsset(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (isJavaScriptAssetRequest(request) && !isValidJavaScriptResponse(response)) {
            // Evita servir HTML como JS (causa "invalid JavaScript MIME type").
            return new Response('', {
              status: 503,
              statusText: 'Invalid JavaScript MIME response',
              headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            });
          }

          // ✅ IMPORTANTE: clonar ANTES de retornar ou armazenar
          if (shouldCacheAssetResponse(request, response)) {
            const responseToCache = response.clone();
            caches.open(ASSETS_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          return new Response('', {
            status: 503,
            statusText: 'Network unavailable for asset',
          });
        });
      }),
    );
    return;
  }

  // ===== ESTRATÉGIA 3: Outros (fallback) → cache-first =====
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        // ✅ IMPORTANTE: clonar ANTES de retornar ou armazenar
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Network failed and no cache available — return a clean 503
        // so the FetchEvent promise never rejects without a Response.
        return new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    }),
  );
});

/**
 * Mensagens do cliente (ex: forçar limpeza de cache)
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith('airtrust-'))
          .map((name) => caches.delete(name)),
      );
    });
  }
});

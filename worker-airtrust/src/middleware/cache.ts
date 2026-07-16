/**
 * CACHE CONTROL MIDDLEWARE
 *
 * Configura headers de cache apropriados para cada tipo de conteúdo
 * Evita cache agressivo em HTML e permite cache otimizado em assets
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * Allowlist explícita de rotas JSON que podem ser cacheadas publicamente.
 *
 * Estas rotas NUNCA retornam dados de tenant, de usuário autenticado ou
 * qualquer informação operacional — apenas metadados estáticos da API.
 * Qualquer outra rota JSON usa o default seguro (private, no-store).
 */
const PUBLIC_CACHEABLE_JSON_PATHS = new Set<string>([
  '/api/health',
  '/api/version',
  '/api/capabilities',
]);

const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Middleware de controle de cache
 *
 * Estratégias:
 * - HTML: no-cache (sempre buscar versão mais recente)
 * - JSON/API: default seguro "private, no-store" (nunca cache público de
 *   respostas autenticadas/tenant-scoped); allowlist explícita permite
 *   cache curto para rotas públicas comprovadamente estáticas.
 * - Assets estáticos: cache de 1 ano com immutable (fingerprinted)
 */
export function cacheControl(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const contentType = c.res.headers.get('Content-Type') || '';
    const path = c.req.path;

    const isAuthenticatedLmsAsset =
      path.startsWith('/api/lms/scorm/assets/') ||
      path.startsWith('/api/lms/scorm/assets-by-curso/') ||
      path.startsWith('/api/lms/h5p/assets/');

    if (isAuthenticatedLmsAsset) {
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return;
    }

    // 1. HTML (SPA) - NUNCA cachear
    // Garante que usuários sempre vejam a versão mais recente
    if (contentType.includes('text/html')) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return;
    }

    // 2. JSON/API
    // 🚫 Respeitar Cache-Control já definido explicitamente pelo endpoint
    if (contentType.includes('application/json')) {
      const existingCache = c.res.headers.get('Cache-Control');
      if (existingCache && existingCache !== '') {
        return;
      }

      const isCacheableMethod = CACHEABLE_METHODS.has(c.req.method);
      const isExplicitlyPublicPath = PUBLIC_CACHEABLE_JSON_PATHS.has(path);
      const isSuccessResponse = c.res.status >= 200 && c.res.status < 300;

      if (isCacheableMethod && isExplicitlyPublicPath && isSuccessResponse) {
        c.header('Cache-Control', 'public, max-age=60, s-maxage=60');
        return;
      }

      // Default seguro: nenhuma resposta JSON fora da allowlist é cacheável
      // por intermediários/CDN. Cobre rotas autenticadas, tenant-scoped,
      // mutações (POST/PUT/PATCH/DELETE) e respostas de erro (401/403/404/500).
      c.header('Cache-Control', 'private, no-store, max-age=0');
      c.header('CDN-Cache-Control', 'no-store');
      c.header('Cloudflare-CDN-Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return;
    }

    // 3. Assets estáticos com hash - Cache longo (1 ano)
    // Vite gera hashes nos filenames, podem ser cacheados indefinidamente
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/)) {
      // Se tiver hash no nome do arquivo (ex: index-abc123.js)
      if (path.match(/-[a-f0-9]{8,}\./)) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // Sem hash, cache mais curto (1 dia)
        c.header('Cache-Control', 'public, max-age=86400');
      }
      return;
    }

    // 4. Padrão - conteúdo não identificado. Default seguro: não cachear
    // por intermediários, pois pode carregar dados operacionais/tenant-scoped.
    c.header('Cache-Control', 'private, no-store, max-age=0');
    c.header('CDN-Cache-Control', 'no-store');
    c.header('Cloudflare-CDN-Cache-Control', 'no-store');
  };
}

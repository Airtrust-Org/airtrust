/**
 * NO-CACHE MIDDLEWARE
 *
 * Desabilita COMPLETAMENTE o cache do Cloudflare para garantir
 * que mudanças no código apareçam IMEDIATAMENTE em staging.
 *
 * Usado apenas em ambiente staging/development.
 * Produção usa cache normal do Cloudflare para performance.
 */

import { MiddlewareHandler } from 'hono';

export function noCacheMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Headers agressivos de no-cache (CF ignora cache completamente)
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    c.header('Surrogate-Control', 'no-store');
    c.header('CDN-Cache-Control', 'no-store');
    c.header('Cloudflare-CDN-Cache-Control', 'no-store');

    // CORS headers delegados ao cors middleware — não adicionar wildcard aqui

    return next();
  };
}

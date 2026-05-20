/**
 * CACHE CONTROL MIDDLEWARE
 *
 * Configura headers de cache apropriados para cada tipo de conteúdo
 * Evita cache agressivo em HTML e permite cache otimizado em assets
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * Middleware de controle de cache
 *
 * Estratégias:
 * - HTML: no-cache (sempre buscar versão mais recente)
 * - JSON/API: cache de 5 minutos (performance)
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

    // 2. JSON/API - Cache curto (5 minutos)
    // Balance entre performance e atualização de dados
    if (contentType.includes('application/json')) {
      // 🚫 Respeitar Cache-Control já definido no endpoint
      const existingCache = c.res.headers.get('Cache-Control');
      if (!existingCache || existingCache === '') {
        c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
        c.header('Vary', 'Authorization'); // Cache separado por usuário
      }
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

    // 4. Padrão - Cache moderado (1 hora)
    c.header('Cache-Control', 'public, max-age=3600');
  };
}

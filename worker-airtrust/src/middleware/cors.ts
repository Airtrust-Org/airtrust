/**
 * CORS MIDDLEWARE - Cross-Origin Resource Sharing
 *
 * Configura CORS para permitir requisições do frontend
 * Origens permitidas são parametrizadas via ENV
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { resolveAllowedOrigin } from '../config/allowed-origins';

/**
 * Middleware CORS simples - apenas adiciona headers CORS sem validação
 * Resolve problemas com wildcards e configurações complexas
 */
export function cors(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    // Pegar a origem da requisição
    const origin = c.req.header('Origin');

    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);

    // Adicionar headers CORS
    c.header('Access-Control-Allow-Origin', resolvedOrigin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-Dev-Auth-Bypass, X-AirTrust-Bypass-Cache, X-Maintenance-Secret, X-AirTrust-Maintenance, Idempotency-Key',
    );
    c.header('Access-Control-Max-Age', '86400');
    c.header('Access-Control-Allow-Credentials', 'true');

    // Se for preflight (OPTIONS), responder imediatamente
    if (c.req.method === 'OPTIONS') {
      c.status(204);
      return c.body(null);
    }

    // Continuar com outras rotas
    return next();
  };
}

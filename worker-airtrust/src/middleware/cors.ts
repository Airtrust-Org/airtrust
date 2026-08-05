/**
 * CORS MIDDLEWARE - Cross-Origin Resource Sharing
 *
 * Credenciais só são autorizadas para origens exatas declaradas no ambiente.
 * A barreira externa em environment-entrypoint rejeita origens não permitidas
 * antes que qualquer rota com efeito colateral seja executada.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { isAllowedOrigin, resolveAllowedOrigin } from '../config/allowed-origins';

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
const ALLOWED_HEADERS =
  'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-Dev-Auth-Bypass, X-AirTrust-Bypass-Cache, X-Maintenance-Secret, X-AirTrust-Maintenance';

export function cors(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const origin = c.req.header('Origin');
    const originAllowed = isAllowedOrigin(origin, c.env.CORS_ORIGINS);

    c.header('Vary', 'Origin');

    if (originAllowed) {
      c.header('Access-Control-Allow-Origin', resolveAllowedOrigin(origin, c.env.CORS_ORIGINS));
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    if (c.req.method === 'OPTIONS') {
      if (!originAllowed) {
        return c.json(
          {
            success: false,
            error: 'Origem não autorizada para este ambiente',
            code: 'CORS_ORIGIN_DENIED',
          },
          403,
        );
      }

      c.header('Access-Control-Allow-Methods', ALLOWED_METHODS);
      c.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      c.header('Access-Control-Max-Age', '86400');
      c.status(204);
      return c.body(null);
    }

    return next();
  };
}

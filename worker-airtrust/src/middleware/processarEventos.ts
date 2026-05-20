import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { processarEventosParaModulo } from '../shared/handlers';
import { getEmpresaIdOptional } from '../routes/escalas-shared';

export function processarEventosMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (
      c.req.path.startsWith('/api/escalas') &&
      !c.req.path.endsWith('/health') &&
      c.req.method !== 'OPTIONS'
    ) {
      try {
        const empresaId = getEmpresaIdOptional(c);
        if (empresaId) {
          c.executionCtx.waitUntil(
            processarEventosParaModulo(c.env.DB, String(empresaId), 'escalas'),
          );
        }
      } catch {
        // Nunca bloquear a request principal por falha de processamento assíncrono.
      }
    }

    await next();
  };
}

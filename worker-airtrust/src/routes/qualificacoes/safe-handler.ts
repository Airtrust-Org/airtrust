import type { Context } from 'hono';
import type { Env } from '../../types';

/** HTTP-only error wrapper for qualificacoes historico handlers (kept in routes/ so services stay framework-free). */
export function safe(fn: (c: Context<{ Bindings: Env }>) => Promise<Response> | Response) {
  return async (c: Context<{ Bindings: Env }>) => {
    try {
      return await fn(c);
    } catch (e) {
      const errorMessage = (e as Error).message || String(e);
      console.error('[HISTORICO_ERROR]', errorMessage, (e as Error).stack);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  };
}

import worker from './index';
import { isAllowedOrigin } from './config/allowed-origins';
import type { Env } from './types';

function deniedOriginResponse(origin: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Origem não autorizada para este ambiente',
      code: 'CORS_ORIGIN_DENIED',
    }),
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        Vary: 'Origin',
        'X-Content-Type-Options': 'nosniff',
        'X-AirTrust-Denied-Origin': origin,
      },
    },
  );
}

/**
 * Trust boundary anterior ao Hono.
 *
 * O app legado ainda possui handlers CORS próprios. Esta camada impede que uma
 * origem não declarada chegue a qualquer rota, inclusive preflights e requests
 * simples com cookies, antes de esses handlers serem executados.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedOrigin(origin, env.CORS_ORIGINS)) {
      return deniedOriginResponse(origin);
    }

    return worker.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await worker.scheduled(event, env, ctx);
  },
};

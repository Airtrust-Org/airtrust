import worker from './index';
import { isAllowedOrigin } from './config/allowed-origins';
import type { Env } from './types';
import { syncAnacRabPublicData } from './services/anac/rab-public-sync';

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

function isAnacPublicSyncEnabled(env: Env): boolean {
  const explicit = (env as Env & { ANAC_PUBLIC_SYNC_ENABLED?: string }).ANAC_PUBLIC_SYNC_ENABLED;
  if (explicit !== undefined) {
    return explicit.trim().toLowerCase() === 'true';
  }

  // Safe rollout default: staging/development can exercise the integration after
  // Schema V2 0476 is applied. Production stays closed until an explicit config change.
  return env.ENVIRONMENT !== 'production';
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
    if (event.cron === '0 8 * * *' && isAnacPublicSyncEnabled(env)) {
      ctx.waitUntil(
        syncAnacRabPublicData(env).catch((error) => {
          const code = error instanceof Error ? error.message : 'ANAC_RAB_SYNC_FAILED';
          console.error('[ANAC_RAB_SYNC] daily sync failed', { code });
        }),
      );
    }

    await worker.scheduled(event, env, ctx);
  },
};
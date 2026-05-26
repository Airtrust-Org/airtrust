import { Hono } from 'hono';
import type { Env, Variables } from '../types';

type SystemApp = Hono<{ Bindings: Env; Variables: Variables }>;

/**
 * Registra rotas públicas/sistema no app principal.
 * Paths e contratos preservados do index.ts original.
 */
export function registerSystemRoutes(app: SystemApp) {
  /**
   * GET /api/health
 * Health check completo - verifica D1, R2, KV e métricas
 */
  app.get('/api/health', async (c) => {
    const startTime = Date.now();
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> =
      {};
    let overallHealthy = true;

    // 1. Verificar D1 Database
    try {
      const dbStart = Date.now();
      const dbTest = await c.env.DB.prepare('SELECT 1 as test').first<{ test: number }>();
      checks.database = {
        status: dbTest?.test === 1 ? 'ok' : 'error',
        latency: Date.now() - dbStart,
      };
      if (dbTest?.test !== 1) overallHealthy = false;
    } catch (error) {
      checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown DB error',
      };
      overallHealthy = false;
    }

    // 2. Verificar R2 Bucket (se disponível)
    try {
      if (c.env.BUCKET) {
        const r2Start = Date.now();
        // Apenas lista 1 objeto para verificar conectividade
        await c.env.BUCKET.list({ limit: 1 });
        checks.storage = {
          status: 'ok',
          latency: Date.now() - r2Start,
        };
      } else {
        checks.storage = { status: 'ok', latency: 0 }; // R2 não configurado, não é erro
      }
    } catch (error) {
      checks.storage = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown R2 error',
      };
      // R2 não é crítico, não marca como unhealthy
    }

    // 3. Métricas básicas
    const stats = {
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT || 'unknown',
      version: c.env.APP_VERSION || 'dev-local',
      region: c.req.header('CF-IPCountry') || 'unknown',
    };

    const totalLatency = Date.now() - startTime;

    if (overallHealthy) {
      return c.json({
        success: true,
        status: 'healthy',
        checks,
        stats,
        latency: totalLatency,
      });
    } else {
      return c.json(
        {
          success: false,
          status: 'unhealthy',
          checks,
          stats,
          latency: totalLatency,
        },
        503,
      );
    }
  });

/**
 * GET /api/version
 * Exibe informações da versão/build atual do backend
 */
  app.get('/api/version', (c) => {
    const environment = c.env.ENVIRONMENT || 'development';

    // Tenta obter o deployment ID via APP_VERSION primeiro (injetado pelo deploy script)
    // Fallback para CF_DEPLOYMENT_ID depois
    const deploymentId =
      (c.env as unknown as Record<string, string>).APP_VERSION ||
      (c.env as unknown as Record<string, string>).CF_DEPLOYMENT_ID ||
      'unknown';

    const builtAt =
      environment === 'development' ? new Date().toISOString() : c.env.APP_BUILD_TIME || null;

    return c.json({
      success: true,
      data: {
        version: deploymentId !== 'unknown' ? deploymentId : c.env.APP_VERSION || '0.0.0-dev',
        environment,
        builtAt,
        deploymentId,
      },
    });
  });

/**
 * GET /api/status
 * Health + versões (backend e opcionalmente frontend, se variável estiver configurada)
 */
  app.get('/api/status', (c) => {
    return c.json({
      success: true,
      backend_version: c.env.APP_VERSION || '0.0.0-dev',
      // opcional: configure FRONT_VERSION no deploy para refletir a versão do front
      frontend_version: (c.env as unknown as Record<string, string>).FRONT_VERSION || null,
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
    });
  });

/**
 * GET /api/system/health
 * Alias para compatibilidade com o frontend (/sistema)
 */
  app.get('/api/system/health', async (c) => {
    // Reutiliza a mesma lógica do /api/health
    const url = new URL(c.req.url);
    // Encaminha mantendo quaisquer query params
    return c.redirect(`/api/health${url.search}`, 307);
  });

/**
 * GET /api/sistema/health
 * Alias em português para compatibilidade
 */
  app.get('/api/sistema/health', async (c) => {
    const url = new URL(c.req.url);
    return c.redirect(`/api/health${url.search}`, 307);
  });
}

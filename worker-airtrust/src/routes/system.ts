import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import edbShadowPreviewRoutes from './edb-shadow-preview';

type SystemApp = Hono<{ Bindings: Env; Variables: Variables }>;

import { getReleaseMetadata } from '../services/release-metadata';

/**
 * Aplica headers no-cache para impedir que o CDN do Cloudflare sirva
 * respostas stale com versão antiga após um deploy.
 */
function setNoCacheHeaders(c: {
  header: (name: string, value: string) => void;
}) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Surrogate-Control', 'no-store');
  c.header('CDN-Cache-Control', 'no-store');
  c.header('Cloudflare-CDN-Cache-Control', 'no-store');
}

/**
 * Registra rotas públicas/sistema no app principal.
 * Paths e contratos preservados do index.ts original.
 */
export function registerSystemRoutes(app: SystemApp) {
  app.route('/api/edb', edbShadowPreviewRoutes);

  /**
   * GET /api/health
   * Health check completo - verifica D1, R2, KV e métricas.
   * No-cache: versão deve refletir o deploy atual, nunca stale.
   */
  app.get('/api/health', async (c) => {
    setNoCacheHeaders(c);

    const startTime = Date.now();
    const checks: Record<
      string,
      { status: 'ok' | 'error'; latency?: number; error?: string }
    > = {};
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
    } catch {
      checks.database = {
        status: 'error',
        error: 'Erro interno do servidor',
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
    } catch {
      checks.storage = {
        status: 'error',
        error: 'Erro interno do servidor',
      };
      // R2 não é crítico, não marca como unhealthy
    }

    // 3. Métricas básicas — versão canónica partilhada com /api/version
    const metadata = getReleaseMetadata(c.env);
    const stats = {
      timestamp: new Date().toISOString(),
      environment: metadata.environment,
      version: metadata.version,
      workerVersionId: metadata.workerVersionId,
      deploymentTag: metadata.deploymentTag,
      sourceSha: metadata.sourceSha,
      workerBundleSha256: metadata.workerBundleSha256,
      releaseManifestSha256: metadata.releaseManifestSha256,
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
   * Exibe informações da versão/build atual do backend.
   * No-cache: versão deve refletir o deploy atual, nunca stale.
   */
  app.get('/api/version', (c) => {
    setNoCacheHeaders(c);

    const metadata = getReleaseMetadata(c.env);

    return c.json({
      success: true,
      data: {
        version: metadata.version,
        environment: metadata.environment,
        builtAt: metadata.buildTime,
        deploymentId: metadata.version,
        workerVersionId: metadata.workerVersionId,
        deploymentTag: metadata.deploymentTag,
        workerVersionCreatedAt: metadata.workerVersionCreatedAt,
        sourceSha: metadata.sourceSha,
        sourceTree: metadata.sourceTree,
        workerBundleSha256: metadata.workerBundleSha256,
        releaseManifestSha256: metadata.releaseManifestSha256,
      },
    });
  });

  /**
   * GET /api/status
   * Health + versões (backend e opcionalmente frontend, se variável estiver configurada).
   * No-cache: versão deve refletir o deploy atual.
   */
  app.get('/api/status', (c) => {
    setNoCacheHeaders(c);

    const metadata = getReleaseMetadata(c.env);

    return c.json({
      success: true,
      backend_version: metadata.version,
      // opcional: configure FRONT_VERSION no deploy para refletir a versão do front
      frontend_version: (c.env as unknown as Record<string, string>).FRONT_VERSION || null,
      environment: metadata.environment,
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

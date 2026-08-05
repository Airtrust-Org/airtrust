import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import edbShadowPreviewRoutes from './edb-shadow-preview';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import { ApiError } from '../middleware/error-handler';
import { isEdbShadowPilotEnabledForTenant } from '../lib/edb/edb-shadow-pilot-flag';
import {
  isPlatformAdminAccess,
  resolvePlatformAccessState,
} from '../lib/rbac/platform-access';
import { getOperationalStatus } from '../observability/operational-status';
import { getReleaseMetadata } from '../services/release-metadata';

type SystemApp = Hono<{ Bindings: Env; Variables: Variables }>;

function setNoCacheHeaders(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Surrogate-Control', 'no-store');
  c.header('CDN-Cache-Control', 'no-store');
  c.header('Cloudflare-CDN-Cache-Control', 'no-store');
}

export function registerSystemRoutes(app: SystemApp) {
  app.get('/api/edb/capability', (c) => {
    const tenantId = getEmpresaId(c);
    const enabled =
      checkPermission(c, 'manager') && isEdbShadowPilotEnabledForTenant(c.env, tenantId);

    return c.json({
      success: true,
      data: {
        enabled,
        classification: 'NON_OFFICIAL_SHADOW_PILOT_CAPABILITY',
        officialLogbook: false,
        replacesPaper: false,
      },
    });
  });

  app.use('/api/edb/*', async (c, next) => {
    if (new URL(c.req.url).pathname === '/api/edb/capability') {
      await next();
      return;
    }

    const tenantId = getEmpresaId(c);
    if (!isEdbShadowPilotEnabledForTenant(c.env, tenantId)) {
      throw new ApiError('Recurso indisponivel', 404, 'EDB_SHADOW_PILOT_NOT_ENABLED');
    }

    await next();
  });

  app.route('/api/edb', edbShadowPreviewRoutes);

  app.get('/api/health', async (c) => {
    setNoCacheHeaders(c);

    const startTime = Date.now();
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};
    let overallHealthy = true;

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

    try {
      if (c.env.BUCKET) {
        const r2Start = Date.now();
        await c.env.BUCKET.list({ limit: 1 });
        checks.storage = {
          status: 'ok',
          latency: Date.now() - r2Start,
        };
      } else {
        checks.storage = { status: 'ok', latency: 0 };
      }
    } catch {
      checks.storage = {
        status: 'error',
        error: 'Erro interno do servidor',
      };
    }

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
    }

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
  });

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

  app.get('/api/status', (c) => {
    setNoCacheHeaders(c);

    const metadata = getReleaseMetadata(c.env);

    return c.json({
      success: true,
      backend_version: metadata.version,
      frontend_version: (c.env as unknown as Record<string, string>).FRONT_VERSION || null,
      environment: metadata.environment,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Durable operational status. Platform administrators receive the global
   * view; tenant administrators receive only their tenant scopes and global
   * ledger items whose payload carries the same internal empresa_id.
   */
  app.get('/api/system/operations/cron', async (c) => {
    setNoCacheHeaders(c);
    const empresaId = getEmpresaId(c);
    const platformState = await resolvePlatformAccessState(c.env.DB, c.get('userId'));
    const platformAdmin = isPlatformAdminAccess(platformState);

    if (!platformAdmin && !checkPermission(c, 'admin')) {
      throw new ApiError('Acesso negado', 403, 'OPERATIONAL_STATUS_FORBIDDEN');
    }

    const requestedLimit = Number(c.req.query('limit') || 100);
    const data = await getOperationalStatus(c.env.DB, {
      platformAdmin,
      empresaId,
      limit: requestedLimit,
    });

    return c.json({ success: true, data });
  });

  app.get('/api/system/health', async (c) => {
    const url = new URL(c.req.url);
    return c.redirect(`/api/health${url.search}`, 307);
  });

  app.get('/api/sistema/health', async (c) => {
    const url = new URL(c.req.url);
    return c.redirect(`/api/health${url.search}`, 307);
  });
}

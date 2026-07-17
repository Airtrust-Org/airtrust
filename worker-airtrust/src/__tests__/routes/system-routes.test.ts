import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { registerSystemRoutes } from '../../routes/system';

type HealthBody = {
  success: boolean;
  status: string;
  checks: {
    database: { status: string };
    storage?: { status: string };
  };
  stats: {
    environment?: string;
    version: string;
  };
};

type VersionBody = {
  success: boolean;
  data: {
    version: string;
    environment?: string;
    builtAt?: string;
    deploymentId?: string;
  };
};

type StatusBody = {
  success: boolean;
  backend_version: string;
  frontend_version: string | null;
  environment?: string;
};

function createSystemApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  registerSystemRoutes(app);
  return app;
}

function createDbHealthyMock() {
  return {
    prepare: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ test: 1 }),
    }),
  } as unknown as D1Database;
}

describe('system routes extraction', () => {
  it('mantém GET /api/health com status 200 e contrato healthy', async () => {
    const app = createSystemApp();
    const response = await app.request('/api/health', {}, { DB: createDbHealthyMock() } as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: 'healthy',
      checks: {
        database: { status: 'ok' },
      },
      stats: {
        environment: 'unknown',
        version: 'dev-local',
      },
    });
  });

  it('GET /api/health usa getCanonicalVersion quando APP_VERSION está definida', async () => {
    const app = createSystemApp();
    const response = await app.request(
      '/api/health',
      {},
      {
        DB: createDbHealthyMock(),
        APP_VERSION: '2026-06-03T17:00:27Z-c12d8bf',
      } as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthBody;
    expect(body.stats.version).toBe('2026-06-03T17:00:27Z-c12d8bf');
  });

  it('GET /api/health retorna headers no-cache para impedir cache CDN stale', async () => {
    const app = createSystemApp();
    const response = await app.request('/api/health', {}, { DB: createDbHealthyMock() } as Env);

    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
  });

  it('mantém GET /api/version com success=true e shape atual', async () => {
    const app = createSystemApp();
    const response = await app.request(
      '/api/version',
      {},
      {
        ENVIRONMENT: 'production',
        APP_VERSION: 'v-test-123',
        APP_BUILD_TIME: '2026-05-26T00:00:00.000Z',
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        version: 'v-test-123',
        environment: 'production',
        builtAt: '2026-05-26T00:00:00.000Z',
        deploymentId: 'v-test-123',
      },
    });
  });

  it('GET /api/version retorna headers no-cache', async () => {
    const app = createSystemApp();
    const response = await app.request(
      '/api/version',
      {},
      { APP_VERSION: 'v-test' } as Env,
    );

    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
  });

  it('GET /api/status usa getCanonicalVersion mesmo com APP_VERSION ausente', async () => {
    const app = createSystemApp();
    const response = await app.request('/api/status', {}, {} as Env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as StatusBody;
    expect(body.backend_version).toBe('dev-local');
    expect(body.frontend_version).toBeNull();
  });

  it('CONTRACT: /api/version.data.version === /api/health.stats.version', async () => {
    const app = createSystemApp();
    const env = {
      DB: createDbHealthyMock(),
      APP_VERSION: '2026-06-03T17:00:27Z-c12d8bf',
      APP_BUILD_TIME: '2026-06-03T17:00:27.000Z',
      ENVIRONMENT: 'production',
    } as Env;

    const [versionRes, healthRes] = await Promise.all([
      app.request('/api/version', {}, env),
      app.request('/api/health', {}, env),
    ]);

    const versionBody = (await versionRes.json()) as VersionBody;
    const healthBody = (await healthRes.json()) as HealthBody;

    expect(versionBody.data.version).toBe('2026-06-03T17:00:27Z-c12d8bf');
    expect(healthBody.stats.version).toBe('2026-06-03T17:00:27Z-c12d8bf');
    expect(versionBody.data.version).toBe(healthBody.stats.version);
  });

  it('CONTRACT: /api/health continua healthy com DB e storage ok', async () => {
    const app = createSystemApp();
    const response = await app.request(
      '/api/health',
      {},
      {
        DB: createDbHealthyMock(),
        BUCKET: {
          list: vi.fn().mockResolvedValue({ objects: [] }),
        },
        APP_VERSION: 'v-prod-abc',
      } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthBody;
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.storage?.status).toBe('ok');
    expect(body.stats.version).toBe('v-prod-abc');
  });

  it('FALLBACK: getCanonicalVersion usa CF_DEPLOYMENT_ID quando APP_VERSION ausente', async () => {
    const app = createSystemApp();
    // Simula acesso via Record para injetar CF_DEPLOYMENT_ID sem APP_VERSION
    const env = {
      DB: createDbHealthyMock(),
      CF_DEPLOYMENT_ID: 'cf-deploy-999',
    } as unknown as Env;

    const [versionRes, healthRes] = await Promise.all([
      app.request('/api/version', {}, env),
      app.request('/api/health', {}, env),
    ]);

    const versionBody = (await versionRes.json()) as VersionBody;
    const healthBody = (await healthRes.json()) as HealthBody;

    expect(versionBody.data.version).toBe('cf-deploy-999');
    expect(healthBody.stats.version).toBe('cf-deploy-999');
    expect(versionBody.data.version).toBe(healthBody.stats.version);
  });

  it('ignora placeholders tracked no git e expõe fallback real do deploy', async () => {
    const app = createSystemApp();
    const env = {
      DB: createDbHealthyMock(),
      APP_VERSION: 'managed-by-script',
      APP_BUILD_TIME: 'managed-by-script',
      CF_DEPLOYMENT_ID: 'cf-real-123',
      ENVIRONMENT: 'production',
    } as unknown as Env;

    const [versionRes, healthRes] = await Promise.all([
      app.request('/api/version', {}, env),
      app.request('/api/health', {}, env),
    ]);

    const versionBody = (await versionRes.json()) as VersionBody;
    const healthBody = (await healthRes.json()) as HealthBody;

    expect(versionBody.data.version).toBe('cf-real-123');
    expect(versionBody.data.deploymentId).toBe('cf-real-123');
    expect(versionBody.data.builtAt).toBeNull();
    expect(healthBody.stats.version).toBe('cf-real-123');
  });

  it('FALLBACK: sem APP_VERSION nem CF_DEPLOYMENT_ID retorna dev-local em ambos', async () => {
    const app = createSystemApp();
    const env = { DB: createDbHealthyMock() } as Env;

    const [versionRes, healthRes] = await Promise.all([
      app.request('/api/version', {}, env),
      app.request('/api/health', {}, env),
    ]);

    const versionBody = (await versionRes.json()) as VersionBody;
    const healthBody = (await healthRes.json()) as HealthBody;

    expect(versionBody.data.version).toBe('dev-local');
    expect(healthBody.stats.version).toBe('dev-local');
    expect(versionBody.data.version).toBe(healthBody.stats.version);
  });

  it('nunca expõe dev-local em staging/production sem stamp — usa unversioned-remote', async () => {
    const app = createSystemApp();

    for (const environment of ['staging', 'production'] as const) {
      const env = {
        DB: createDbHealthyMock(),
        ENVIRONMENT: environment,
        APP_VERSION: 'managed-by-script',
      } as unknown as Env;

      const versionRes = await app.request('/api/version', {}, env);
      const versionBody = (await versionRes.json()) as VersionBody;
      expect(versionBody.data.version).toBe('unversioned-remote');
      expect(versionBody.data.version).not.toBe('dev-local');
      expect(versionBody.data.environment).toBe(environment);
    }
  });

  it('mantém dev-local apenas quando ENVIRONMENT é local/ausente', async () => {
    const app = createSystemApp();
    const env = {
      DB: createDbHealthyMock(),
      ENVIRONMENT: 'development',
    } as unknown as Env;

    const versionRes = await app.request('/api/version', {}, env);
    const versionBody = (await versionRes.json()) as VersionBody;
    expect(versionBody.data.version).toBe('dev-local');
  });

  it('mantém GET /api/status com status 200 e contrato atual', async () => {
    const app = createSystemApp();
    const response = await app.request(
      '/api/status',
      {},
      {
        ENVIRONMENT: 'staging',
        APP_VERSION: 'v-staging-1',
      } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      backend_version: 'v-staging-1',
      frontend_version: null,
      environment: 'staging',
    });
  });

  it('mantém aliases /api/system/health e /api/sistema/health com 307 para /api/health', async () => {
    const app = createSystemApp();

    const systemResponse = await app.request('/api/system/health?x=1');
    expect(systemResponse.status).toBe(307);
    expect(systemResponse.headers.get('location')).toBe('/api/health?x=1');

    const sistemaResponse = await app.request('/api/sistema/health?y=2');
    expect(sistemaResponse.status).toBe(307);
    expect(sistemaResponse.headers.get('location')).toBe('/api/health?y=2');
  });
});

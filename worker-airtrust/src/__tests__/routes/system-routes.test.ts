import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { registerSystemRoutes } from '../../routes/system';

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

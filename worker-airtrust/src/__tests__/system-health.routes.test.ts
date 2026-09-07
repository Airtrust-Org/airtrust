import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { registerSystemRoutes } from '../routes/system';
import type { Env, Variables } from '../types';

type HealthBody = {
  success: boolean;
  status: 'healthy' | 'unhealthy';
  checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }>;
  stats: { version: string; environment: string };
  latency: number;
};

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  registerSystemRoutes(app);
  return app;
}

function createEnv(options: { databaseError?: Error; storageError?: Error } = {}) {
  const databaseFirst = options.databaseError
    ? vi.fn().mockRejectedValue(options.databaseError)
    : vi.fn().mockResolvedValue({ test: 1 });
  const prepare = vi.fn().mockReturnValue({ first: databaseFirst });
  const storageList = options.storageError
    ? vi.fn().mockRejectedValue(options.storageError)
    : vi.fn().mockResolvedValue({ objects: [], truncated: false });

  const env = {
    ENVIRONMENT: 'test',
    APP_VERSION: 'health-test-version',
    DB: { prepare },
    BUCKET: { list: storageList },
  } as unknown as Env;

  return { env, prepare, databaseFirst, storageList };
}

function expectNoStoreHeaders(response: Response) {
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(response.headers.get('Pragma')).toBe('no-cache');
  expect(response.headers.get('Expires')).toBe('0');
  expect(response.headers.get('Surrogate-Control')).toBe('no-store');
  expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
}

describe('system health routes', () => {
  it('returns a healthy response when D1 and R2 are available', async () => {
    const app = createApp();
    const { env, prepare, databaseFirst, storageList } = createEnv();

    const response = await app.request('http://localhost/api/health', {}, env);
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(200);
    expectNoStoreHeaders(response);
    expect(body.success).toBe(true);
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.storage.status).toBe('ok');
    expect(body.stats.version).toBe('health-test-version');
    expect(body.stats.environment).toBe('test');
    expect(body.latency).toBeGreaterThanOrEqual(0);
    expect(prepare).toHaveBeenCalledWith('SELECT 1 as test');
    expect(databaseFirst).toHaveBeenCalledOnce();
    expect(storageList).toHaveBeenCalledWith({ limit: 1 });
  });

  it('returns 503 and a sanitized database error when D1 is unavailable', async () => {
    const app = createApp();
    const { env } = createEnv({
      databaseError: new Error('internal database connection details'),
    });

    const response = await app.request('http://localhost/api/health', {}, env);
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(503);
    expectNoStoreHeaders(response);
    expect(body.success).toBe(false);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toEqual({
      status: 'error',
      error: 'Erro interno do servidor',
    });
    expect(JSON.stringify(body)).not.toContain('internal database connection details');
  });

  it('returns 503 when R2 is unavailable instead of reporting a false healthy state', async () => {
    const app = createApp();
    const { env } = createEnv({
      storageError: new Error('private bucket details'),
    });

    const response = await app.request('http://localhost/api/health', {}, env);
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(503);
    expectNoStoreHeaders(response);
    expect(body.success).toBe(false);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.storage).toEqual({
      status: 'error',
      error: 'Erro interno do servidor',
    });
    expect(JSON.stringify(body)).not.toContain('private bucket details');
  });

  it('preserves query strings in compatibility redirects', async () => {
    const app = createApp();
    const { env } = createEnv();

    for (const path of ['/api/system/health', '/api/sistema/health']) {
      const url = `http://localhost${path}?source=test&check=cache`;
      const response = await app.request(url, {}, env);

      expect(response.status).toBe(307);
      expect(response.headers.get('Location')).toBe('/api/health?source=test&check=cache');
    }
  });
});

import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorHandler } from '../../middleware/error-handler';
import { AppError } from '../../utils/errors';
import type { Env } from '../../types';

function buildApp(environment: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);

  app.get('/business', () => {
    throw new ApiError('Categoria já existe', 400, 'CATEGORY_EXISTS');
  });
  app.get('/api-500', () => {
    throw new ApiError(
      'SQLITE_ERROR: no such table: usuarios_empresas at worker.ts:418:11',
      500,
      'DB_FAILURE',
    );
  });
  app.get('/app-503', () => {
    throw new AppError(
      'blocklist query failed: upstream database unavailable',
      503,
      'AUTH_SECURITY_INFRA_ERROR',
    );
  });
  app.get('/unexpected', () => {
    throw new Error('D1_ERROR: database unavailable\n at Worker.fetch (/srv/src/worker.ts:418:11)');
  });

  return (path: string) =>
    app.request(path, undefined, {
      ENVIRONMENT: environment,
    } as unknown as Env);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('global error handler visible 5xx safety', () => {
  it('preserves useful 4xx business feedback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await buildApp('production')('/business');
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      error: 'Categoria já existe',
      code: 'CATEGORY_EXISTS',
    });
    expect(typeof payload.requestId).toBe('string');
  });

  it.each(['production', 'staging'])(
    'hides ApiError 500 detail in %s while preserving diagnostic identifiers',
    async (environment) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = await buildApp(environment)('/api-500');
      const payload = await response.json();

      expect(response.status).toBe(500);
      expect(payload).toMatchObject({
        success: false,
        error: 'Erro interno do servidor',
        code: 'DB_FAILURE',
      });
      expect(typeof payload.requestId).toBe('string');
      expect(JSON.stringify(payload)).not.toMatch(/SQLITE|usuarios_empresas|worker\.ts/i);
    },
  );

  it('hides AppError 503 detail in staging and keeps the operational code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await buildApp('staging')('/app-503');
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      success: false,
      error: 'Serviço temporariamente indisponível.',
      code: 'AUTH_SECURITY_INFRA_ERROR',
    });
    expect(JSON.stringify(payload)).not.toMatch(/blocklist|query|database/i);
  });

  it('does not expose an unexpected stack trace in staging', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await buildApp('staging')('/unexpected');
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
    expect(payload).not.toHaveProperty('stack');
    expect(payload).not.toHaveProperty('errorName');
    expect(JSON.stringify(payload)).not.toMatch(/D1_ERROR|database unavailable|worker\.ts/i);
  });

  it('keeps detailed unexpected errors available in local development only', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await buildApp('development')('/unexpected');
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain('D1_ERROR');
    expect(payload.stack).toEqual(expect.any(String));
  });
});

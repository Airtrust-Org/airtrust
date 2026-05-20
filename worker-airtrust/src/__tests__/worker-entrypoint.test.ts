import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types';
import { assertSafeRuntimeConfig, createWorkerEntrypoint } from '../runtime/worker-entrypoint';
import { createApiNotFoundHandler } from '../runtime/not-found-handler';

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'production',
    API_URL: 'https://api.example.com',
    FRONTEND_URL: 'https://app.example.com',
    DEBUG: 'false',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

describe('worker entrypoint runtime guard', () => {
  it('permite bypass apenas em development', () => {
    expect(() =>
      assertSafeRuntimeConfig(
        createEnv({ ENVIRONMENT: 'development', ENABLE_DEV_AUTH_BYPASS: 'true' }),
      ),
    ).not.toThrow();

    expect(() =>
      assertSafeRuntimeConfig(
        createEnv({ ENVIRONMENT: 'production', ENABLE_DEV_AUTH_BYPASS: 'true' }),
      ),
    ).toThrow('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
  });

  it('executa bootstrap apenas em rotas /api', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/api/health', (c) => c.text('ok'));
    app.get('/health', (c) => c.text('ok'));

    const bootstrap = vi.fn(async () => undefined);
    const scheduled = vi.fn(async () => undefined);

    const entrypoint = createWorkerEntrypoint(app, {
      onApiRequestBootstrap: bootstrap,
      onScheduled: scheduled,
    });

    await entrypoint.fetch(
      new Request('https://airtrust.test/api/health'),
      createEnv(),
      {} as ExecutionContext,
    );
    await entrypoint.fetch(
      new Request('https://airtrust.test/health'),
      createEnv(),
      {} as ExecutionContext,
    );

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('executa o scheduled handler quando o ambiente é válido', async () => {
    const app = new Hono<{ Bindings: Env }>();
    const scheduled = vi.fn(async () => undefined);

    const entrypoint = createWorkerEntrypoint(app, {
      onScheduled: scheduled,
    });

    await entrypoint.scheduled(
      { cron: '0 8 * * *', scheduledTime: Date.now(), type: 'scheduled' } as ScheduledEvent,
      createEnv({ ENVIRONMENT: 'development' }),
      {} as ExecutionContext,
    );

    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  it('retorna JSON padronizado para rotas /api não encontradas', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.notFound(createApiNotFoundHandler());

    const response = await app.request('/api/inexistente');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Endpoint não encontrado',
      code: 'ENDPOINT_NOT_FOUND',
      path: '/api/inexistente',
      method: 'GET',
    });
  });
});

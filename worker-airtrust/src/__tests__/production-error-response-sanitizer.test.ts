import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorHandler } from '../middleware/error-handler';
import { requestIdMiddleware } from '../middleware/requestId';

type TestEnv = {
  Bindings: {
    ENVIRONMENT?: string;
  };
  Variables: {
    requestId?: string;
  };
};

function buildApp() {
  const app = new Hono<TestEnv>();

  app.use('*', requestIdMiddleware());
  app.onError(errorHandler);

  app.get('/direct-500', (c) =>
    c.json(
      {
        success: false,
        error: 'D1_ERROR: UNIQUE constraint failed: usuarios.email',
        details: 'stack and internal details',
      },
      500,
    ),
  );

  app.get('/thrown-500', () => {
    throw new ApiError(
      'D1_ERROR: NOT NULL constraint failed: documentos.empresa_id',
      500,
      'DOCUMENT_WRITE_FAILED',
    );
  });

  app.get('/service-unavailable', (c) =>
    c.json(
      {
        success: false,
        error: 'provider secret or upstream URL leaked here',
        code: 'UPSTREAM_UNAVAILABLE',
      },
      503,
    ),
  );

  app.get('/bad-request', (c) => c.json({ success: false, error: 'Campo obrigatório' }, 400));

  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('production server error response sanitizer', () => {
  it('replaces direct JSON 500 details with a stable public response', async () => {
    const app = buildApp();
    const response = await app.request(
      '/direct-500',
      { headers: { 'X-Request-ID': 'req-direct-500' } },
      { ENVIRONMENT: 'production' },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe('req-direct-500');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
      requestId: 'req-direct-500',
    });
    expect(JSON.stringify(body)).not.toContain('usuarios.email');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('also sanitizes locally-thrown ApiError responses with status 500', async () => {
    const app = buildApp();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request(
      '/thrown-500',
      { headers: { 'X-Request-ID': 'req-thrown-500' } },
      { ENVIRONMENT: 'production' },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Erro interno do servidor',
      code: 'DOCUMENT_WRITE_FAILED',
      requestId: 'req-thrown-500',
    });
  });

  it('preserves a stable public code while hiding 503 implementation details', async () => {
    const app = buildApp();
    const response = await app.request(
      '/service-unavailable',
      { headers: { 'X-Request-ID': 'req-service-503' } },
      { ENVIRONMENT: 'production' },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Serviço temporariamente indisponível',
      code: 'UPSTREAM_UNAVAILABLE',
      requestId: 'req-service-503',
    });
  });

  it('does not rewrite validation errors or non-production diagnostics', async () => {
    const app = buildApp();

    const badRequest = await app.request('/bad-request', {}, { ENVIRONMENT: 'production' });
    expect(await badRequest.json()).toEqual({ success: false, error: 'Campo obrigatório' });

    const developmentError = await app.request('/direct-500', {}, { ENVIRONMENT: 'development' });
    expect(await developmentError.json()).toEqual({
      success: false,
      error: 'D1_ERROR: UNIQUE constraint failed: usuarios.email',
      details: 'stack and internal details',
    });
  });
});

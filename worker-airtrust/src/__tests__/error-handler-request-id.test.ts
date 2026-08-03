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
    empresaId?: string | number;
    userId?: string | number;
  };
};

function buildApp() {
  const app = new Hono<TestEnv>();

  app.use('*', requestIdMiddleware());
  app.use('*', async (c, next) => {
    c.set('empresaId', 'empresa-6');
    c.set('userId', 42);
    await next();
  });
  app.onError(errorHandler);

  app.get('/boom', () => {
    throw new Error('boom');
  });

  app.get('/forbidden', () => {
    throw new ApiError('Acesso negado', 403, 'RBAC_FORBIDDEN');
  });

  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error handler request id consistency', () => {
  it('reuses incoming X-Request-ID in error response and logs', async () => {
    const app = buildApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request(
      '/boom',
      {
        method: 'GET',
        headers: {
          'X-Request-ID': 'req-incoming-123',
        },
      },
      { ENVIRONMENT: 'test' },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe('req-incoming-123');

    const payload = (await response.json()) as {
      success: boolean;
      code?: string;
      requestId?: string;
      stack?: string;
    };

    expect(payload.success).toBe(false);
    expect(payload.code).toBe('INTERNAL_ERROR');
    expect(payload.requestId).toBe('req-incoming-123');
    expect(payload.stack).toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    const errorLog = errorSpy.mock.calls[0]?.[1] as {
      requestId?: string;
      empresaId?: string | number;
      userId?: string | number;
      environment?: string;
    };
    expect(errorLog.requestId).toBe('req-incoming-123');
    expect(errorLog.empresaId).toBe('empresa-6');
    expect(errorLog.userId).toBe(42);
    expect(errorLog.environment).toBe('test');
  });

  it('uses middleware-generated request id when header is absent', async () => {
    const app = buildApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request('/boom', { method: 'GET' }, { ENVIRONMENT: 'test' });

    expect(response.status).toBe(500);

    const responseRequestId = response.headers.get('x-request-id');
    expect(responseRequestId).toBeTruthy();

    const payload = (await response.json()) as { requestId?: string; success: boolean };
    expect(payload.success).toBe(false);
    expect(payload.requestId).toBe(responseRequestId);

    expect(errorSpy).toHaveBeenCalled();
    const errorLog = errorSpy.mock.calls[0]?.[1] as { requestId?: string };
    expect(errorLog.requestId).toBe(responseRequestId);
  });

  it('returns ApiError with stable requestId and no new id generation', async () => {
    const app = buildApp();

    const response = await app.request(
      '/forbidden',
      {
        method: 'GET',
        headers: {
          'X-Request-ID': 'req-api-error-777',
        },
      },
      { ENVIRONMENT: 'test' },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('x-request-id')).toBe('req-api-error-777');

    const payload = (await response.json()) as {
      success: boolean;
      code?: string;
      error?: string;
      requestId?: string;
      stack?: string;
    };

    expect(payload.success).toBe(false);
    expect(payload.code).toBe('RBAC_FORBIDDEN');
    expect(payload.error).toBe('Acesso negado');
    expect(payload.requestId).toBe('req-api-error-777');
    expect(payload.stack).toBeUndefined();
  });
});

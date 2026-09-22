import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../middleware/error-handler';
import { normalizeRequestId, requestIdMiddleware } from '../middleware/requestId';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeRequestId', () => {
  it.each([
    ['a', 'one character'],
    ['frontend.session-123:retry_2', 'safe external correlation ID'],
    ['z'.repeat(128), '128-character boundary'],
  ])('preserves %s (%s)', (requestId) => {
    expect(normalizeRequestId(requestId)).toBe(requestId);
  });

  it('generates a UUID when the external ID is absent', () => {
    expect(normalizeRequestId(undefined)).toMatch(UUID_PATTERN);
  });

  it.each([
    ['', 'empty'],
    ['z'.repeat(129), 'longer than 128 characters'],
    [' tenant-6', 'leading whitespace'],
    ['tenant-6 ', 'trailing whitespace'],
    ['tenant/6 request', 'unsupported punctuation and space'],
    ['safe\u0000id', 'NUL control character'],
    ['safe\tid', 'tab control character'],
    ['safe\r\nX-Evil: injected', 'CRLF header injection'],
  ])('replaces an invalid external ID: %s (%s)', (requestId) => {
    expect(normalizeRequestId(requestId)).toMatch(UUID_PATTERN);
  });
});

describe('requestIdMiddleware', () => {
  it('exposes the same validated ID in the response header and Hono context', async () => {
    const app = new Hono<{ Variables: { requestId: string } }>();
    app.use('*', requestIdMiddleware());
    app.get('/', (c) => c.json({ requestId: c.get('requestId') }));

    const response = await app.request('http://localhost/', {
      headers: { 'X-Request-ID': 'frontend-123' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('frontend-123');
    await expect(response.json()).resolves.toEqual({ requestId: 'frontend-123' });
  });

  it('uses one generated ID in context, response, error payload, and existing error log', async () => {
    const app = new Hono<{
      Bindings: { ENVIRONMENT?: string };
      Variables: { requestId: string };
    }>();
    app.use('*', requestIdMiddleware());
    app.onError(errorHandler);
    app.get('/boom', () => {
      throw new Error('boom');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await app.request(
      '/boom',
      {
        headers: { 'X-Request-ID': 'malicious/request' },
      },
      { ENVIRONMENT: 'test' },
    );
    const generatedId = response.headers.get('X-Request-ID');

    expect(response.status).toBe(500);
    expect(generatedId).toMatch(UUID_PATTERN);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      requestId: generatedId,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errorLog = errorSpy.mock.calls[0]?.[1] as { requestId?: string };
    expect(errorLog.requestId).toBe(generatedId);
    expect(errorLog.requestId).not.toBe('malicious/request');
  });

  it('sanitizes legacy JSON 5xx responses outside production', async () => {
    const app = new Hono<{
      Bindings: { ENVIRONMENT?: string };
      Variables: { requestId: string };
    }>();
    app.use('*', requestIdMiddleware());
    app.get('/legacy-500', (c) =>
      c.json(
        {
          success: false,
          error: 'D1_ERROR: no such table funcionarios',
          code: 'LEGACY_FAILURE',
          detalhes: ['secret-provider-message'],
        },
        500,
      ),
    );

    const response = await app.request(
      '/legacy-500',
      { headers: { 'X-Request-ID': 'test-legacy-500' } },
      { ENVIRONMENT: 'test' },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Erro interno do servidor',
      code: 'LEGACY_FAILURE',
      requestId: 'test-legacy-500',
    });
  });

  it('sanitizes provider failures in NO_CHANNEL_SENT while preserving safe hints', async () => {
    const app = new Hono<{
      Bindings: { ENVIRONMENT?: string };
      Variables: { requestId: string };
    }>();
    app.use('*', requestIdMiddleware());
    app.get('/notification-failure', (c) =>
      c.json(
        {
          success: false,
          error: 'Nenhum envio foi concluído.',
          code: 'NO_CHANNEL_SENT',
          detalhes: ['BREVO_ERROR: 401 - invalid api key'],
          data: {
            alertas: [
              {
                tipo: 'email',
                funcionarioNome: 'Pessoa A',
                status: 'erro',
                erro: 'BREVO_ERROR: 401 - invalid api key',
              },
              {
                tipo: 'whatsapp',
                funcionarioNome: 'Pessoa B',
                status: 'erro',
                erro: 'TWILIO_ERROR: auth token rejected',
              },
              {
                tipo: 'email',
                funcionarioNome: 'Pessoa C',
                status: 'erro',
                erro: 'E-mail não cadastrado para o destinatário.',
              },
            ],
          },
        },
        400,
      ),
    );

    const response = await app.request(
      '/notification-failure',
      { headers: { 'X-Request-ID': 'notification-400' } },
      { ENVIRONMENT: 'staging' },
    );
    const payload = (await response.json()) as {
      requestId: string;
      detalhes: string[];
      data: { alertas: Array<{ erro: string }> };
    };

    expect(response.status).toBe(400);
    expect(payload.requestId).toBe('notification-400');
    expect(payload.data.alertas.map((alerta) => alerta.erro)).toEqual([
      'Falha ao enviar e-mail',
      'Falha ao enviar WhatsApp',
      'E-mail não cadastrado para o destinatário.',
    ]);
    expect(JSON.stringify(payload)).not.toContain('invalid api key');
    expect(JSON.stringify(payload)).not.toContain('auth token rejected');
  });

  it('records a sanitized audit event for authenticated 5xx responses', async () => {
    const calls: Array<{ query: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            calls.push({ query, args });
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;

    const app = new Hono<{
      Bindings: {
        ENVIRONMENT?: string;
        AIRTRUST_SOURCE_SHA?: string;
        DB: D1Database;
      };
      Variables: {
        requestId: string;
        empresaId: number;
        userId: number;
        userRole: string;
      };
    }>();
    app.use('*', requestIdMiddleware());
    app.use('*', async (c, next) => {
      c.set('empresaId', 6);
      c.set('userId', 16);
      c.set('userRole', 'INSTRUTOR');
      await next();
    });
    app.get('/legacy-500', (c) =>
      c.json({ success: false, error: 'raw failure', code: 'ME_ERROR' }, 500),
    );

    const response = await app.request(
      '/legacy-500',
      { headers: { 'X-Request-ID': 'carlos-incident-001' } },
      {
        ENVIRONMENT: 'production',
        AIRTRUST_SOURCE_SHA: 'a99f4d8627f4e5ff41524a7baf7aff77f926a29d',
        DB: db,
      },
    );

    expect(response.status).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain('INSERT INTO audit_events_v2');
    expect(calls[0].args[1]).toBe(6);
    expect(calls[0].args[3]).toBe(16);
    expect(calls[0].args[5]).toBe('INSTRUTOR');
    expect(calls[0].args[9]).toBe('carlos-incident-001');
    expect(calls[0].args[13]).toBe('SYSTEM_ERROR');
    expect(calls[0].args[14]).toBe('HTTP_5XX');
    expect(calls[0].args[18]).toBe(0);
    expect(calls[0].args[19]).toBe('ME_ERROR');
    expect(JSON.parse(String(calls[0].args[20]))).toEqual({
      module: 'http',
      source: 'a99f4d8627f4e5ff41524a7baf7aff77f926a29d',
      request_path: '/legacy-500',
      http_method: 'GET',
      result: 500,
      reason_code: 'ME_ERROR',
    });
    expect(calls[0].args[21]).toBe('OPS_SHORT');
  });
});

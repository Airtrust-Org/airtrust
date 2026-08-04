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
});

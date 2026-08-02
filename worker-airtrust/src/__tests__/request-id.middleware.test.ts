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
});

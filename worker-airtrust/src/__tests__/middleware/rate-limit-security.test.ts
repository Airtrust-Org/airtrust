import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import {
  rateLimiter,
  resolveRateLimitIdentifier,
  type RateLimitConfig,
} from '../../middleware/rate-limit';

function failingDb(): D1Database {
  const first = vi.fn().mockRejectedValue(new Error('D1 unavailable'));
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare } as unknown as D1Database;
}

async function requestWith(config: RateLimitConfig, headers: Record<string, string> = {}) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/test', rateLimiter(config));
  app.get('/test', (c) => c.json({ success: true }));
  const env = {
    DB: failingDb(),
    ENVIRONMENT: 'production',
  } as unknown as Env;
  return app.request('http://localhost/test', { headers }, env);
}

describe('rate limiter security degradation', () => {
  it('fails closed for authentication when D1 is unavailable', async () => {
    const response = await requestWith(
      { maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-login' },
      { 'CF-Connecting-IP': '203.0.113.10' },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMIT_UNAVAILABLE' });
  });

  it('keeps non-critical routes available with local complementary protection', async () => {
    const response = await requestWith(
      { maxRequests: 5, windowSeconds: 60, keyPrefix: 'report', failureMode: 'open' },
      { 'CF-Connecting-IP': '203.0.113.11' },
    );
    expect(response.status).toBe(200);
  });

  it('rejects missing IP on critical routes and ignores forged X-Forwarded-For', async () => {
    const response = await requestWith(
      { maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-refresh' },
      { 'X-Forwarded-For': '198.51.100.77' },
    );
    expect(response.status).toBe(503);
  });


  it('allows an explicit non-production local identity override without trusting X-Forwarded-For', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use(
      '/test',
      rateLimiter({
        maxRequests: 5,
        windowSeconds: 60,
        keyPrefix: 'certificate-validation',
        failureMode: 'closed',
        allowLocalFallback: false,
        allowLocalFallbackOutsideProduction: true,
      }),
    );
    app.get('/test', (c) => c.json({ success: true }));
    const env = {
      DB: failingDb(),
      ENVIRONMENT: 'test',
    } as unknown as Env;

    const response = await app.request(
      'http://localhost/test',
      { headers: { 'X-Forwarded-For': '198.51.100.77' } },
      env,
    );

    expect(response.status).toBe(200);
  });

  it('never creates a shared global unknown bucket', () => {
    const first = resolveRateLimitIdentifier({ requestId: 'request-a' }, 'open');
    const second = resolveRateLimitIdentifier({ requestId: 'request-b' }, 'open');
    expect(first.identifier).toBe('missing:request-a');
    expect(second.identifier).toBe('missing:request-b');
    expect(first.identifier).not.toBe(second.identifier);
  });
});

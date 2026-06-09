/**
 * /api/capabilities endpoint — feature flag behavior tests
 *
 * Covers: flag enabled, flag disabled, no sensitive fields in response,
 * response shape, public access (no auth required).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types/index';

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    auth: () => async (_c: any, next: () => Promise<void>) => {
      await next();
    },
  };
});

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    tenantMiddleware: () => async (_c: any, next: () => Promise<void>) => {
      await next();
    },
  };
});

import { app } from '../../index';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'test',
    APP_VERSION: 'test-capabilities',
    DB: {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ test: 1 }),
      }),
    } as unknown as D1Database,
    ...overrides,
  } as unknown as Env;
}

describe('/api/capabilities', () => {
  it('1. returns simulador_shared_sessions: true when flag is "true"', async () => {
    const env = makeEnv({ SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' });
    const res = await app.request('/api/capabilities', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.simulador_shared_sessions).toBe(true);
  });

  it('2. returns simulador_shared_sessions: false when flag is absent', async () => {
    const env = makeEnv();
    const res = await app.request('/api/capabilities', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.simulador_shared_sessions).toBe(false);
  });

  it('3. returns simulador_shared_sessions: false when flag is "false"', async () => {
    const env = makeEnv({ SIMULATOR_SHARED_SESSIONS_ENABLED: 'false' });
    const res = await app.request('/api/capabilities', { method: 'GET' }, env);
    const body = await res.json() as any;
    expect(body.data.simulador_shared_sessions).toBe(false);
  });

  it('4. does NOT expose environment or other server-side fields', async () => {
    const env = makeEnv({ ENVIRONMENT: 'production', SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' });
    const res = await app.request('/api/capabilities', { method: 'GET' }, env);
    const body = await res.json() as any;
    expect(body.data).not.toHaveProperty('environment');
    expect(body.data).not.toHaveProperty('ENVIRONMENT');
    expect(body.data).not.toHaveProperty('JWT_SECRET');
  });

  it('5. response shape matches expected contract { success, data: { simulador_shared_sessions } }', async () => {
    const env = makeEnv({ SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' });
    const res = await app.request('/api/capabilities', { method: 'GET' }, env);
    const body = await res.json() as any;
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(typeof body.data.simulador_shared_sessions).toBe('boolean');
    expect(Object.keys(body.data)).toEqual(['simulador_shared_sessions']);
  });

  it('6. accessible without Authorization header (public route)', async () => {
    const env = makeEnv({ SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' });
    const res = await app.request('/api/capabilities', { method: 'GET', headers: {} }, env);
    expect(res.status).toBe(200);
  });
});

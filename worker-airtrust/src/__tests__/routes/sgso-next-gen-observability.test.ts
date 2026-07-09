import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'mock-user-id');
    c.set('userRole', 'admin');
    c.set('empresaId', 123);
    c.set('tenantContext', { empresaId: 123, role: 'admin' });
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import sgsoNextGen from '../../routes/sgso-next-gen';
import type { Env } from '../../types';

describe('SGSO Next Gen Observability', () => {
  let app: Hono<{ Bindings: Env }>;
  const originalConsoleError = console.error;
  const mockConsoleError = vi.fn();

  beforeEach(() => {
    console.error = mockConsoleError;
    app = new Hono<{ Bindings: Env }>();

    app.use('*', async (c, next) => {
      c.set('tenantContext', { empresaId: 123, role: 'admin' });
      
      // DB mock that always throws D1 error
      const mockDB = {
        prepare: () => ({
          bind: () => ({
            first: async () => { throw new Error('Simulated D1 Error (UNIQUE constraint failed)'); },
            all: async () => { throw new Error('Simulated D1 Error'); },
            run: async () => { throw new Error('Simulated D1 Error'); },
          }),
        }),
      };
      c.env = { DB: mockDB as any } as Env;
      await next();
    });

    app.route('/sgso/next', sgsoNextGen);
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  it('should return 500 without leaking details when GET /relprev/submissoes fails', async () => {
    const res = await app.request('/sgso/next/relprev/submissoes');

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);

    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const logCall = mockConsoleError.mock.calls[0][0];

    expect(logCall).toContain('[sgso-next]');
    expect(logCall).toContain('GET /sgso/next/relprev/submissoes');
    expect(logCall).toContain('123');
    expect(logCall).toContain('Simulated D1 Error');
  });

  it('should return 500 without leaking details when GET /relprev/triagem/pendentes fails', async () => {
    const res = await app.request('/sgso/next/relprev/triagem/pendentes');

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);

    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const logCall = mockConsoleError.mock.calls[0][0];

    expect(logCall).toContain('[sgso-next]');
    expect(logCall).toContain('GET /sgso/next/relprev/triagem/pendentes');
    expect(logCall).toContain('123');
    expect(logCall).toContain('Simulated D1 Error');
  });
});

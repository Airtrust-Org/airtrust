import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requireRole } from '../../middleware/rbac';
import { isLegacyPlatformAdminUserId } from '../../middleware/tenant';

function buildSupportProbeApp() {
  const app = new Hono<{ Bindings: Env; Variables: { userRole?: string; userId?: number } }>();
  app.onError(errorHandler);

  app.use('*', async (c, next) => {
    c.set('userId', Number(c.req.header('x-user-id') || 44));
    c.set('userRole', c.req.header('x-role') || 'support');
    await next();
  });

  app.get('/admin-only', requireRole('admin'), (c) => c.json({ success: true }));

  return app;
}

describe('support role not yet active', () => {
  it('does not grant support users admin RBAC access without a future migration-backed role', async () => {
    const response = await buildSupportProbeApp().request(
      '/admin-only',
      {
        headers: {
          'x-role': 'support',
          'x-user-id': '44',
        },
      },
      { ENVIRONMENT: 'test', ENABLE_DEV_AUTH_BYPASS: 'false' } as unknown as Env,
    );

    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe('RBAC_FORBIDDEN');
    expect(isLegacyPlatformAdminUserId(44)).toBe(false);
  });
});

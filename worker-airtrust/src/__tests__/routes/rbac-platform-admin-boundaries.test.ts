import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env, Variables } from '../../types';
import {
  isAirtrustPlatformTenant,
  isLegacyPlatformAdminUserId,
  isPlatformAdminContext,
} from '../../middleware/tenant';

function buildPlatformProbeApp(params: {
  empresaCodigo: string;
  userId: number | string;
  role?: 'admin' | 'manager' | 'viewer';
}) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use('*', async (c, next) => {
    c.set('userId', params.userId);
    c.set('tenantContext', {
      empresaId: params.empresaCodigo === 'airtrust' ? 1 : 44,
      empresaCodigo: params.empresaCodigo,
      empresaNome: params.empresaCodigo,
      role: params.role || 'admin',
      plano: 'pro',
      permissions: ['*'],
    });
    await next();
  });

  app.get('/platform-probe', (c) =>
    c.json({
      platform: isPlatformAdminContext(c),
    }),
  );

  return app;
}

async function hitPlatformProbe(params: {
  empresaCodigo: string;
  userId: number | string;
  role?: 'admin' | 'manager' | 'viewer';
}) {
  const app = buildPlatformProbeApp(params);
  const response = await app.request('/platform-probe', {}, { ENVIRONMENT: 'test' } as Env);
  return response.json() as Promise<{ platform: boolean }>;
}

describe('RBAC platform admin boundaries', () => {
  it('keeps the AirTrust tenant as platform-admin context', async () => {
    await expect(hitPlatformProbe({ empresaCodigo: 'airtrust', userId: 42 })).resolves.toEqual({
      platform: true,
    });
  });

  it('keeps legacy user 1 compatibility as the only user-id platform shortcut', async () => {
    expect(isLegacyPlatformAdminUserId(1)).toBe(true);
    expect(isLegacyPlatformAdminUserId('1')).toBe(true);
    expect(isLegacyPlatformAdminUserId(2)).toBe(false);

    await expect(hitPlatformProbe({ empresaCodigo: 'tenant-a', userId: 1 })).resolves.toEqual({
      platform: true,
    });
  });

  it('does not treat regular tenant admins as platform admins', async () => {
    expect(isAirtrustPlatformTenant({ empresaCodigo: 'tenant-a' })).toBe(false);

    await expect(hitPlatformProbe({ empresaCodigo: 'tenant-a', userId: 42 })).resolves.toEqual({
      platform: false,
    });
  });
});

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env, Variables } from '../../types';
import {
  isLegacyPlatformAdminUserId,
  isPlatformAdminContext,
} from '../../middleware/tenant';
import type { PlatformAccessState } from '../../lib/rbac/platform-access';

function buildPlatformProbeApp(params: {
  empresaCodigo: string;
  userId: number | string;
  role?: 'admin' | 'manager' | 'viewer';
  platformAccessState?: PlatformAccessState;
}) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use('*', async (c, next) => {
    c.set('userId', Number(params.userId));
    c.set('tenantContext', {
      empresaId: params.empresaCodigo === 'airtrust' ? 1 : 44,
      empresaCodigo: params.empresaCodigo,
      empresaNome: params.empresaCodigo,
      role: params.role || 'admin',
      plano: 'pro',
      permissions: ['*'],
    });
    if (params.platformAccessState) {
      c.set('platformAccessState', params.platformAccessState);
    }
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
  platformAccessState?: PlatformAccessState;
}) {
  const app = buildPlatformProbeApp(params);
  const response = await app.request('/platform-probe', {}, { ENVIRONMENT: 'test' } as unknown as Env);
  return response.json() as Promise<{ platform: boolean }>;
}

describe('RBAC platform admin boundaries', () => {
  it('does not promote all users in airtrust tenant to platform admin', async () => {
    await expect(hitPlatformProbe({ empresaCodigo: 'airtrust', userId: 42 })).resolves.toEqual({
      platform: false,
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
    await expect(hitPlatformProbe({ empresaCodigo: 'tenant-a', userId: 42 })).resolves.toEqual({
      platform: false,
    });
  });

  it('accepts explicit persisted platform role via context state', async () => {
    await expect(
      hitPlatformProbe({
        empresaCodigo: 'tenant-a',
        userId: 42,
        platformAccessState: {
          userId: 42,
          isLegacyPlatformAdmin: false,
          hasPersistedPlatformAdmin: true,
          hasSupportReadOnlyRole: false,
          hasSupportElevatedRole: false,
          supportGrants: [],
          source: 'persisted',
        },
      }),
    ).resolves.toEqual({
      platform: true,
    });
  });
});

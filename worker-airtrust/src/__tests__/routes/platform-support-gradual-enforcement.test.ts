import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requireControlledAdminOrSupportAccess } from '../../middleware/platform-support';
import { recordLegacyAndCanonicalAudit } from '../../lib/audit/record-legacy-and-canonical-audit';
import { resolvePlatformAccessState } from '../../lib/rbac/platform-access';

vi.mock('../../lib/audit/record-legacy-and-canonical-audit', () => ({
  recordLegacyAndCanonicalAudit: vi.fn(async () => ({})),
}));

vi.mock('../../lib/rbac/platform-access', () => ({
  resolvePlatformAccessState: vi.fn(async (_db: D1Database, userId: number | string) => {
    const normalized = Number(userId);
    if (normalized === 1) {
      return {
        userId: 1,
        isLegacyPlatformAdmin: true,
        hasPersistedPlatformAdmin: false,
        hasSupportReadOnlyRole: false,
        hasSupportElevatedRole: false,
        supportGrants: [],
        source: 'legacy',
      };
    }
    if (normalized === 88) {
      return {
        userId: 88,
        isLegacyPlatformAdmin: false,
        hasPersistedPlatformAdmin: false,
        hasSupportReadOnlyRole: true,
        hasSupportElevatedRole: false,
        supportGrants: [{ empresaId: 7, accessLevel: 'read_only' }],
        source: 'persisted',
      };
    }
    if (normalized === 99) {
      return {
        userId: 99,
        isLegacyPlatformAdmin: false,
        hasPersistedPlatformAdmin: false,
        hasSupportReadOnlyRole: true,
        hasSupportElevatedRole: true,
        supportGrants: [{ empresaId: 7, accessLevel: 'elevated' }],
        source: 'persisted',
      };
    }
    return {
      userId: normalized,
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: false,
      hasSupportReadOnlyRole: false,
      hasSupportElevatedRole: false,
      supportGrants: [],
      source: 'none',
    };
  }),
  isPlatformAdminAccess: (state: {
    hasPersistedPlatformAdmin: boolean;
    isLegacyPlatformAdmin: boolean;
  }) => state.hasPersistedPlatformAdmin || state.isLegacyPlatformAdmin,
  canStartSupportReadOnlySession: (
    state: {
      hasSupportReadOnlyRole: boolean;
      supportGrants: Array<{ empresaId: number; accessLevel: 'read_only' | 'elevated' }>;
    },
    empresaId: number,
    supportReason?: string | null,
  ) =>
    Boolean(supportReason) &&
    state.hasSupportReadOnlyRole &&
    state.supportGrants.some(
      (grant) =>
        grant.empresaId === empresaId &&
        (grant.accessLevel === 'read_only' || grant.accessLevel === 'elevated'),
    ),
  canPerformSupportMutation: (
    state: {
      hasSupportElevatedRole: boolean;
      supportGrants: Array<{ empresaId: number; accessLevel: 'read_only' | 'elevated' }>;
    },
    empresaId: number,
    supportReason?: string | null,
  ) =>
    Boolean(supportReason) &&
    state.hasSupportElevatedRole &&
    state.supportGrants.some(
      (grant) => grant.empresaId === empresaId && grant.accessLevel === 'elevated',
    ),
}));

function createDbStub() {
  return {
    prepare: vi.fn((_query: string) => {
      const statement = {
        bind: vi.fn(() => statement),
        first: vi.fn(async () => ({ found: 0 })),
        run: vi.fn(async () => ({ success: true })),
      };
      return statement;
    }),
  } as unknown as D1Database;
}

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('userId', Number(c.req.header('x-user-id') || 44));
    c.set('empresaId', Number(c.req.header('x-empresa-id') || 7));
    c.set('userRole', c.req.header('x-role') || 'viewer');
    await next();
  });
  app.post(
    '/controlled',
    requireControlledAdminOrSupportAccess({
      action: 'CERTIFICADOS_EXPORT_ZIP',
      access: 'mutation',
      entityType: 'certificados_admin_ops',
      module: 'qualificacoes_certificados',
    }),
    (c) => c.json({ success: true }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('platform support gradual enforcement', () => {
  it('still allows tenant admins without platform support grants', async () => {
    const response = await buildApp().request(
      '/controlled',
      {
        method: 'POST',
        headers: {
          'x-role': 'admin',
          'x-user-id': '44',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(resolvePlatformAccessState)).not.toHaveBeenCalled();
    expect(vi.mocked(recordLegacyAndCanonicalAudit)).not.toHaveBeenCalled();
  });

  it('keeps the legacy userId 1 fallback active', async () => {
    const response = await buildApp().request(
      '/controlled',
      {
        method: 'POST',
        headers: {
          'x-role': 'viewer',
          'x-user-id': '1',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
  });

  it('denies read-only support on mutation scope and records the denial audit', async () => {
    const response = await buildApp().request(
      '/controlled',
      {
        method: 'POST',
        headers: {
          'x-role': 'viewer',
          'x-user-id': '88',
          'x-airtrust-support-reason': 'ticket_123',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe('SUPPORT_ACCESS_FORBIDDEN');
    expect(vi.mocked(recordLegacyAndCanonicalAudit)).toHaveBeenCalledTimes(1);
  });

  it('allows elevated support within the controlled scope when grant and reason exist', async () => {
    const response = await buildApp().request(
      '/controlled',
      {
        method: 'POST',
        headers: {
          'x-role': 'viewer',
          'x-user-id': '99',
          'x-airtrust-support-reason': 'ticket_456',
          'x-request-id': 'req-99',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(recordLegacyAndCanonicalAudit)).toHaveBeenCalledTimes(1);
  });
});

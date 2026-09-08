import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPerformSupportMutation,
  canStartSupportReadOnlySession,
  isPlatformAdminAccess,
  resolvePlatformAccessState,
} from '../../lib/rbac/platform-access';
import { resetSchemaCache } from '../../utils/db-schema';

function createDb(options: {
  hasPlatformRolesTable?: boolean;
  hasSupportGrantsTable?: boolean;
  roles?: Array<'platform_admin' | 'support_read_only' | 'support_elevated'>;
  grants?: Array<{ empresa_id: number; access_level: 'read_only' | 'elevated' }>;
} = {}) {
  const {
    hasPlatformRolesTable = true,
    hasSupportGrantsTable = true,
    roles = [],
    grants = [],
  } = options;

  const prepare = vi.fn((query: string) => ({
    bind: vi.fn((...args: unknown[]) => ({
      first: vi.fn(async () => {
        if (query.includes('sqlite_master') && args[0] === 'user_platform_roles') {
          return { found: hasPlatformRolesTable ? 1 : 0 };
        }
        if (query.includes('sqlite_master') && args[0] === 'support_access_grants') {
          return { found: hasSupportGrantsTable ? 1 : 0 };
        }
        return null;
      }),
      all: vi.fn(async () => {
        if (query.includes('FROM user_platform_roles')) {
          return { results: roles.map((role_code) => ({ role_code })) };
        }
        if (query.includes('FROM support_access_grants')) {
          return { results: grants };
        }
        return { results: [] };
      }),
    })),
    first: vi.fn(async () => null),
    all: vi.fn(async () => ({ results: [] })),
  }));

  return { db: { prepare } as unknown as D1Database, prepare };
}

beforeEach(() => {
  resetSchemaCache();
});

describe('platform access foundation', () => {
  it('does not grant platform admin to user 1 without persisted role', async () => {
    const { db } = createDb({ hasPlatformRolesTable: false, hasSupportGrantsTable: false });
    const state = await resolvePlatformAccessState(db, 1);

    expect(state.source).toBe('none');
    expect(state.isLegacyPlatformAdmin).toBe(false);
    expect(isPlatformAdminAccess(state)).toBe(false);
    expect(canStartSupportReadOnlySession(state, 7, 'ticket-1')).toBe(false);
  });

  it('recognizes persisted platform and support roles with tenant-scoped grants', async () => {
    const { db } = createDb({
      roles: ['platform_admin', 'support_read_only'],
      grants: [{ empresa_id: 7, access_level: 'read_only' }],
    });
    const state = await resolvePlatformAccessState(db, 44);

    expect(state.source).toBe('persisted');
    expect(state.hasPersistedPlatformAdmin).toBe(true);
    expect(isPlatformAdminAccess(state)).toBe(true);
    expect(canStartSupportReadOnlySession(state, 7, 'ticket-4812')).toBe(true);
    expect(canStartSupportReadOnlySession(state, 7, '')).toBe(false);
    expect(canPerformSupportMutation(state, 7, 'ticket-4812')).toBe(false);
  });

  it('grants platform admin by persisted role even when user is not legacy id=1', async () => {
    const { db } = createDb({ roles: ['platform_admin'] });
    const state = await resolvePlatformAccessState(db, 99);

    expect(state.userId).toBe(99);
    expect(state.isLegacyPlatformAdmin).toBe(false);
    expect(state.hasPersistedPlatformAdmin).toBe(true);
    expect(state.source).toBe('persisted');
    expect(isPlatformAdminAccess(state)).toBe(true);
  });

  it('requires elevated role plus elevated grant for support mutations', async () => {
    const { db } = createDb({
      roles: ['support_elevated'],
      grants: [{ empresa_id: 9, access_level: 'elevated' }],
    });
    const state = await resolvePlatformAccessState(db, 77);

    expect(canStartSupportReadOnlySession(state, 9, 'incident-9')).toBe(true);
    expect(canPerformSupportMutation(state, 9, 'incident-9')).toBe(true);
    expect(canPerformSupportMutation(state, 9, '')).toBe(false);
    expect(canPerformSupportMutation(state, 7, 'incident-9')).toBe(false);
  });

  it('probes platform schema tables only once per worker lifetime', async () => {
    const { db, prepare } = createDb({ roles: ['platform_admin'] });

    await resolvePlatformAccessState(db, 10);
    await resolvePlatformAccessState(db, 11);

    const schemaProbes = prepare.mock.calls.filter(([query]) => String(query).includes('sqlite_master'));
    expect(schemaProbes).toHaveLength(2);
  });
});

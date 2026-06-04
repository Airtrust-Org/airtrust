import { describe, expect, it, vi } from 'vitest';
import {
  canPerformSupportMutation,
  canStartSupportReadOnlySession,
  isPlatformAdminAccess,
  resolvePlatformAccessState,
} from '../../lib/rbac/platform-access';

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

  return {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => {
          if (query.includes("name = 'user_platform_roles'")) {
            return { found: hasPlatformRolesTable ? 1 : 0 };
          }
          if (query.includes("name = 'support_access_grants'")) {
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
      first: vi.fn(async () => {
        if (query.includes("name = 'user_platform_roles'")) {
          return { found: hasPlatformRolesTable ? 1 : 0 };
        }
        if (query.includes("name = 'support_access_grants'")) {
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
  } as unknown as D1Database;
}

describe('platform access foundation', () => {
  it('keeps legacy user 1 compatibility as platform admin while no persisted role exists', async () => {
    const state = await resolvePlatformAccessState(
      createDb({ hasPlatformRolesTable: false, hasSupportGrantsTable: false }),
      1,
    );

    expect(state.source).toBe('legacy');
    expect(isPlatformAdminAccess(state)).toBe(true);
    expect(canStartSupportReadOnlySession(state, 7, 'ticket-1')).toBe(false);
  });

  it('recognizes persisted platform and support roles with tenant-scoped grants', async () => {
    const state = await resolvePlatformAccessState(
      createDb({
        roles: ['platform_admin', 'support_read_only'],
        grants: [{ empresa_id: 7, access_level: 'read_only' }],
      }),
      44,
    );

    expect(state.source).toBe('persisted');
    expect(state.hasPersistedPlatformAdmin).toBe(true);
    expect(isPlatformAdminAccess(state)).toBe(true);
    expect(canStartSupportReadOnlySession(state, 7, 'ticket-4812')).toBe(true);
    expect(canStartSupportReadOnlySession(state, 7, '')).toBe(false);
    expect(canPerformSupportMutation(state, 7, 'ticket-4812')).toBe(false);
  });

  it('requires elevated role plus elevated grant for support mutations', async () => {
    const state = await resolvePlatformAccessState(
      createDb({
        roles: ['support_elevated'],
        grants: [{ empresa_id: 9, access_level: 'elevated' }],
      }),
      77,
    );

    expect(canStartSupportReadOnlySession(state, 9, 'incident-9')).toBe(true);
    expect(canPerformSupportMutation(state, 9, 'incident-9')).toBe(true);
    expect(canPerformSupportMutation(state, 9, '')).toBe(false);
    expect(canPerformSupportMutation(state, 7, 'incident-9')).toBe(false);
  });
});

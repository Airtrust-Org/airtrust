import { hasSchemaTable } from '../../utils/db-schema';

export type PlatformRoleCode = 'platform_admin' | 'support_read_only' | 'support_elevated';
export type SupportAccessLevel = 'read_only' | 'elevated';

export interface SupportGrant {
  empresaId: number;
  accessLevel: SupportAccessLevel;
}

export interface PlatformAccessState {
  userId: number;
  isLegacyPlatformAdmin: boolean;
  hasPersistedPlatformAdmin: boolean;
  hasSupportReadOnlyRole: boolean;
  hasSupportElevatedRole: boolean;
  supportGrants: SupportGrant[];
  source: 'persisted' | 'none';
}

type RoleRow = {
  role_code: PlatformRoleCode;
};

type SupportGrantRow = {
  empresa_id: number;
  access_level: SupportAccessLevel;
};

function normalizeUserId(userId: number | string | null | undefined): number {
  const parsed = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function resolvePlatformAccessState(
  db: D1Database,
  userId: number | string | null | undefined,
): Promise<PlatformAccessState> {
  const normalizedUserId = normalizeUserId(userId);

  if (normalizedUserId <= 0) {
    return {
      userId: normalizedUserId,
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: false,
      hasSupportReadOnlyRole: false,
      hasSupportElevatedRole: false,
      supportGrants: [],
      source: 'none',
    };
  }

  const [hasPlatformRolesTable, hasSupportGrantsTable] = await Promise.all([
    hasSchemaTable(db, 'user_platform_roles'),
    hasSchemaTable(db, 'support_access_grants'),
  ]);

  const roleRows = hasPlatformRolesTable
    ? await db
        .prepare(
          `
          SELECT role_code
          FROM user_platform_roles
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `,
        )
        .bind(normalizedUserId)
        .all<RoleRow>()
    : { results: [] as RoleRow[] };

  const supportGrantRows = hasSupportGrantsTable
    ? await db
        .prepare(
          `
          SELECT empresa_id, access_level
          FROM support_access_grants
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `,
        )
        .bind(normalizedUserId)
        .all<SupportGrantRow>()
    : { results: [] as SupportGrantRow[] };

  const activeRoles = new Set((roleRows.results || []).map((row) => row.role_code));
  const supportGrants = (supportGrantRows.results || []).map((row) => ({
    empresaId: Number(row.empresa_id),
    accessLevel: row.access_level,
  }));

  const hasPersistedPlatformAdmin = activeRoles.has('platform_admin');
  const hasSupportReadOnlyRole =
    activeRoles.has('support_read_only') || activeRoles.has('support_elevated');
  const hasSupportElevatedRole = activeRoles.has('support_elevated');

  return {
    userId: normalizedUserId,
    isLegacyPlatformAdmin: false,
    hasPersistedPlatformAdmin,
    hasSupportReadOnlyRole,
    hasSupportElevatedRole,
    supportGrants,
    source:
      hasPersistedPlatformAdmin || hasSupportReadOnlyRole || hasSupportElevatedRole
        ? 'persisted'
        : 'none',
  };
}

export function isPlatformAdminAccess(state: PlatformAccessState): boolean {
  return state.hasPersistedPlatformAdmin;
}

export function canStartSupportReadOnlySession(
  state: PlatformAccessState,
  empresaId: number,
  supportReason?: string | null,
): boolean {
  if (!state.hasSupportReadOnlyRole) return false;
  if (!supportReason || supportReason.trim().length === 0) return false;
  return state.supportGrants.some(
    (grant) => grant.empresaId === empresaId && (grant.accessLevel === 'read_only' || grant.accessLevel === 'elevated'),
  );
}

export function canPerformSupportMutation(
  state: PlatformAccessState,
  empresaId: number,
  supportReason?: string | null,
): boolean {
  if (!state.hasSupportElevatedRole) return false;
  if (!supportReason || supportReason.trim().length === 0) return false;
  return state.supportGrants.some(
    (grant) => grant.empresaId === empresaId && grant.accessLevel === 'elevated',
  );
}

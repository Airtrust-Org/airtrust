import { hasSchemaTable } from '../../utils/db-schema';
import { isTransientD1Error, withD1Retry } from '../../utils/d1-resilience';

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
  earliestExpiryMs?: number | null;
}

type RoleRow = {
  role_code: PlatformRoleCode;
  expires_at?: string | null;
};

type SupportGrantRow = {
  empresa_id: number;
  access_level: SupportAccessLevel;
  expires_at?: string | null;
};

function normalizeUserId(userId: number | string | null | undefined): number {
  const parsed = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface CachedPlatformAccess {
  expiresAt: number;
  state: PlatformAccessState;
}

const _platformAccessCache = new Map<number, CachedPlatformAccess>();
const PLATFORM_ACCESS_CACHE_TTL_MS = 60000;
const MAX_PLATFORM_ACCESS_CACHE_SIZE = 1000;

function pruneExpiredPlatformAccessCache(now: number): void {
  for (const [key, entry] of _platformAccessCache.entries()) {
    if (entry.expiresAt <= now) {
      _platformAccessCache.delete(key);
    }
  }
}

export function resetPlatformAccessCache(): void {
  _platformAccessCache.clear();
}

export function invalidatePlatformAccessCache(userId: number): void {
  _platformAccessCache.delete(userId);
}

export function getPlatformAccessCacheSize(): number {
  return _platformAccessCache.size;
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

  const now = Date.now();
  const cached = _platformAccessCache.get(normalizedUserId);
  if (cached && cached.expiresAt > now) {
    return cached.state;
  }
  if (cached) {
    _platformAccessCache.delete(normalizedUserId);
  }

  const state = await readPersistedPlatformStateWithRetry(db, normalizedUserId);

  if (_platformAccessCache.size >= MAX_PLATFORM_ACCESS_CACHE_SIZE) {
    pruneExpiredPlatformAccessCache(now);
    while (_platformAccessCache.size >= MAX_PLATFORM_ACCESS_CACHE_SIZE) {
      const oldestKey = _platformAccessCache.keys().next().value;
      if (!oldestKey) break;
      _platformAccessCache.delete(oldestKey);
    }
  }

  let ttl = PLATFORM_ACCESS_CACHE_TTL_MS;
  if (typeof state.earliestExpiryMs === 'number' && state.earliestExpiryMs > now) {
    ttl = Math.min(ttl, state.earliestExpiryMs - now);
  }
  _platformAccessCache.set(normalizedUserId, { expiresAt: now + ttl, state });

  return state;
}

/**
 * Só repete consultas de leitura quando o D1 apresenta falha transitória
 * reconhecível. Erros de schema, autorização e falha persistente continuam
 * propagados à autenticação (503 fail-closed); nunca há fallback para o JWT.
 */
function isTransientPlatformAccessReadError(error: unknown): boolean {
  return isTransientD1Error(error);
}

async function readPersistedPlatformStateWithRetry(
  db: D1Database,
  userId: number,
): Promise<PlatformAccessState> {
  return withD1Retry(() => readPersistedPlatformState(db, userId), 2, 30);
}

async function readPersistedPlatformState(
  db: D1Database,
  normalizedUserId: number,
): Promise<PlatformAccessState> {
  const hasPlatformRolesTable = await hasSchemaTable(db, 'user_platform_roles');

  const roleRows = hasPlatformRolesTable
    ? await db
        .prepare(
          `
          SELECT role_code, expires_at
          FROM user_platform_roles
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `,
        )
        .bind(normalizedUserId)
        .all<RoleRow>()
    : { results: [] as RoleRow[] };

  let earliestExpiryMs: number | null = null;
  for (const row of roleRows.results || []) {
    if (row.expires_at) {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp)) {
        earliestExpiryMs = earliestExpiryMs === null ? exp : Math.min(earliestExpiryMs, exp);
      }
    }
  }

  const activeRoles = new Set((roleRows.results || []).map((row) => row.role_code));
  // Nenhuma concessão de suporte é autorizada apenas por ter uma linha de
  // grant. Sem role de suporte persistida, consultar a tabela de grants não
  // acrescenta privilégio e só aumenta carga/leitura no D1 por request.
  const needsSupportGrants = activeRoles.has('support_read_only') ||
    activeRoles.has('support_elevated');
  const hasSupportGrantsTable = needsSupportGrants &&
    await hasSchemaTable(db, 'support_access_grants');
  const supportGrantRows = hasSupportGrantsTable
    ? await db
        .prepare(
          `
          SELECT empresa_id, access_level, expires_at
          FROM support_access_grants
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        `,
        )
        .bind(normalizedUserId)
        .all<SupportGrantRow>()
    : { results: [] as SupportGrantRow[] };

  for (const row of supportGrantRows.results || []) {
    if (row.expires_at) {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp)) {
        earliestExpiryMs = earliestExpiryMs === null ? exp : Math.min(earliestExpiryMs, exp);
      }
    }
  }

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
    earliestExpiryMs,
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

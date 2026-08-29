/**
 * eDB shadow activation gate.
 *
 * The eDB foundation may exist in the codebase while remaining unreachable.
 * Shadow runtime is intentionally staging-only and tenant allowlisted. Production
 * always fails closed until the external ANAC/signature activation gates are met.
 */
export interface EdbShadowFlagEnv {
  ENVIRONMENT?: string;
  EDB_SHADOW_PILOT_TENANTS?: string;
}

function parseExplicitTenantIds(raw: string): number[] | null {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  if (parts.some((part) => !/^[1-9]\d*$/.test(part))) return null;
  return [...new Set(parts.map(Number))];
}

export function isEdbShadowEnabledForTenant(env: EdbShadowFlagEnv, tenantId: number): boolean {
  if (env.ENVIRONMENT !== 'staging') return false;
  if (!Number.isInteger(tenantId) || tenantId <= 0) return false;

  const raw = (env.EDB_SHADOW_PILOT_TENANTS ?? '').trim();
  if (!raw || raw.toLowerCase() === 'all') return false;

  const tenantIds = parseExplicitTenantIds(raw);
  return tenantIds?.includes(tenantId) ?? false;
}

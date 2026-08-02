import { describe, expect, it } from 'vitest';
import { isEdbShadowPilotEnabledForTenant } from '../../lib/edb/edb-shadow-pilot-flag';

describe('eDB shadow pilot gate', () => {
  it('is disabled when the allowlist is absent or empty', () => {
    expect(isEdbShadowPilotEnabledForTenant({ ENVIRONMENT: 'staging' }, 6)).toBe(false);
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '   ' },
        6,
      ),
    ).toBe(false);
  });

  it('is disabled outside staging even when the tenant is allowlisted', () => {
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'development', EDB_SHADOW_PILOT_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'production', EDB_SHADOW_PILOT_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
  });

  it('enables only an explicitly allowlisted positive tenant in staging', () => {
    const env = { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6, 12' };
    expect(isEdbShadowPilotEnabledForTenant(env, 6)).toBe(true);
    expect(isEdbShadowPilotEnabledForTenant(env, 12)).toBe(true);
    expect(isEdbShadowPilotEnabledForTenant(env, 7)).toBe(false);
  });

  it('never accepts the broad all token', () => {
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: 'all' },
        6,
      ),
    ).toBe(false);
  });

  it('fails closed for malformed configuration or invalid tenant ids', () => {
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6,invalid' },
        6,
      ),
    ).toBe(false);
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6' },
        0,
      ),
    ).toBe(false);
    expect(
      isEdbShadowPilotEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6' },
        6.5,
      ),
    ).toBe(false);
  });
});

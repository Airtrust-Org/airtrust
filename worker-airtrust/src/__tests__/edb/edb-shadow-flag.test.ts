import { describe, expect, it } from 'vitest';
import { isEdbShadowEnabledForTenant } from '../../lib/edb/edb-shadow-flag';

describe('eDB staging shadow gate', () => {
  it('enables only explicitly allowlisted staging tenants', () => {
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6, 9' },
        6,
      ),
    ).toBe(true);
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6, 9' },
        7,
      ),
    ).toBe(false);
  });

  it('fails closed for production even when a tenant variable is present', () => {
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'production', EDB_SHADOW_PILOT_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
  });

  it('rejects all, malformed ids and invalid tenant ids', () => {
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: 'all' },
        6,
      ),
    ).toBe(false);
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6,bad' },
        6,
      ),
    ).toBe(false);
    expect(
      isEdbShadowEnabledForTenant(
        { ENVIRONMENT: 'staging', EDB_SHADOW_PILOT_TENANTS: '6' },
        0,
      ),
    ).toBe(false);
  });
});

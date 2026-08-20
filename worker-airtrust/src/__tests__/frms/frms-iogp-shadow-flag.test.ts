import { describe, expect, it } from 'vitest';
import { isFrmsIogpShadowModeEnabledForTenant } from '../../lib/frms/frms-iogp-shadow-flag';

describe('FRMS IOGP shadow mode gate', () => {
  it('is disabled when the allowlist is absent or empty', () => {
    expect(isFrmsIogpShadowModeEnabledForTenant({ ENVIRONMENT: 'staging' }, 6)).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '   ' },
        6,
      ),
    ).toBe(false);
  });

  it('is disabled outside staging even when the tenant is allowlisted', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'development', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'production', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
  });

  it('enables only an explicitly allowlisted positive tenant in staging', () => {
    const env = { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6, 12' };
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 6)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 12)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 7)).toBe(false);
  });

  it('never accepts the broad all token', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: 'all' },
        6,
      ),
    ).toBe(false);
  });

  it('fails closed for malformed configuration or invalid tenant ids', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6,invalid' },
        6,
      ),
    ).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
        0,
      ),
    ).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
        6.5,
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isFrmsIogpShadowModeEnabledForTenant } from '../../lib/frms/frms-iogp-shadow-flag';

describe('FRMS IOGP shadow/evidence mode gate', () => {
  it('is disabled when the environment-specific allowlist is absent or empty', () => {
    expect(isFrmsIogpShadowModeEnabledForTenant({ ENVIRONMENT: 'staging' }, 6)).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '   ' },
        6,
      ),
    ).toBe(false);
    expect(isFrmsIogpShadowModeEnabledForTenant({ ENVIRONMENT: 'production' }, 6)).toBe(false);
  });

  it('does not let the staging allowlist enable production', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'production', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
        6,
      ),
    ).toBe(false);
  });

  it('enables only explicitly allowlisted positive tenants in staging', () => {
    const env = { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6, 12' };
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 6)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 12)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 7)).toBe(false);
  });

  it('enables non-canonical evidence collection in production only with the dedicated allowlist', () => {
    const env = {
      ENVIRONMENT: 'production',
      FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS: '6,12',
    };
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 6)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 12)).toBe(true);
    expect(isFrmsIogpShadowModeEnabledForTenant(env, 7)).toBe(false);
  });

  it('stays disabled in development/test even with allowlists', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        {
          ENVIRONMENT: 'development',
          FRMS_IOGP_SHADOW_MODE_TENANTS: '6',
          FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS: '6',
        },
        6,
      ),
    ).toBe(false);
  });

  it('never accepts the broad all token in staging or production', () => {
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: 'all' },
        6,
      ),
    ).toBe(false);
    expect(
      isFrmsIogpShadowModeEnabledForTenant(
        { ENVIRONMENT: 'production', FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS: 'all' },
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
        { ENVIRONMENT: 'production', FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS: '6,invalid' },
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
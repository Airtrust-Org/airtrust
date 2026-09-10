import { describe, expect, it } from 'vitest';

import {
  TRUSTED_PILOT_LEASE_KEYS,
  hasTrustedPilotLeaseKeyForOrigin,
  isTrustedPilotLeaseKeyForOrigin,
  normalizePilotLeaseOrigin,
} from '../../public/pilot/pilot-lease-trust.js';

const stagingKey = {
  key_id: 'pilot-staging-2026-09',
  origins: [
    'https://staging.airtrust.pages.dev',
    'https://airtrust-staging.pages.dev',
  ],
  public_jwk: {
    kty: 'EC',
    crv: 'P-256',
    x: 'synthetic-x',
    y: 'synthetic-y',
  },
};

describe('Pilot lease origin trust', () => {
  it('tracks only public verification keys with exact staging and production origin scope', () => {
    expect(TRUSTED_PILOT_LEASE_KEYS).toHaveLength(2);
    expect(TRUSTED_PILOT_LEASE_KEYS[0]).toMatchObject({
      key_id: 'pilot-staging-20260910-01',
      origins: [
        'https://staging.airtrust.pages.dev',
        'https://airtrust-staging.pages.dev',
      ],
      public_jwk: {
        kty: 'EC',
        crv: 'P-256',
        key_ops: ['verify'],
      },
    });
    expect(TRUSTED_PILOT_LEASE_KEYS[1]).toMatchObject({
      key_id: 'pilot-production-20260910-01',
      origins: [
        'https://airtrust.online',
        'https://www.airtrust.online',
        'https://airtrust.pages.dev',
        'https://production.airtrust.pages.dev',
      ],
      public_jwk: {
        kty: 'EC',
        crv: 'P-256',
        key_ops: ['verify'],
      },
    });
    expect(
      hasTrustedPilotLeaseKeyForOrigin('https://staging.airtrust.pages.dev'),
    ).toBe(true);
    expect(
      hasTrustedPilotLeaseKeyForOrigin('https://airtrust-staging.pages.dev'),
    ).toBe(true);
    expect(hasTrustedPilotLeaseKeyForOrigin('https://airtrust.online')).toBe(
      true,
    );
    expect(hasTrustedPilotLeaseKeyForOrigin('https://www.airtrust.online')).toBe(
      true,
    );
    expect(hasTrustedPilotLeaseKeyForOrigin('https://airtrust.pages.dev')).toBe(
      true,
    );
    expect(
      hasTrustedPilotLeaseKeyForOrigin('https://production.airtrust.pages.dev'),
    ).toBe(true);
  });

  it('accepts only an exact key id on an exact allowlisted origin', () => {
    expect(
      isTrustedPilotLeaseKeyForOrigin(
        stagingKey,
        'pilot-staging-2026-09',
        'https://staging.airtrust.pages.dev',
      ),
    ).toBe(true);
    expect(
      isTrustedPilotLeaseKeyForOrigin(
        stagingKey,
        'pilot-staging-2026-09',
        'https://airtrust-staging.pages.dev',
      ),
    ).toBe(true);

    expect(
      isTrustedPilotLeaseKeyForOrigin(
        stagingKey,
        'pilot-staging-2026-09',
        'https://airtrust.online',
      ),
    ).toBe(false);
    expect(
      isTrustedPilotLeaseKeyForOrigin(
        stagingKey,
        'another-key',
        'https://staging.airtrust.pages.dev',
      ),
    ).toBe(false);
  });

  it('rejects wildcard, path-bearing and malformed origins', () => {
    const wildcardKey = {
      ...stagingKey,
      origins: ['https://*.airtrust.pages.dev'],
    };

    expect(
      isTrustedPilotLeaseKeyForOrigin(
        wildcardKey,
        wildcardKey.key_id,
        'https://staging.airtrust.pages.dev',
      ),
    ).toBe(false);
    expect(normalizePilotLeaseOrigin('https://staging.airtrust.pages.dev/')).toBeNull();
    expect(
      normalizePilotLeaseOrigin('https://staging.airtrust.pages.dev/pilot/'),
    ).toBeNull();
    expect(normalizePilotLeaseOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizePilotLeaseOrigin('')).toBeNull();
  });

  it('requires a public JWK even when key id and origin match', () => {
    expect(
      isTrustedPilotLeaseKeyForOrigin(
        {
          key_id: stagingKey.key_id,
          origins: stagingKey.origins,
        },
        stagingKey.key_id,
        'https://staging.airtrust.pages.dev',
      ),
    ).toBe(false);
  });

  it('can evaluate a candidate list without mutating the tracked trust store', () => {
    expect(
      hasTrustedPilotLeaseKeyForOrigin(
        'https://staging.airtrust.pages.dev',
        [stagingKey],
      ),
    ).toBe(true);
    expect(
      hasTrustedPilotLeaseKeyForOrigin('https://airtrust.online', [stagingKey]),
    ).toBe(false);
    expect(TRUSTED_PILOT_LEASE_KEYS).toHaveLength(2);
  });
});

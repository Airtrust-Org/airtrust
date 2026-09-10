export const PILOT_OFFLINE_APP_VERSION = '1.0.0';

// Fail-closed by design. Only public verification keys are tracked here.
// The matching private JWK must remain a Worker secret, and every public key
// must name exact trusted frontend origins. Wildcards are rejected.
// Never commit a private key here.
export const TRUSTED_PILOT_LEASE_KEYS = Object.freeze([
  {
    key_id: 'pilot-staging-20260910-01',
    public_jwk: {
      key_ops: ['verify'],
      ext: true,
      kty: 'EC',
      x: 'vfAAWPkfh03Nq0XcBVyv0heeILGgWmlVM1x9mm4Slo8',
      y: 'K6dEh06_CeK2jjHxNI5sF1r4oL0cNr6ec8_H-VV_Jxo',
      crv: 'P-256',
    },
    origins: [
      'https://staging.airtrust.pages.dev',
      'https://airtrust-staging.pages.dev',
    ],
  },
  {
    key_id: 'pilot-production-20260910-02',
    public_jwk: {
      key_ops: ['verify'],
      ext: true,
      kty: 'EC',
      x: 'xQD4_UYZjXxOPuKbWydQKg5rM9x1BSPQO-5bNKP4Tlg',
      y: '6Dw0z05IEANv2GbptQsFA5XRwkVIAjJywrSbgfoCYhU',
      crv: 'P-256',
    },
    origins: [
      'https://airtrust.online',
      'https://www.airtrust.online',
      'https://airtrust.pages.dev',
      'https://production.airtrust.pages.dev',
    ],
  },
]);

export function normalizePilotLeaseOrigin(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.includes('*')) return null;

  try {
    const parsed = new URL(candidate);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (parsed.origin !== candidate) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTrustedPilotLeaseKeyForOrigin(entry, keyId, origin) {
  const trustedOrigin = normalizePilotLeaseOrigin(origin);
  if (
    !trustedOrigin ||
    !entry ||
    String(entry.key_id || '') !== String(keyId || '') ||
    !entry.public_jwk ||
    !Array.isArray(entry.origins)
  ) {
    return false;
  }

  return entry.origins.some((candidate) => {
    const normalizedCandidate = normalizePilotLeaseOrigin(candidate);
    return normalizedCandidate !== null && normalizedCandidate === trustedOrigin;
  });
}

export function hasTrustedPilotLeaseKeyForOrigin(
  origin,
  entries = TRUSTED_PILOT_LEASE_KEYS,
) {
  return entries.some((entry) =>
    isTrustedPilotLeaseKeyForOrigin(entry, entry?.key_id, origin),
  );
}

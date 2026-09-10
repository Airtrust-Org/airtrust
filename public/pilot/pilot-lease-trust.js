export const PILOT_OFFLINE_APP_VERSION = '1.0.0';

// Fail-closed by design. A production/staging key is added only in the same
// governed change that provisions the matching private JWK as a Worker secret.
// Every key must name exact trusted frontend origins. Wildcards are rejected.
// Never commit a private key here.
export const TRUSTED_PILOT_LEASE_KEYS = Object.freeze([]);

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

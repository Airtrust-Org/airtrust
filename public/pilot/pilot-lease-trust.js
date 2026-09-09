export const PILOT_OFFLINE_APP_VERSION = '1.0.0';

// Fail-closed by design. A production/staging key is added only in the same
// governed change that provisions the matching private JWK as a Worker secret.
// Never commit a private key here.
export const TRUSTED_PILOT_LEASE_KEYS = Object.freeze([]);

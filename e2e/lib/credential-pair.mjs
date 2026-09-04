/**
 * Atomic credential-pair selection for the Frontend PR UI QA login.
 *
 * Never mix an admin email with a smoke password (or vice-versa):
 *   - both QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD present  -> admin pair
 *   - neither present                                    -> smoke pair (E2E_*)
 *   - exactly one present                                -> fail closed
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ email: string, password: string, profile: 'admin' | 'smoke' }}
 */
export function resolveCredentialPair(env = process.env) {
  const adminEmail = (env.QA_ADMIN_EMAIL ?? '').trim();
  const adminPassword = (env.QA_ADMIN_PASSWORD ?? '').trim();
  const smokeEmail = (env.E2E_EMAIL ?? '').trim();
  const smokePassword = (env.E2E_PASSWORD ?? '').trim();

  const adminBits = (adminEmail ? 1 : 0) + (adminPassword ? 1 : 0);
  if (adminBits === 1) {
    throw new Error('QA_ADMIN_CREDENTIAL_PAIR_INCOMPLETE');
  }

  if (adminBits === 2) {
    return { email: adminEmail, password: adminPassword, profile: 'admin' };
  }

  if (!smokeEmail || !smokePassword) {
    throw new Error('FRONTEND_PR_UI_QA_CREDENTIALS_MISSING');
  }
  return { email: smokeEmail, password: smokePassword, profile: 'smoke' };
}

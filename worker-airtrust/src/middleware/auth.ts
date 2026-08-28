/**
 * Canonical authentication middleware.
 *
 * The implementation lives in auth-session-aware.ts so session profile
 * selection can be validated centrally without duplicating authorization
 * logic across routes.
 */
export { auth, optionalAuth } from './auth-session-aware';

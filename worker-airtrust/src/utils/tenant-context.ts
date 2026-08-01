import type { Context } from 'hono';
import type { Env, Variables } from '../types';

export type AuthenticatedRequestEnv = {
  Bindings: Env;
  Variables: Variables;
};

/**
 * Canonical read-only accessors for authenticated request context.
 *
 * Route modules should depend on this neutral utility instead of importing
 * tenant semantics from another business domain. Missing or invalid values
 * remain explicit so callers can fail closed with the appropriate API error.
 */
export function getEmpresaIdSafe(c: Context<AuthenticatedRequestEnv>): number | null {
  const value = c.get('empresaId');
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function getUserIdSafe(c: Context<AuthenticatedRequestEnv>): number | null {
  const value = c.get('userId');
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

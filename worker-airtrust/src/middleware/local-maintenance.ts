import type { Env } from '../types';

/**
 * Maintenance endpoints are unavailable to deployed Workers. The runtime
 * marker is supplied only by the local dev configuration and is deliberately
 * independent of request-controlled headers and URLs.
 */
export function isLocalMaintenanceRuntime(env: Env): boolean {
  return (
    env.ENVIRONMENT === 'development' &&
    env.ENABLE_LOCAL_MAINTENANCE === 'true' &&
    env.LOCAL_MAINTENANCE_RUNTIME === 'true'
  );
}

/** Canonical, fail-closed classification for every API maintenance path. */
export function isMaintenancePath(pathname: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  if (decoded !== pathname || /\/\//.test(pathname)) return true;
  const segments = pathname.toLowerCase().replace(/\/+$/, '').split('/').filter(Boolean);
  return segments[0] === 'api' && segments.includes('maintenance');
}

export function localMaintenanceNotFound(env: Env): Response | null {
  return isLocalMaintenanceRuntime(env) ? null : new Response('Not Found', { status: 404 });
}

async function secureCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const left = new Uint8Array(aHash);
  const right = new Uint8Array(bHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * The complete maintenance contract is evaluated before a route may parse a
 * request body, invoke a rate limiter, or touch a service/database.  Denials
 * intentionally use the same 404 response so remote deployments do not
 * advertise an operational endpoint or reveal whether a secret is configured.
 */
export async function localMaintenanceGate(env: Env, headers: Headers): Promise<Response | null> {
  const unavailable = localMaintenanceNotFound(env);
  if (unavailable) return unavailable;

  const secret = env.MAINTENANCE_SECRET;
  const supplied = headers.get('x-airtrust-maintenance') ?? headers.get('x-maintenance-secret');
  if (!secret || !supplied || !(await secureCompare(supplied, secret))) {
    return new Response('Not Found', { status: 404 });
  }
  return null;
}

/** HTTP is deliberately read-only; operational writes stay in controlled local execution. */
export function localMaintenanceMutationNotFound(): Response {
  return new Response('Not Found', { status: 404 });
}

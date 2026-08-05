import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import {
  assertTenantDataScope,
  captureTenantDataScope,
  combineWithTenantAbortSignal,
} from '@/react-app/lib/tenant-data-layer';

function rawInputToString(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

function isAirTrustApiRequest(input: RequestInfo | URL): boolean {
  const raw = rawInputToString(input);
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const apiBase = new URL(API_BASE_URL, origin);
    const resolved = new URL(raw, origin);
    if (raw.startsWith('/api/')) return true;
    const sameFrontendOrigin = resolved.origin === origin && resolved.pathname.startsWith('/api/');
    const configuredApiOrigin =
      resolved.origin === apiBase.origin &&
      (resolved.pathname.startsWith(apiBase.pathname) || resolved.pathname.startsWith('/api/'));
    return sameFrontendOrigin || configuredApiOrigin;
  } catch {
    return raw.startsWith('/api/') || raw.startsWith(API_BASE_URL);
  }
}

/**
 * Canonical runtime fetch for frontend code.
 *
 * Every AirTrust API request is routed through the refresh-aware authenticated
 * client, including the no-session case so 401 handling remains canonical.
 * External URLs and public/static assets keep native fetch semantics through
 * apiFetch and never receive the AirTrust bearer token. Every request is tied
 * to the active tenant epoch so an A→B switch aborts and rejects responses that
 * started under A.
 */
export async function appFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const scope = captureTenantDataScope();
  const requestInit: RequestInit = {
    ...init,
    signal: combineWithTenantAbortSignal(init.signal),
  };

  const response = isAirTrustApiRequest(input)
    ? await fetchWithAuth(rawInputToString(input), requestInit)
    : await apiFetch(input, requestInit);

  assertTenantDataScope(scope);
  return response;
}

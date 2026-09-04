/**
 * Host-aware, read-only network guard for the Staging Frontend PR UI QA.
 *
 * Evaluation order (fail-closed):
 *   1. Resolve the request hostname. ANY AirTrust production host is blocked
 *      regardless of method (GET/HEAD included).
 *   2. GET / HEAD / OPTIONS to a non-production host are allowed.
 *   3. POST is allowed ONLY when BOTH: the pathname is in AUTH_POST_ALLOWLIST
 *      AND the hostname is an explicit staging host.
 *   4. DELETE / PATCH / PUT and every other method/POST are blocked.
 *
 * The browser authenticates against the REAL staging API — no fake JWT, no
 * localStorage session forgery, no route fulfilment of /auth/me or
 * /auth/empresas. After that, the QA must not mutate operational data.
 */

export const AUTH_POST_ALLOWLIST = Object.freeze([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/refresh-token',
  '/api/auth/token/refresh',
  '/api/auth/logout',
  '/api/auth/empresas/select',
  '/api/auth/select-empresa',
]);

export const SAFE_METHODS = Object.freeze(['GET', 'HEAD', 'OPTIONS']);
export const MUTATION_METHODS = Object.freeze(['DELETE', 'PATCH', 'PUT']);

/** Explicit staging hosts that may answer API calls (incl. same-origin proxy). */
export const STAGING_API_HOST_ALLOWLIST = Object.freeze([
  'airtrust-api-staging.airtrust.workers.dev',
  'staging.airtrust.pages.dev',
]);

/** Any AirTrust production host — blocked for every method. */
export const PRODUCTION_HOST_PATTERNS = Object.freeze([
  /(^|\.)airtrust\.online$/i,
  /^airtrust-api\.airtrust\.workers\.dev$/i,
  /^airtrust-api-production\.airtrust\.workers\.dev$/i,
  /^airtrust\.pages\.dev$/i,
]);

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return url;
  }
}

export function isProductionHost(hostname) {
  return PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * @param {{ method: string, url: string, phase?: 'pre-auth' | 'post-auth' }} req
 * @returns {{ decision: 'allow' | 'block', reason: string }}
 */
export function classifyRequest({ method, url }) {
  const upper = String(method || 'GET').toUpperCase();
  const host = hostnameOf(url);
  const pathname = pathnameOf(url);

  // 1. Production host — blocked for EVERY method, before anything else.
  if (isProductionHost(host)) {
    return { decision: 'block', reason: `production-host:${upper}:${host}` };
  }

  // 2. Safe idempotent methods to a non-production host.
  if (SAFE_METHODS.includes(upper)) {
    return { decision: 'allow', reason: `safe-method:${upper}` };
  }

  // 3. POST: needs an allowlisted auth pathname AND an explicit staging host.
  if (upper === 'POST') {
    const pathAllowed = AUTH_POST_ALLOWLIST.some(
      (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
    );
    const hostAllowed = STAGING_API_HOST_ALLOWLIST.includes(host);
    if (pathAllowed && hostAllowed) {
      return { decision: 'allow', reason: `auth-post:${host}${pathname}` };
    }
    if (pathAllowed && !hostAllowed) {
      return { decision: 'block', reason: `auth-post-untrusted-host:${host}${pathname}` };
    }
    return { decision: 'block', reason: `operational-post:${host}${pathname}` };
  }

  // 4. Everything else.
  if (MUTATION_METHODS.includes(upper)) {
    return { decision: 'block', reason: `mutation-method:${upper}:${host}${pathname}` };
  }
  return { decision: 'block', reason: `unknown-method:${upper}` };
}

/**
 * Install the guard on a Playwright page. Every blocked request is recorded
 * and aborted; the caller asserts `violations` is empty at the end.
 *
 * @param {import('@playwright/test').Page} page
 */
export function installReadOnlyGuard(page) {
  /** @type {{ method: string, url: string, reason: string }[]} */
  const violations = [];

  page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const { decision, reason } = classifyRequest({ method, url });

    if (decision === 'allow') {
      await route.continue();
      return;
    }

    violations.push({ method, url, reason });
    await route.abort('blockedbyclient');
  });

  return {
    violations,
    get mutationCount() {
      return violations.length;
    },
    assertClean() {
      if (violations.length > 0) {
        const lines = violations.map((v) => `  ${v.method} ${v.url} (${v.reason})`).join('\n');
        throw new Error(
          `READ_ONLY_GUARD_VIOLATION: ${violations.length} blocked request(s)\n${lines}`,
        );
      }
    },
  };
}

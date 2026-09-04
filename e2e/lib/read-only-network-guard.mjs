/**
 * Host-aware, read-only network guard for the Staging Frontend PR UI QA.
 *
 * The QA browser runs JavaScript that was PUBLISHED BY THE PR under test against
 * a real staging session. A compromised/hostile frontend must not be able to
 * exfiltrate that session to an arbitrary host, nor pull unreviewed external
 * resources. The guard is therefore an EXPLICIT HOST ALLOWLIST — not
 * "deny production, allow everything else".
 *
 * Evaluation order (fail-closed):
 *   1. Resolve the request hostname. If it is unparseable -> BLOCK.
 *   2. ANY AirTrust production host -> BLOCK for every method, with the
 *      dedicated, priority reason PRODUCTION_HOST_BLOCKED.
 *   3. Any host NOT in STAGING_HOST_ALLOWLIST -> BLOCK for every method
 *      (GET / HEAD / OPTIONS included) with NETWORK_HOST_NOT_ALLOWLISTED:<host>.
 *   4. Allowlisted host + GET / HEAD / OPTIONS -> ALLOW.
 *   5. Allowlisted host + POST -> ALLOW only when the pathname is in
 *      AUTH_POST_ALLOWLIST; otherwise BLOCK (operational-post).
 *   6. DELETE / PATCH / PUT and every other method -> BLOCK.
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

/**
 * The ONLY hosts any request may reach during this QA — for every method.
 * Minimal canonical allowlist: the published staging frontend (Pages) and the
 * staging Worker API. Adding a host here requires proving in trusted `main`
 * that the real frontend needs it; wildcards are never permitted.
 */
export const STAGING_HOST_ALLOWLIST = Object.freeze([
  'staging.airtrust.pages.dev',
  'airtrust-api-staging.airtrust.workers.dev',
]);

/** Explicit staging hosts that may answer API calls (incl. same-origin proxy). */
export const STAGING_API_HOST_ALLOWLIST = STAGING_HOST_ALLOWLIST;

export function isAllowlistedHost(hostname) {
  return STAGING_HOST_ALLOWLIST.includes(hostname);
}

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

  // A request URL without a resolvable host cannot be proved to target staging.
  // Keep the guard fail-closed even though Playwright normally provides absolute
  // URLs here.
  if (!host) {
    return { decision: 'block', reason: `request-host-unparseable:${upper}` };
  }

  // 1. Production host — blocked for EVERY method, before anything else, with a
  //    dedicated priority reason.
  if (isProductionHost(host)) {
    return { decision: 'block', reason: `PRODUCTION_HOST_BLOCKED:${upper}:${host}` };
  }

  // 2. Explicit host allowlist — every method (GET/HEAD/OPTIONS included) to a
  //    non-allowlisted host is blocked. No arbitrary external host, ever.
  if (!isAllowlistedHost(host)) {
    return { decision: 'block', reason: `NETWORK_HOST_NOT_ALLOWLISTED:${host}` };
  }

  // 3. Allowlisted host + safe idempotent method.
  if (SAFE_METHODS.includes(upper)) {
    return { decision: 'allow', reason: `safe-method:${upper}:${host}` };
  }

  // 4. Allowlisted host + POST: needs an allowlisted auth pathname.
  if (upper === 'POST') {
    const pathAllowed = AUTH_POST_ALLOWLIST.some(
      (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
    );
    if (pathAllowed) {
      return { decision: 'allow', reason: `auth-post:${host}${pathname}` };
    }
    return { decision: 'block', reason: `operational-post:${host}${pathname}` };
  }

  // 5. Everything else.
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

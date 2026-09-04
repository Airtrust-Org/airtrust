/**
 * Read-only network guard for the Staging Frontend PR UI QA browser run.
 *
 * The browser authenticates against the REAL staging API (no fake JWT, no
 * localStorage session forgery, no route fulfilment of /auth/me or
 * /auth/empresas). After that legitimate auth flow, the QA must not mutate
 * operational data:
 *   - GET / HEAD / OPTIONS are always allowed.
 *   - POST is allowed only to an explicit auth/session allowlist.
 *   - DELETE / PATCH / PUT and any other POST is blocked and fails the run.
 *
 * Non-API hosts (static assets, fonts, analytics-less app shell) are allowed
 * for GET/HEAD only so the SPA can load; they can never carry a mutation.
 */

/** Endpoints that legitimately use POST during a real login / session refresh. */
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

const STAGING_API_HOSTS = Object.freeze([
  'airtrust-api-staging.airtrust.workers.dev',
  'staging.airtrust.pages.dev', // same-origin /api proxy, if any
]);

function pathnameOf(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return url;
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * @param {{ method: string, url: string, phase?: 'pre-auth' | 'post-auth' }} req
 * @returns {{ decision: 'allow' | 'block', reason: string }}
 */
export function classifyRequest({ method, url, phase = 'post-auth' }) {
  const upper = String(method || 'GET').toUpperCase();
  const host = hostnameOf(url);
  const pathname = pathnameOf(url);
  const isApi = STAGING_API_HOSTS.includes(host) && pathname.startsWith('/api/');

  if (SAFE_METHODS.includes(upper)) {
    return { decision: 'allow', reason: `safe-method:${upper}` };
  }

  if (upper === 'POST') {
    const allowlisted = AUTH_POST_ALLOWLIST.some(
      (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
    );
    if (allowlisted) {
      return { decision: 'allow', reason: `auth-allowlisted-post:${pathname}` };
    }
    // A non-allowlisted POST is an operational mutation regardless of phase.
    return {
      decision: 'block',
      reason: isApi ? `operational-post:${pathname}` : `unexpected-post:${host}${pathname}`,
    };
  }

  if (MUTATION_METHODS.includes(upper)) {
    return { decision: 'block', reason: `mutation-method:${upper}:${pathname}` };
  }

  return { decision: 'block', reason: `unknown-method:${upper}` };
}

/**
 * Install the guard on a Playwright page/context. Every blocked request is
 * recorded and aborted; the caller asserts `violations` is empty at the end.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ getPhase?: () => 'pre-auth' | 'post-auth' }} [opts]
 */
export function installReadOnlyGuard(page, opts = {}) {
  const getPhase = opts.getPhase ?? (() => 'post-auth');
  /** @type {{ method: string, url: string, reason: string }[]} */
  const violations = [];

  page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const { decision, reason } = classifyRequest({ method, url, phase: getPhase() });

    if (decision === 'allow') {
      await route.continue();
      return;
    }

    violations.push({ method, url, reason });
    await route.abort('blockedbyclient');
  });

  return {
    violations,
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

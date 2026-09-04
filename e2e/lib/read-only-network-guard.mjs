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
 *   3. Known optional external font GET/HEAD/OPTIONS requests -> SUPPRESS:
 *      abort locally, record as suppressed, never send them to Google.
 *   4. Any other host NOT in STAGING_HOST_ALLOWLIST -> BLOCK for every method.
 *   5. Allowlisted host + GET / HEAD / OPTIONS -> ALLOW.
 *   6. POST /api/public/translate on the staging API -> SUPPRESS locally.
 *      It is a read-only i18n fallback, but the Worker forwards text to Google,
 *      so it must not become an exfiltration channel during PR QA.
 *   7. Allowlisted host + POST -> ALLOW only when the pathname is in
 *      AUTH_POST_ALLOWLIST; otherwise BLOCK (operational-post).
 *   8. DELETE / PATCH / PUT and every other method -> BLOCK.
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
 * Optional resources used by the real frontend but intentionally NOT sent
 * during governed PR QA. Suppression means route.abort() without recording a
 * security violation. This preserves zero-exfiltration while allowing the app
 * to fall back to system fonts / untranslated source text.
 */
export const SUPPRESSED_EXTERNAL_RESOURCE_HOSTS = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

export const SUPPRESSED_READ_ONLY_POST_PATHS = Object.freeze(['/api/public/translate']);

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
export const STAGING_API_HOST_ALLOWLIST = Object.freeze([
  'staging.airtrust.pages.dev',
  'airtrust-api-staging.airtrust.workers.dev',
]);

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
 * @returns {{ decision: 'allow' | 'block' | 'suppress', reason: string }}
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

  // 2. Known optional external font resources are aborted locally without
  //    becoming violations. Nothing is sent to Google; no arbitrary external
  //    host is ever allowed.
  if (SUPPRESSED_EXTERNAL_RESOURCE_HOSTS.includes(host) && SAFE_METHODS.includes(upper)) {
    return { decision: 'suppress', reason: `optional-external-resource:${upper}:${host}` };
  }

  // 3. Explicit host allowlist — every other method/request to a
  //    non-allowlisted host is blocked.
  if (!isAllowlistedHost(host)) {
    return { decision: 'block', reason: `NETWORK_HOST_NOT_ALLOWLISTED:${host}` };
  }

  // 4. Allowlisted host + safe idempotent method.
  if (SAFE_METHODS.includes(upper)) {
    return { decision: 'allow', reason: `safe-method:${upper}:${host}` };
  }

  // 5. Allowlisted host + POST. Public translation is intentionally suppressed
  //    rather than allowed: the staging Worker forwards text to Google Translate,
  //    so a hostile PR must not be able to use it as an indirect exfiltration
  //    channel. The UI is expected to fall back to source text.
  if (upper === 'POST') {
    const isSuppressedReadOnlyPost =
      STAGING_API_HOST_ALLOWLIST.includes(host) &&
      SUPPRESSED_READ_ONLY_POST_PATHS.includes(pathname);
    if (isSuppressedReadOnlyPost) {
      return { decision: 'suppress', reason: `optional-read-only-post:${host}${pathname}` };
    }

    const pathAllowed =
      STAGING_API_HOST_ALLOWLIST.includes(host) &&
      AUTH_POST_ALLOWLIST.some(
        (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
      );
    if (pathAllowed) {
      return { decision: 'allow', reason: `auth-post:${host}${pathname}` };
    }
    return { decision: 'block', reason: `operational-post:${host}${pathname}` };
  }

  // 6. Everything else.
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
  /** @type {{ method: string, url: string, reason: string }[]} */
  const suppressedRequests = [];

  page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const { decision, reason } = classifyRequest({ method, url });

    if (decision === 'allow') {
      await route.continue();
      return;
    }

    if (decision === 'suppress') {
      suppressedRequests.push({ method, url, reason });
      await route.abort('blockedbyclient');
      return;
    }

    violations.push({ method, url, reason });
    await route.abort('blockedbyclient');
  });

  return {
    violations,
    suppressedRequests,
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

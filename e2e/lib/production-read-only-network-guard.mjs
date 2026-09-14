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
export const SUPPRESSED_EXTERNAL_RESOURCE_HOSTS = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);
export const SUPPRESSED_READ_ONLY_POST_PATHS = Object.freeze(['/api/public/translate']);
export const PRODUCTION_HOST_ALLOWLIST = Object.freeze([
  'airtrust.online',
  'www.airtrust.online',
  'api.airtrust.online',
  'airtrust-api.airtrust.workers.dev',
  'airtrust-api-production.airtrust.workers.dev',
]);
export const PRODUCTION_API_HOST_ALLOWLIST = Object.freeze([
  'airtrust.online',
  'api.airtrust.online',
  'airtrust-api.airtrust.workers.dev',
  'airtrust-api-production.airtrust.workers.dev',
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

export function classifyProductionReadOnlyRequest({ method, url }) {
  const upper = String(method || 'GET').toUpperCase();
  const host = hostnameOf(url);
  const pathname = pathnameOf(url);
  if (!host) return { decision: 'block', reason: `request-host-unparseable:${upper}` };
  if (SUPPRESSED_EXTERNAL_RESOURCE_HOSTS.includes(host) && SAFE_METHODS.includes(upper)) {
    return { decision: 'suppress', reason: `optional-external-resource:${upper}:${host}` };
  }
  if (!PRODUCTION_HOST_ALLOWLIST.includes(host)) {
    return { decision: 'block', reason: `NETWORK_HOST_NOT_ALLOWLISTED:${host}` };
  }
  if (SAFE_METHODS.includes(upper)) {
    return { decision: 'allow', reason: `safe-method:${upper}:${host}` };
  }
  if (upper === 'POST') {
    if (
      PRODUCTION_API_HOST_ALLOWLIST.includes(host) &&
      SUPPRESSED_READ_ONLY_POST_PATHS.includes(pathname)
    ) {
      return { decision: 'suppress', reason: `optional-read-only-post:${host}${pathname}` };
    }
    const allowed =
      PRODUCTION_API_HOST_ALLOWLIST.includes(host) &&
      AUTH_POST_ALLOWLIST.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    return allowed
      ? { decision: 'allow', reason: `auth-post:${host}${pathname}` }
      : { decision: 'block', reason: `operational-post:${host}${pathname}` };
  }
  return { decision: 'block', reason: `mutation-method:${upper}:${host}${pathname}` };
}

export function installProductionReadOnlyGuard(page) {
  const violations = [];
  const suppressedRequests = [];
  page.route('**/*', async (route) => {
    const request = route.request();
    const result = classifyProductionReadOnlyRequest({
      method: request.method(),
      url: request.url(),
    });
    if (result.decision === 'allow') return route.continue();
    if (result.decision === 'suppress') {
      suppressedRequests.push({
        method: request.method(),
        url: request.url(),
        reason: result.reason,
      });
      return route.abort('blockedbyclient');
    }
    violations.push({ method: request.method(), url: request.url(), reason: result.reason });
    return route.abort('blockedbyclient');
  });
  return {
    violations,
    suppressedRequests,
    assertClean() {
      if (!violations.length) return;
      throw new Error(
        `PRODUCTION_READ_ONLY_GUARD_VIOLATION:${violations.length}\n${violations.map((v) => `${v.method} ${v.url} (${v.reason})`).join('\n')}`,
      );
    },
  };
}

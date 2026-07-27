/**
 * SCORM staging proxy — relays LMS SCORM asset and commit requests to a
 * fixed upstream Worker.
 *
 * The upstream is resolved in order:
 * 1. env.SCORM_STAGING_UPSTREAM (Pages env var), validated against a strict
 *    allowlist — used for ephemeral PR previews.
 * 2. Auto-detection: if the request host matches a known PR preview pattern
 *    (codex/scorm-staging-real-browser branch), route to the preview Worker.
 * 3. Default: https://airtrust-api-staging.airtrust.workers.dev (shared staging).
 *
 * A request can NEVER choose its own upstream; the host is fixed at deploy time.
 */

const ALLOWED_SCORM_UPSTREAMS: ReadonlySet<string> = new Set([
  'https://airtrust-api-staging.airtrust.workers.dev',
  'https://airtrust-api-pr499-preview.airtrust.workers.dev',
]);

const DEFAULT_UPSTREAM = 'https://airtrust-api-staging.airtrust.workers.dev';
const PR499_PREVIEW_UPSTREAM = 'https://airtrust-api-pr499-preview.airtrust.workers.dev';

function resolveScormUpstream(request: Request, env?: Record<string, unknown>): string {
  // 1. Explicit env var (set in Pages dashboard or via wrangler)
  const envUpstream: string | undefined =
    typeof env?.SCORM_STAGING_UPSTREAM === 'string'
      ? (env.SCORM_STAGING_UPSTREAM as string)
      : undefined;

  if (envUpstream) {
    const normalized = envUpstream.replace(/\/+$/, '');
    if (ALLOWED_SCORM_UPSTREAMS.has(normalized)) {
      return normalized;
    }
    console.error(`SCORM_STAGING_UPSTREAM "${normalized}" is not in the allowed upstream set.`);
  }

  // 2. Auto-detect PR preview hostname
  try {
    const hostname = new URL(request.url).hostname;
    if (hostname.includes('codex-scorm-staging-real-browser')) {
      return PR499_PREVIEW_UPSTREAM;
    }
  } catch {
    // Malformed URL — fall through to default
  }

  // 3. Default: shared staging
  return DEFAULT_UPSTREAM;
}

export async function proxyStagingScormRequest(
  request: Request,
  env?: Record<string, unknown>,
): Promise<Response> {
  const upstream = resolveScormUpstream(request, env);
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstream);
  const headers = new Headers(request.headers);

  // The browser speaks only to the Pages origin. The upstream is fixed, so a
  // request cannot choose a target or place credentials in a persistent URL.
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-proto');

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  responseHeaders.set('Pragma', 'no-cache');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

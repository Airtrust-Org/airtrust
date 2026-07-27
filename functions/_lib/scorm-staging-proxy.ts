const STAGING_SCORM_UPSTREAM = 'https://airtrust-api-staging.airtrust.workers.dev';

export async function proxyStagingScormRequest(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, STAGING_SCORM_UPSTREAM);
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

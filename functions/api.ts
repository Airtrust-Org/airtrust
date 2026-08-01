const API_NOT_AVAILABLE_BODY = JSON.stringify({
  error: 'Not Found',
  code: 'PAGES_API_NOT_AVAILABLE',
});

const API_NOT_AVAILABLE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function onRequest(): Response {
  return new Response(API_NOT_AVAILABLE_BODY, {
    status: 404,
    headers: API_NOT_AVAILABLE_HEADERS,
  });
}

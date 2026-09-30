const ASSET_REVALIDATE = 'public, max-age=0, must-revalidate';
const ASSET_MISS_CACHE = 'no-store, no-cache, must-revalidate, max-age=0';

type PagesAssetContext = {
  request: Request;
  next: () => Promise<Response>;
};

function isHtmlFallback(response: Response): boolean {
  const contentType = response.headers.get('content-type') || '';
  return response.ok && contentType.toLowerCase().includes('text/html');
}

function assetMissResponse(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': ASSET_MISS_CACHE,
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequest(context: PagesAssetContext): Promise<Response> {
  const response = await context.next();

  // Cloudflare Pages SPA fallback can turn a missing hashed chunk into index.html
  // with status 200. Never let HTML masquerade as /assets/*: browsers can cache
  // that MIME mismatch and leave an already-open tab unable to boot after deploy.
  if (isHtmlFallback(response) || response.status === 404) {
    return assetMissResponse();
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', ASSET_REVALIDATE);
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

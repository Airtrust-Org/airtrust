/**
 * Cloudflare Pages Function - SPA Routing
 * Auto-gerado: Thu Nov 13 14:44:30 -03 2025
 */

export const onRequest = async ({ request, next }: any): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Deixar passar assets, API e outros recursos estáticos
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2')
  ) {
    return next();
  }

  // Para qualquer outra rota, servir index.html SEM hardcode de assets (evita regressões por cache)
  const response = await next();

  if (response.status === 404 && request.method === 'GET') {
    const accept = request.headers.get('Accept') || '';
    // Apenas navegações HTML devem cair no fallback SPA
    if (accept.includes('text/html')) {
      const rootUrl = new URL('/', request.url);
      // Repassa para a raiz para que o Pages sirva o index.html atual (com hashes atualizados)
      const res = await fetch(rootUrl.toString());
      // Reenvia com cache controlado para o HTML
      const newHeaders = new Headers(res.headers);
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      newHeaders.set('Pragma', 'no-cache');
      newHeaders.set('Expires', '0');
      return new Response(res.body, { status: res.status, headers: newHeaders });
    }
  }

  return response;
};

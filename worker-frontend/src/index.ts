/**
 * AirTrust Frontend Worker
 * Serves React SPA with ZERO CACHE headers
 *
 * SOLUÇÃO DEFINITIVA para cache persistente do Cloudflare Pages
 */

import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import assetManifestJSON from '__STATIC_CONTENT_MANIFEST';

type Bindings = {
  ENVIRONMENT: string;
  APP_VERSION: string;
  __STATIC_CONTENT: KVNamespace;
};

interface Env extends Bindings {}

const assetManifest = JSON.parse(assetManifestJSON);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://airtrust.online',
      'https://airtrust.pages.dev',
      'http://localhost:3000',
      'http://localhost:5173',
    ];
    const corsOrigin =
      requestOrigin && allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : 'https://airtrust.online';

    // 🔍 ENDPOINT DE VERIFICAÇÃO DE VERSÃO REAL
    if (url.pathname === '/version.json') {
      const actualVersion = env.APP_VERSION || 'unknown';
      return new Response(
        JSON.stringify({
          version: actualVersion,
          environment: env.ENVIRONMENT || 'development',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Access-Control-Allow-Origin': corsOrigin,
          },
        },
      );
    }

    try {
      // Buscar asset do KV
      let response = await getAssetFromKV(
        {
          request,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: assetManifest,
        },
      );

      // Clonar response para adicionar headers
      response = new Response(response.body, response);

      // Sempre anexar a versão real do frontend servido
      response.headers.set('X-AirTrust-Frontend-Version', env.APP_VERSION || 'unknown');

      const environment = env.ENVIRONMENT || 'development';

      // 🎯 STAGING: ZERO CACHE (updates instantâneos)
      if (environment === 'staging') {
        response.headers.set(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        );
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        response.headers.set('Surrogate-Control', 'no-store');
        response.headers.set('CDN-Cache-Control', 'no-store');
        response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
      }
      // 🚀 PRODUCTION: Cache otimizado MAS NUNCA CACHE O INDEX.HTML
      else if (environment === 'production') {
        // index.html NUNCA em cache para garantir versão correta
        if (url.pathname === '/' || url.pathname === '/index.html') {
          response.headers.set(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          );
          response.headers.set('Pragma', 'no-cache');
          response.headers.set('Expires', '0');
        } else {
          // Assets estáticos podem ter cache longo
          response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        }
      }

      // CORS
      response.headers.set('Access-Control-Allow-Origin', corsOrigin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Security headers
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Se for HTML (index), carimbar a versão no meta build-version
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html')) {
        const html = await response.text();
        const stamped = html.replaceAll('__BUILD_VERSION__', env.APP_VERSION || 'unknown');
        return new Response(stamped, response);
      }

      return response;
    } catch (e: any) {
      // Se asset não encontrado, retornar index.html (SPA fallback)
      if (e.status === 404) {
        try {
          const indexRequest = new Request(`${url.origin}/index.html`, request);
          let indexResponse = await getAssetFromKV(
            {
              request: indexRequest,
              waitUntil: ctx.waitUntil.bind(ctx),
            },
            {
              ASSET_NAMESPACE: env.__STATIC_CONTENT,
              ASSET_MANIFEST: assetManifest,
            },
          );

          indexResponse = new Response(indexResponse.body, indexResponse);
          indexResponse.headers.set('Cache-Control', 'no-store');

          indexResponse.headers.set(
            'X-AirTrust-Frontend-Version',
            (env.APP_VERSION || 'unknown') as string,
          );

          const contentType = indexResponse.headers.get('Content-Type') || '';
          if (contentType.includes('text/html')) {
            const html = await indexResponse.text();
            const stamped = html.replaceAll('__BUILD_VERSION__', env.APP_VERSION || 'unknown');
            return new Response(stamped, indexResponse);
          }

          return indexResponse;
        } catch (indexError: any) {
          return new Response(`404 Not Found: ${e.message}`, { status: 404 });
        }
      }

      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  },
};

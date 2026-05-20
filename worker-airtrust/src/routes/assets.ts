import { Hono } from 'hono';
import type { Env } from '../types';

export const assetsRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/assets/*
 * Serve arquivos públicos do R2 com suporte a subpastas.
 * Ex: /api/assets/empresas/6/logo.png -> R2 key: empresas/6/logo.png
 */
assetsRouter.get('/*', async (c) => {
  const wildcardKey = c.req.param('*');
  const pathname = new URL(c.req.url).pathname;
  const prefix = '/api/assets/';
  const key = wildcardKey || (pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '');

  if (!key) {
    return c.json({ success: false, error: 'Caminho do asset não informado' }, 400);
  }

  if (!c.env.BUCKET) {
    return c.json({ success: false, error: 'Storage não configurado' }, 500);
  }

  try {
    const object = await c.env.BUCKET.get(key);

    if (!object) {
      return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
    }

    // Determinar Content-Type
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Cache control para assets (1 dia)
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(object.body, {
      headers,
    });
  } catch (error: any) {
    console.error(`Erro ao servir asset ${key}:`, error);
    return c.json({ success: false, error: 'Erro interno ao recuperar arquivo' }, 500);
  }
});

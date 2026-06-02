import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { getTenantContext, tenantMiddleware } from '../middleware/tenant';
import type { Env, Variables } from '../types';

export const assetsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

const PUBLIC_CACHE = 'public, max-age=86400';
const PRIVATE_CACHE = 'private, no-store';

export type AssetAccessPolicy =
  | { visibility: 'public'; cache: 'public' }
  | { visibility: 'tenant'; empresaId: number; cache: 'private' }
  | { visibility: 'blocked'; reason: string };

const PUBLIC_EMPRESA_ASSET_PATTERN =
  /^empresas\/(\d+)\/(?:logo(?:-\d+)?|certificado-logo-\d+|sistema-logo-\d+|favicon-\d+)\.(?:png|jpe?g|webp|gif|svg)$/i;

function normalizeAssetKey(rawKey: string): string {
  let decodedKey = rawKey;

  try {
    decodedKey = decodeURIComponent(rawKey);
  } catch {
    return '';
  }

  return decodedKey.replace(/^\/+/, '').trim();
}

export function classifyAssetAccess(key: string): AssetAccessPolicy {
  if (!key || key.includes('\0') || key.includes('//')) {
    return { visibility: 'blocked', reason: 'invalid-key' };
  }

  if (key.split('/').some((segment) => segment === '..')) {
    return { visibility: 'blocked', reason: 'invalid-key' };
  }

  if (PUBLIC_EMPRESA_ASSET_PATTERN.test(key)) {
    return { visibility: 'public', cache: 'public' };
  }

  const firaMatch = key.match(/^fira\/(\d+)\/.+/);
  if (firaMatch) {
    return { visibility: 'tenant', empresaId: Number(firaMatch[1]), cache: 'private' };
  }

  if (/^EXAME-ASO-/i.test(key)) {
    return { visibility: 'blocked', reason: 'aso-health-document' };
  }

  if (/^(certificados|funcionarios|qualificacoes)\//i.test(key)) {
    return { visibility: 'blocked', reason: 'requires-authenticated-owner-route' };
  }

  return { visibility: 'blocked', reason: 'unknown-prefix' };
}

async function authorizeTenantAsset(c: Parameters<typeof getTenantContext>[0], empresaId: number) {
  let tenantAuthorized = false;
  let tenantMiddlewareResponse: Response | void;

  const authResponse = await auth()(c, async () => {
    tenantMiddlewareResponse = await tenantMiddleware()(c, async () => {
      const tenantContext = getTenantContext(c);
      tenantAuthorized = tenantContext.empresaId === empresaId;
    });
  });

  if (authResponse) return authResponse;
  if (tenantMiddlewareResponse) return tenantMiddlewareResponse;
  if (!tenantAuthorized) {
    return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
  }

  return null;
}

/**
 * GET /api/assets/*
 * Serve apenas assets explicitamente permitidos.
 * - Público: logos/branding em empresas/{empresaId}/...
 * - Privado: FIRA tenant-scoped em fira/{empresaId}/...
 * Demais prefixos devem usar rotas autenticadas específicas.
 */
assetsRouter.get('/*', async (c) => {
  const wildcardKey = c.req.param('*');
  const pathname = new URL(c.req.url).pathname;
  const prefix = '/api/assets/';
  const key = normalizeAssetKey(
    wildcardKey || (pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''),
  );

  if (!key) {
    return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
  }

  const policy = classifyAssetAccess(key);

  if (policy.visibility === 'blocked') {
    return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
  }

  if (!c.env.BUCKET) {
    return c.json({ success: false, error: 'Storage não configurado' }, 500);
  }

  if (policy.visibility === 'tenant') {
    try {
      const authResult = await authorizeTenantAsset(c, policy.empresaId);
      if (authResult) return authResult;
    } catch (error) {
      console.warn('[assets] acesso privado negado para prefixo tenant-scoped:', error);
      return c.json({ success: false, error: 'Arquivo não encontrado' }, 404);
    }
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

    headers.set('Cache-Control', policy.cache === 'public' ? PUBLIC_CACHE : PRIVATE_CACHE);

    return new Response(object.body, {
      headers,
    });
  } catch (error: any) {
    console.error(`Erro ao servir asset permitido ${key}:`, error);
    return c.json({ success: false, error: 'Erro interno ao recuperar arquivo' }, 500);
  }
});

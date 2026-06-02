import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', 'manager');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  tenantMiddleware:
    () =>
    async (c: any, next: () => Promise<void>) => {
      const empresaId = Number(c.get('empresaId') || 0);
      if (!empresaId) {
        return c.json({ success: false, error: 'Tenant não identificado' }, 401);
      }

      c.set('tenantContext', {
        empresaId,
        empresaCodigo: `empresa-${empresaId}`,
        empresaNome: `Empresa ${empresaId}`,
        role: 'manager',
        plano: 'pro',
        permissions: [],
      });
      await next();
    },
  getTenantContext: (c: any) => c.get('tenantContext'),
}));

import { assetsRouter } from '../../routes/assets';

function createAssetsApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route('/api/assets', assetsRouter);
  return app;
}

function createR2Object(body: string, contentType = 'application/pdf') {
  return {
    body: new Blob([body]).stream(),
    httpEtag: '"test-etag"',
    writeHttpMetadata: (headers: Headers) => {
      headers.set('Content-Type', contentType);
    },
  } as unknown as R2ObjectBody;
}

function createEnv(getImpl = vi.fn(async () => createR2Object('ok'))) {
  return {
    BUCKET: {
      get: getImpl,
    },
  } as unknown as Env;
}

async function requestAsset(path: string, env: Env, headers?: HeadersInit) {
  const app = createAssetsApp();
  return app.fetch(new Request(`http://localhost${path}`, { headers }), env, {} as ExecutionContext);
}

describe('GET /api/assets/* asset access policy', () => {
  it('permite logo pública de empresa sem token', async () => {
    const get = vi.fn(async () => createR2Object('logo', 'image/png'));
    const response = await requestAsset('/api/assets/empresas/6/logo-1760000000000.png', createEnv(get));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('logo');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(get).toHaveBeenCalledWith('empresas/6/logo-1760000000000.png');
  });

  it('bloqueia fira tenant-scoped sem token antes de ler o R2', async () => {
    const get = vi.fn(async () => createR2Object('fira'));
    const response = await requestAsset('/api/assets/fira/6/CANAC/2026-06/fira.pdf', createEnv(get));

    expect(response.status).not.toBe(200);
    expect(get).not.toHaveBeenCalled();
  });

  it('serve fira tenant-scoped para usuário do mesmo tenant com cache privado', async () => {
    const get = vi.fn(async () => createR2Object('fira'));
    const response = await requestAsset('/api/assets/fira/6/CANAC/2026-06/fira.pdf', createEnv(get), {
      Authorization: 'Bearer test-token',
      'x-test-empresa-id': '6',
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('fira');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cache-control')).not.toContain('public');
    expect(get).toHaveBeenCalledWith('fira/6/CANAC/2026-06/fira.pdf');
  });

  it('bloqueia cross-tenant fira antes de ler o R2', async () => {
    const get = vi.fn(async () => createR2Object('fira'));
    const response = await requestAsset('/api/assets/fira/9/CANAC/2026-06/fira.pdf', createEnv(get), {
      Authorization: 'Bearer test-token',
      'x-test-empresa-id': '6',
    });

    expect([403, 404]).toContain(response.status);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    '/api/assets/EXAME-ASO-JOAO-20260602-abcd1234.pdf',
    '/api/assets/certificados/CERT-JOAO-G1-20260602-abcd1234.pdf',
    '/api/assets/funcionarios/123/documento.pdf',
    '/api/assets/qualificacoes/123/documento.pdf',
    '/api/assets/outro-prefixo/documento.pdf',
  ])('bloqueia prefixo privado ou desconhecido antes de ler o R2: %s', async (path) => {
    const get = vi.fn(async () => createR2Object('private'));
    const response = await requestAsset(path, createEnv(get), {
      Authorization: 'Bearer test-token',
      'x-test-empresa-id': '6',
    });

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});

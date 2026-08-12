/**
 * Testes de regressao CORS - Guias do Instrutor (HTML, PDF, download).
 *
 * O harness usa o middleware CORS real e allowlists explícitas por ambiente.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cors } from '../../middleware/cors';
import { errorHandler } from '../../middleware/error-handler';
import type { Env } from '../../types';

type TestContext = {
  req: { header: (name: string) => string | undefined };
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  json: (body: unknown, status?: number) => unknown;
};

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: TestContext, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token nao fornecido' }, 401);
    }
    c.set('userId', Number(c.req.header('x-test-user-id') || 1));
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
    c.set('userRole', c.req.header('x-test-role') || 'instructor');
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: TestContext) => ({
      empresaId: Number(c.get('empresaId') || 0),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
      empresaNome: 'Empresa Teste',
      role: 'instructor',
      plano: 'pro',
      permissions: [],
    }),
  };
});

vi.mock('../../middleware/guias-instrutor-permissions', () => {
  const READ = new Set(['INSTRUTOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN']);
  const MANAGE = new Set(['GESTOR', 'ADMIN', 'SUPER_ADMIN']);
  const guard =
    (allowed: Set<string>, message: string) =>
    () =>
    async (c: TestContext, next: () => Promise<void>) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      if (!allowed.has(role)) {
        return c.json({ success: false, error: message }, 403);
      }
      c.set('guiasInstrutorRole', role);
      await next();
    };
  const GUIAS_INSTRUTOR_CAPABILITIES = {
    visualizar: 'simuladores.guias.visualizar',
    gerenciar: 'simuladores.guias.gerenciar',
  } as const;

  return {
    GUIAS_INSTRUTOR_CAPABILITIES,
    requireGuiaInstrutorRead: guard(READ, 'Acesso restrito a instrutores autorizados'),
    requireGuiaInstrutorManage: guard(MANAGE, 'Publicacao restrita a gestores/administradores'),
    hasGuiaInstrutorCapability: async (c: TestContext, capability: string) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      if (role === 'PLATFORM_ADMIN') return true;
      if (capability === GUIAS_INSTRUTOR_CAPABILITIES.gerenciar) return MANAGE.has(role);
      return READ.has(role);
    },
    resolveGuiaInstrutorPermissions: async (c: TestContext) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      const isPlatformAdmin = role === 'PLATFORM_ADMIN';
      return {
        podeVisualizar: isPlatformAdmin || READ.has(role),
        podeGerenciar: isPlatformAdmin || MANAGE.has(role),
        isPlatformAdmin,
      };
    },
  };
});

import guiasInstrutorRoutes from '../../routes/simuladores-guias-instrutor';

const HTML_CONTENT = '<html><body>Guia de Instrutor</body></html>';
const PDF_CONTENT = '%PDF-1.4 fake pdf content';
const PROD_ORIGIN = 'https://airtrust.online';
const WWW_ORIGIN = 'https://www.airtrust.online';
const STAGING_ORIGIN = 'https://staging.airtrust.pages.dev';
const PAGES_DEV_ORIGIN = 'https://meu-branch.airtrust.pages.dev';
const UNAUTHORIZED_ORIGIN = 'https://evil.example.com';
const LOCALHOST_ORIGIN = 'http://localhost:5173';
const PROD_CORS_ORIGINS = [
  PROD_ORIGIN,
  WWW_ORIGIN,
  'https://airtrust.pages.dev',
  'https://production.airtrust.pages.dev',
].join(',');
const STAGING_CORS_ORIGINS = STAGING_ORIGIN;
const DEV_CORS_ORIGINS = LOCALHOST_ORIGIN;

function createMockEnv(empresaId = 6, corsOrigins = PROD_CORS_ORIGINS): Env {
  const r2Objects: Record<string, { body: string; type: string }> = {
    [`guias-instrutor/${empresaId}/AW139/PERIODICO/A139-P-02-04-C1/1.0/index.html`]: {
      body: HTML_CONTENT,
      type: 'text/html; charset=utf-8',
    },
    [`guias-instrutor/${empresaId}/AW139/PERIODICO/A139-P-02-04-C1/1.0/guia.pdf`]: {
      body: PDF_CONTENT,
      type: 'application/pdf',
    },
  };

  const guia = {
    id: 1,
    empresa_id: empresaId,
    modelo_aeronave_id: 1,
    programa: 'PERIODICO',
    ciclo: 1,
    sessao_numero: 2,
    sessao_total: 4,
    codigo: 'A139-P-02/04-C1',
    titulo: 'Guia AW139',
    descricao: null,
    versao: '1.0',
    status: 'ATIVO',
    html_r2_key: `guias-instrutor/${empresaId}/AW139/PERIODICO/A139-P-02-04-C1/1.0/index.html`,
    html_nome: 'guia.html',
    html_mime_type: 'text/html',
    html_tamanho_bytes: HTML_CONTENT.length,
    html_sha256: 'abc',
    html_status_validacao: 'VALIDO',
    pdf_r2_key: `guias-instrutor/${empresaId}/AW139/PERIODICO/A139-P-02-04-C1/1.0/guia.pdf`,
    pdf_nome: 'guia.pdf',
    pdf_mime_type: 'application/pdf',
    pdf_tamanho_bytes: PDF_CONTENT.length,
    pdf_sha256: 'def',
    substituido_por_id: null,
    publicado_em: '2026-07-01',
    created_by: 1,
    updated_by: null,
    created_at: '2026-07-01',
    updated_at: '2026-07-01',
    deleted_at: null,
  };

  const DB = {
    prepare(sql: string) {
      const binder = {
        _params: [] as unknown[],
        bind(...params: unknown[]) {
          binder._params = params;
          return binder;
        },
        async first<T = unknown>(): Promise<T | null> {
          if (sql.includes('FROM modelos_aeronave')) {
            return { id: 1, nome: 'AW139', codigo: 'AW139' } as unknown as T;
          }
          if (
            sql.includes('FROM simuladores_guias_instrutor') &&
            (sql.includes('WHERE id = ? AND empresa_id = ?') ||
              sql.includes('WHERE g.id = ? AND g.empresa_id = ?'))
          ) {
            const [id, empId] = binder._params as [number, number];
            if (id === guia.id && empId === guia.empresa_id) {
              return guia as unknown as T;
            }
          }
          return null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async run() {
          return { meta: { last_row_id: 1 } };
        },
      };
      return binder;
    },
    batch: vi.fn(async () => []),
  };

  const BUCKET = {
    async get(key: string) {
      const obj = r2Objects[key];
      if (!obj) return null;
      const blob = new Blob([obj.body], { type: obj.type });
      return { body: blob.stream() } as unknown as R2ObjectBody;
    },
    async put() {
      return {};
    },
  };

  return { DB, BUCKET, CORS_ORIGINS: corsOrigins } as unknown as Env;
}

function createAppWithCors() {
  const app = new Hono<{ Bindings: Env }>();

  app.all('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      const { resolveAllowedOrigin } = await import('../../config/allowed-origins');
      const origin = c.req.header('Origin');
      const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);
      c.header('Access-Control-Allow-Origin', resolvedOrigin);
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Max-Age', '86400');
      c.status(204);
      return c.body(null);
    }
    await next();
  });

  app.use('*', cors());
  app.onError(errorHandler);
  app.route('/api/simuladores', guiasInstrutorRoutes);
  return app;
}

function authHeaders(origin: string, empresaId = 6) {
  return {
    Authorization: 'Bearer x',
    Origin: origin,
    'x-test-empresa-id': String(empresaId),
    'x-test-guia-role': 'INSTRUTOR',
  };
}

function assertCorsHeaders(res: Response, expectedOrigin: string) {
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(expectedOrigin);
  expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  expect((res.headers.get('Vary') || '').toLowerCase()).toContain('origin');
}

describe('CORS — guias-instrutor binary endpoints (regressao)', () => {
  let env: Env;
  let app: ReturnType<typeof createAppWithCors>;

  beforeEach(() => {
    env = createMockEnv();
    app = createAppWithCors();
  });

  it.each([
    ['/api/simuladores/guias-instrutor/1/html', /text\/html/i],
    ['/api/simuladores/guias-instrutor/1/pdf', /application\/pdf/i],
    ['/api/simuladores/guias-instrutor/1/download', /application\/pdf/i],
  ])('mantem CORS credenciado na rota %s', async (path, contentType) => {
    const res = await app.request(path, { headers: authHeaders(PROD_ORIGIN) }, env);
    expect(res.status).toBe(200);
    assertCorsHeaders(res, PROD_ORIGIN);
    expect(res.headers.get('Content-Type')).toMatch(contentType);
  });

  it('preserva os headers de seguranca do HTML', async () => {
    const res = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: authHeaders(PROD_ORIGIN) },
      env,
    );
    expect(res.headers.get('Content-Security-Policy') || '').toContain("script-src 'none'");
    expect(res.headers.get('Content-Security-Policy') || '').toContain("connect-src 'none'");
    expect(res.headers.get('Cache-Control') || '').toContain('no-store');
    expect(await res.text()).toContain('<html>');
  });

  it('preserva Content-Disposition e corpo PDF', async () => {
    for (const [path, mode] of [
      ['/api/simuladores/guias-instrutor/1/pdf', 'inline'],
      ['/api/simuladores/guias-instrutor/1/download', 'attachment'],
    ] as const) {
      const res = await app.request(path, { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.headers.get('Content-Disposition') || '').toContain(mode);
      expect(res.headers.get('Access-Control-Expose-Headers') || '').toContain(
        'Content-Disposition',
      );
      expect((await res.text()).startsWith('%PDF')).toBe(true);
    }
  });

  it('autoriza apenas origens exatas do ambiente', async () => {
    const www = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: authHeaders(WWW_ORIGIN) },
      env,
    );
    assertCorsHeaders(www, WWW_ORIGIN);

    const stagingEnv = createMockEnv(6, STAGING_CORS_ORIGINS);
    const staging = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: authHeaders(STAGING_ORIGIN) },
      stagingEnv,
    );
    assertCorsHeaders(staging, STAGING_ORIGIN);

    const devEnv = createMockEnv(6, DEV_CORS_ORIGINS);
    const local = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: authHeaders(LOCALHOST_ORIGIN) },
      devEnv,
    );
    assertCorsHeaders(local, LOCALHOST_ORIGIN);
  });

  it.each([PAGES_DEV_ORIGIN, UNAUTHORIZED_ORIGIN])(
    'nao devolve CORS credenciado para origem nao autorizada %s',
    async (origin) => {
      const res = await app.request(
        '/api/simuladores/guias-instrutor/1/html',
        { headers: authHeaders(origin) },
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    },
  );

  it('mantem CORS em respostas autenticadas de erro', async () => {
    const unauthorized = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: { Origin: PROD_ORIGIN } },
      env,
    );
    expect(unauthorized.status).toBe(401);
    assertCorsHeaders(unauthorized, PROD_ORIGIN);

    const forbidden = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      {
        headers: {
          Authorization: 'Bearer x',
          Origin: PROD_ORIGIN,
          'x-test-empresa-id': '6',
          'x-test-guia-role': 'USUARIO',
        },
      },
      env,
    );
    expect(forbidden.status).toBe(403);
    assertCorsHeaders(forbidden, PROD_ORIGIN);
  });

  it('preserva isolamento de tenant e CORS no 404', async () => {
    const missing = await app.request(
      '/api/simuladores/guias-instrutor/9999/html',
      { headers: authHeaders(PROD_ORIGIN) },
      env,
    );
    expect(missing.status).toBe(404);
    assertCorsHeaders(missing, PROD_ORIGIN);

    const crossTenant = await app.request(
      '/api/simuladores/guias-instrutor/1/html',
      { headers: authHeaders(PROD_ORIGIN, 7) },
      env,
    );
    expect(crossTenant.status).toBe(404);
    assertCorsHeaders(crossTenant, PROD_ORIGIN);
  });

  it.each([
    '/api/simuladores/guias-instrutor/1/html',
    '/api/simuladores/guias-instrutor/1/pdf',
    '/api/simuladores/guias-instrutor/1/download',
  ])('responde preflight permitido na rota %s', async (path) => {
    const res = await app.request(
      path,
      {
        method: 'OPTIONS',
        headers: {
          Origin: PROD_ORIGIN,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});

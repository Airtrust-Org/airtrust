/**
 * Testes de regressao CORS - Guias do Instrutor (HTML, PDF, download)
 *
 * Garante que NENHUMA resposta binaria dos Guias perca os headers CORS, mesmo
 * que a implementacao seja alterada no futuro.
 *
 * O app de teste monta o middleware cors() real + as rotas, replicando a
 * configuracao do index.ts em producao.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { cors } from '../../middleware/cors';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
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
    getTenantContext: (c: any) => ({
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
    async (c: any, next: () => Promise<void>) => {
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
    hasGuiaInstrutorCapability: async (c: any, capability: string) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      if (role === 'PLATFORM_ADMIN') return true;
      if (capability === GUIAS_INSTRUTOR_CAPABILITIES.gerenciar) return MANAGE.has(role);
      return READ.has(role);
    },
    resolveGuiaInstrutorPermissions: async (c: any) => {
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

function createMockEnv(empresaId = 6) {
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
            (sql.includes('WHERE id = ? AND empresa_id = ?') || sql.includes('WHERE g.id = ? AND g.empresa_id = ?'))
          ) {
            const [id, empId] = binder._params as [number, number];
            if (id === guia.id && empId === guia.empresa_id) {
              return guia as unknown as T;
            }
            return null;
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

  return { DB, BUCKET } as unknown as Env;
}

function createAppWithCors() {
  const app = new Hono<{ Bindings: Env }>();

  app.all('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      const { resolveAllowedOrigin } = await import('../../config/allowed-origins');
      const origin = c.req.header('Origin');
      const resolvedOrigin = resolveAllowedOrigin(origin, (c.env as any)?.CORS_ORIGINS);
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

const PROD_ORIGIN = 'https://airtrust.online';
const WWW_ORIGIN = 'https://www.airtrust.online';
const STAGING_ORIGIN = 'https://production.airtrust.pages.dev';
const PAGES_DEV_ORIGIN = 'https://meu-branch.airtrust.pages.dev';
const UNAUTHORIZED_ORIGIN = 'https://evil.example.com';
const LOCALHOST_ORIGIN = 'http://localhost:5173';

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
  const vary = res.headers.get('Vary') || '';
  expect(vary.toLowerCase()).toContain('origin');
}

describe('CORS — guias-instrutor binary endpoints (regressao)', () => {
  let env: Env;
  let app: ReturnType<typeof createAppWithCors>;

  beforeEach(() => {
    env = createMockEnv(6);
    app = createAppWithCors();
  });

  describe('GET /guias-instrutor/:id/html', () => {
    it('retorna 200 com CORS correto para https://airtrust.online', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, PROD_ORIGIN);
      expect(res.headers.get('Content-Type')).toMatch(/text\/html/i);
      const body = await res.text();
      expect(body).toContain('<html>');
    });

    it('retorna CORS para https://www.airtrust.online', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(WWW_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, WWW_ORIGIN);
    });

    it('retorna CORS para staging (pages.dev estatico)', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(STAGING_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, STAGING_ORIGIN);
    });

    it('retorna CORS para subdomain dinamico *.airtrust.pages.dev', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(PAGES_DEV_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, PAGES_DEV_ORIGIN);
    });

    it('retorna CORS para localhost (desenvolvimento)', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(LOCALHOST_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, LOCALHOST_ORIGIN);
    });

    it('NAO autoriza origem maliciosa', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(UNAUTHORIZED_ORIGIN) }, env);
      const acao = res.headers.get('Access-Control-Allow-Origin') || '';
      expect(acao).not.toBe(UNAUTHORIZED_ORIGIN);
    });

    it('mantem CSP restritiva (script-src none; connect-src none)', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(PROD_ORIGIN) }, env);
      const csp = res.headers.get('Content-Security-Policy') || '';
      expect(csp).toContain("script-src 'none'");
      expect(csp).toContain("connect-src 'none'");
    });

    it('mantem Cache-Control private no-store', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(PROD_ORIGIN) }, env);
      const cc = res.headers.get('Cache-Control') || '';
      expect(cc).toContain('private');
      expect(cc).toContain('no-store');
    });

    it('401 sem autenticacao tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: { Origin: PROD_ORIGIN } }, env);
      expect(res.status).toBe(401);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });

    it('403 sem permissao tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', {
        headers: { Authorization: 'Bearer x', Origin: PROD_ORIGIN, 'x-test-empresa-id': '6', 'x-test-guia-role': 'USUARIO' },
      }, env);
      expect(res.status).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });

    it('404 (guia nao existe) tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/9999/html', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(404);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });

    it('isolamento de tenant: empresa 7 nao acessa guia da empresa 6, mas CORS presente', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/html', { headers: authHeaders(PROD_ORIGIN, 7) }, env);
      expect(res.status).toBe(404);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });
  });

  describe('GET /guias-instrutor/:id/pdf', () => {
    it('retorna 200 com CORS correto e Content-Type application/pdf', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, PROD_ORIGIN);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('Content-Disposition e inline com filename', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: authHeaders(PROD_ORIGIN) }, env);
      const disposition = res.headers.get('Content-Disposition') || '';
      expect(disposition).toContain('inline');
      expect(disposition).toContain('filename=');
    });

    it('Access-Control-Expose-Headers inclui Content-Disposition', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: authHeaders(PROD_ORIGIN) }, env);
      const expose = res.headers.get('Access-Control-Expose-Headers') || '';
      expect(expose).toContain('Content-Disposition');
    });

    it('corpo comeca com %PDF', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: authHeaders(PROD_ORIGIN) }, env);
      const text = await res.text();
      expect(text.startsWith('%PDF')).toBe(true);
    });

    it('retorna CORS para www.airtrust.online', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: authHeaders(WWW_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, WWW_ORIGIN);
    });

    it('401 sem token tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', { headers: { Origin: PROD_ORIGIN } }, env);
      expect(res.status).toBe(401);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });

    it('403 sem permissao tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/pdf', {
        headers: { Authorization: 'Bearer x', Origin: PROD_ORIGIN, 'x-test-empresa-id': '6', 'x-test-guia-role': 'USUARIO' },
      }, env);
      expect(res.status).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });

    it('404 quando guia nao existe tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/9999/pdf', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(404);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });
  });

  describe('GET /guias-instrutor/:id/download', () => {
    it('retorna 200 com CORS correto e Content-Type application/pdf', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, PROD_ORIGIN);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('Content-Disposition e attachment', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      const disposition = res.headers.get('Content-Disposition') || '';
      expect(disposition).toContain('attachment');
    });

    it('nome do arquivo nao expoe chave R2 interna', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      const disposition = res.headers.get('Content-Disposition') || '';
      expect(disposition).not.toContain('guias-instrutor/6/AW139');
    });

    it('Access-Control-Expose-Headers inclui Content-Disposition', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      const expose = res.headers.get('Access-Control-Expose-Headers') || '';
      expect(expose).toContain('Content-Disposition');
    });

    it('corpo comeca com %PDF (nao e JSON de erro)', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      const text = await res.text();
      expect(text.startsWith('%PDF')).toBe(true);
      expect(text).not.toContain('"success":false');
    });

    it('retorna CORS para staging origin', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(STAGING_ORIGIN) }, env);
      expect(res.status).toBe(200);
      assertCorsHeaders(res, STAGING_ORIGIN);
    });

    it('NAO autoriza origem maliciosa', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/1/download', { headers: authHeaders(UNAUTHORIZED_ORIGIN) }, env);
      const acao = res.headers.get('Access-Control-Allow-Origin') || '';
      expect(acao).not.toBe(UNAUTHORIZED_ORIGIN);
    });

    it('404 quando guia nao existe tambem carrega CORS', async () => {
      const res = await app.request('/api/simuladores/guias-instrutor/9999/download', { headers: authHeaders(PROD_ORIGIN) }, env);
      expect(res.status).toBe(404);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    });
  });

  describe('OPTIONS preflight (todos os endpoints)', () => {
    const endpoints = [
      '/api/simuladores/guias-instrutor/1/html',
      '/api/simuladores/guias-instrutor/1/pdf',
      '/api/simuladores/guias-instrutor/1/download',
    ];

    for (const endpoint of endpoints) {
      it(`${endpoint} - retorna 204 com headers de preflight corretos`, async () => {
        const res = await app.request(endpoint, {
          method: 'OPTIONS',
          headers: { Origin: PROD_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization, Content-Type' },
        }, env);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      });
    }
  });

  describe('REGRESSAO - nenhuma rota de arquivo perde CORS', () => {
    const fileRoutes = [
      { path: '/api/simuladores/guias-instrutor/1/html', label: 'HTML' },
      { path: '/api/simuladores/guias-instrutor/1/pdf', label: 'PDF inline' },
      { path: '/api/simuladores/guias-instrutor/1/download', label: 'PDF download' },
    ];

    for (const route of fileRoutes) {
      it(`${route.label}: sempre contem Access-Control-Allow-Origin (nao null, nao vazio)`, async () => {
        const res = await app.request(route.path, { headers: authHeaders(PROD_ORIGIN) }, env);
        const acao = res.headers.get('Access-Control-Allow-Origin');
        expect(acao).not.toBeNull();
        expect(acao).not.toBe('');
        expect(acao).not.toBe('*');
      });

      it(`${route.label}: nao usa wildcard Access-Control-Allow-Origin: * (incompativel com credenciais)`, async () => {
        const res = await app.request(route.path, { headers: authHeaders(PROD_ORIGIN) }, env);
        expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      });
    }
  });
});

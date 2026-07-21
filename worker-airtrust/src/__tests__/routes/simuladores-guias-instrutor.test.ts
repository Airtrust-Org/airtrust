import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

// Auth: injeta userId/empresaId/userRole a partir de headers de teste, exige
// Authorization como qualquer rota real.
vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
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

// Permissão explícita: simulada via header x-test-guia-role, para isolar o
// teste de rota da lógica interna de usuarios_empresas (coberta à parte).
vi.mock('../../middleware/guias-instrutor-permissions', () => {
  const READ = new Set(['INSTRUTOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN']);
  const MANAGE = new Set(['GESTOR', 'ADMIN', 'SUPER_ADMIN']);
  const guard =
    (allowed: Set<string>, message: string) => () => async (c: any, next: () => Promise<void>) => {
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
    requireGuiaInstrutorManage: guard(MANAGE, 'Publicação restrita a gestores/administradores'),
    // Espelha, para os testes de rota, a mesma role de teste (x-test-guia-role)
    // já usada pelo guard acima — não reintroduz a lógica real de
    // DENY/GRANT/platform-admin (coberta à parte em
    // __tests__/middleware/guias-instrutor-permissions.test.ts).
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

type GuiaRow = {
  id: number;
  empresa_id: number;
  modelo_aeronave_id: number;
  programa: string;
  ciclo: number | null;
  sessao_numero: number | null;
  sessao_total: number | null;
  codigo: string;
  titulo: string;
  descricao: string | null;
  versao: string;
  status: string;
  html_r2_key: string | null;
  html_nome: string | null;
  html_mime_type: string | null;
  html_tamanho_bytes: number | null;
  html_sha256: string | null;
  html_status_validacao: string;
  pdf_r2_key: string | null;
  pdf_nome: string | null;
  pdf_mime_type: string | null;
  pdf_tamanho_bytes: number | null;
  pdf_sha256: string | null;
  substituido_por_id: number | null;
  publicado_em: string | null;
  created_by: number;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function baseGuia(overrides: Partial<GuiaRow>): GuiaRow {
  return {
    id: 1,
    empresa_id: 6,
    modelo_aeronave_id: 1,
    programa: 'PERIODICO',
    ciclo: 1,
    sessao_numero: 2,
    sessao_total: 4,
    codigo: 'A139-P-02/04-C1',
    titulo: 'Guia AW139 Periódico C1 Sessão 2',
    descricao: null,
    versao: '1.0',
    status: 'ATIVO',
    html_r2_key: 'guias-instrutor/6/AW139/PERIODICO/A139-P-02-04-C1/1.0/index.html',
    html_nome: 'guia.html',
    html_mime_type: 'text/html',
    html_tamanho_bytes: 100,
    html_sha256: 'abc',
    html_status_validacao: 'VALIDO',
    pdf_r2_key: 'guias-instrutor/6/AW139/PERIODICO/A139-P-02-04-C1/1.0/guia.pdf',
    pdf_nome: 'guia.pdf',
    pdf_mime_type: 'application/pdf',
    pdf_tamanho_bytes: 200,
    pdf_sha256: 'def',
    substituido_por_id: null,
    publicado_em: '2026-07-01',
    created_by: 1,
    updated_by: null,
    created_at: '2026-07-01',
    updated_at: '2026-07-01',
    deleted_at: null,
    ...overrides,
  };
}

function createR2Object(body: string, contentType: string) {
  const blob = new Blob([body], { type: contentType });
  return { body: blob.stream() } as unknown as R2ObjectBody;
}

function createMockEnv(guias: GuiaRow[]) {
  const r2Objects: Record<string, string> = {
    'guias-instrutor/6/AW139/PERIODICO/A139-P-02-04-C1/1.0/index.html': '<html><body>guia</body></html>',
    'guias-instrutor/6/AW139/PERIODICO/A139-P-02-04-C1/1.0/guia.pdf': '%PDF-1.4 fake',
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
          if (sql.includes('FROM simuladores_guias_instrutor') && sql.includes('WHERE id = ? AND empresa_id = ?')) {
            const [id, empresaId] = binder._params as [number, number];
            const anyStatus = !sql.includes("status = 'ATIVO'");
            const row = guias.find(
              (g) =>
                g.id === id &&
                g.empresa_id === empresaId &&
                g.deleted_at === null &&
                (anyStatus || g.status === 'ATIVO'),
            );
            return (row as unknown as T) ?? null;
          }
          return null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          if (sql.includes('FROM simuladores_guias_instrutor g') && sql.includes('JOIN modelos_aeronave')) {
            const empresaId = binder._params[0] as number;
            const filterAtivoOnly = sql.includes("g.status = 'ATIVO'");
            const results = guias
              .filter((g) => g.empresa_id === empresaId && g.deleted_at === null)
              .filter((g) => (filterAtivoOnly ? g.status === 'ATIVO' : true))
              .map((g) => ({ ...g, aeronave_nome: 'AW139', aeronave_codigo: 'AW139' }));
            return { results: results as unknown as T[] };
          }
          return { results: [] };
        },
        async run() {
          return { meta: { last_row_id: 999 } };
        },
      };
      return binder;
    },
    batch: vi.fn(async () => []),
  };

  const BUCKET = {
    async get(key: string) {
      if (!(key in r2Objects)) return null;
      return createR2Object(r2Objects[key], key.endsWith('.pdf') ? 'application/pdf' : 'text/html');
    },
    async put() {
      return {};
    },
  };

  return { DB, BUCKET } as unknown as Env;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/simuladores', guiasInstrutorRoutes);
  return app;
}

describe('simuladores-guias-instrutor — segurança e isolamento', () => {
  let guias: GuiaRow[];

  beforeEach(() => {
    guias = [
      baseGuia({ id: 1, empresa_id: 6, status: 'ATIVO' }),
      baseGuia({ id: 2, empresa_id: 6, status: 'INATIVO', versao: '0.9' }),
      baseGuia({ id: 3, empresa_id: 6, status: 'SUBSTITUIDO', versao: '0.8' }),
      baseGuia({
        id: 4,
        empresa_id: 6,
        status: 'ATIVO',
        html_status_validacao: 'REJEITADO',
        html_r2_key: 'guias-instrutor/6/AW139/PERIODICO/A139-P-02-04-C1/1.0/index.html',
        codigo: 'A139-P-03/04-C1',
      }),
      baseGuia({
        id: 5,
        empresa_id: 6,
        status: 'ATIVO',
        html_r2_key: null,
        html_status_validacao: 'PENDENTE',
        codigo: 'A139-P-04/04-C1',
      }),
      baseGuia({ id: 101, empresa_id: 7, status: 'ATIVO' }), // outra empresa
    ];
  });

  it('GET /guias-instrutor/minhas-permissoes reflete a capability real (nao texto de role)', async () => {
    const app = createApp();
    const platformAdminRes = await app.request(
      '/api/simuladores/guias-instrutor/minhas-permissoes',
      { headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'PLATFORM_ADMIN' } },
      createMockEnv(guias),
    );
    expect(platformAdminRes.status).toBe(200);
    expect(await platformAdminRes.json()).toMatchObject({
      success: true,
      data: { podeVisualizar: true, podeGerenciar: true, isPlatformAdmin: true },
    });

    const instrutorRes = await app.request(
      '/api/simuladores/guias-instrutor/minhas-permissoes',
      { headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'INSTRUTOR' } },
      createMockEnv(guias),
    );
    expect(await instrutorRes.json()).toMatchObject({
      success: true,
      data: { podeVisualizar: true, podeGerenciar: false, isPlatformAdmin: false },
    });

    const semAcessoRes = await app.request(
      '/api/simuladores/guias-instrutor/minhas-permissoes',
      { headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'USUARIO' } },
      createMockEnv(guias),
    );
    expect(await semAcessoRes.json()).toMatchObject({
      success: true,
      data: { podeVisualizar: false, podeGerenciar: false, isPlatformAdmin: false },
    });
  });

  it('instrutor lista apenas guias ATIVOs da própria empresa', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'INSTRUTOR' },
    }, createMockEnv(guias));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: number; status: string }> };
    const ids = body.data.map((g) => g.id).sort();
    expect(ids).toEqual([1, 4, 5]); // apenas ATIVO da empresa 6
  });

  it('aluno (sem vínculo de instrutor/gestor) recebe 403', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'USUARIO' },
    }, createMockEnv(guias));

    expect(res.status).toBe(403);
  });

  it('instrutor de outra empresa não enxerga nem acessa guia da empresa 6', async () => {
    const app = createApp();
    const env = createMockEnv(guias);

    const list = await app.request('/api/simuladores/guias-instrutor', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '7', 'x-test-guia-role': 'INSTRUTOR' },
    }, env);
    const listBody = (await list.json()) as { data: Array<{ id: number }> };
    expect(listBody.data.map((g) => g.id)).toEqual([101]);

    const detail = await app.request('/api/simuladores/guias-instrutor/1', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '7', 'x-test-guia-role': 'INSTRUTOR' },
    }, env);
    expect(detail.status).toBe(404);
  });

  it('HTML/PDF/download exigem autenticação', async () => {
    const app = createApp();
    const env = createMockEnv(guias);
    for (const path of ['html', 'pdf', 'download']) {
      const res = await app.request(`/api/simuladores/guias-instrutor/1/${path}`, {}, env);
      expect(res.status).toBe(401);
    }
  });

  it('HTML de outro tenant retorna 404 seguro (sem vazar metadados)', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor/1/html', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '7', 'x-test-guia-role': 'INSTRUTOR' },
    }, createMockEnv(guias));
    expect(res.status).toBe(404);
  });

  it('HTML rejeitado não é servido mesmo com guia ATIVO', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor/4/html', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'INSTRUTOR' },
    }, createMockEnv(guias));
    expect(res.status).toBe(404);
  });

  it('PDF é servido mesmo quando HTML está PENDENTE', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor/5/pdf', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'INSTRUTOR' },
    }, createMockEnv(guias));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('download usa Content-Disposition attachment com nome legível e sanitizado', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor/1/download', {
      headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'INSTRUTOR' },
    }, createMockEnv(guias));
    expect(res.status).toBe(200);
    const disposition = res.headers.get('Content-Disposition') || '';
    expect(disposition).toContain('attachment');
    expect(disposition).not.toContain('guias-instrutor/6/AW139'); // não expõe a chave R2
  });

  it('gestor sem manage não cria guia (instrutor tentando publicar)', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer x',
        'x-test-empresa-id': '6',
        'x-test-guia-role': 'INSTRUTOR',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        modelo_aeronave_id: 1,
        programa: 'PERIODICO',
        codigo: 'A139-P-99/04-C1',
        titulo: 'x',
        versao: '1.0',
      }),
    }, createMockEnv(guias));
    expect(res.status).toBe(403);
  });

  it('gestor com manage cria guia em RASCUNHO', async () => {
    const app = createApp();
    const res = await app.request('/api/simuladores/guias-instrutor', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer x',
        'x-test-empresa-id': '6',
        'x-test-guia-role': 'ADMIN',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        modelo_aeronave_id: 1,
        programa: 'PERIODICO',
        codigo: 'A139-P-99/04-C1',
        titulo: 'x',
        versao: '1.0',
      }),
    }, createMockEnv(guias));
    expect(res.status).toBe(201);
  });

  it('publicação de versão: falha na escrita final compensa (apaga R2 órfão + rascunho D1)', async () => {
    const app = createApp();
    const base = baseGuia({ id: 50, empresa_id: 6, status: 'RASCUNHO', html_r2_key: null, pdf_r2_key: null });

    const putKeys: string[] = [];
    const deletedKeys: string[] = [];
    let deletedDraftId: number | null = null;
    let updateAttempted = false;

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
            if (sql.includes('FROM simuladores_guias_instrutor') && sql.includes('WHERE id = ? AND empresa_id = ?')) {
              return base as unknown as T;
            }
            return null;
          },
          async run() {
            if (sql.trim().startsWith('UPDATE simuladores_guias_instrutor')) {
              updateAttempted = true;
              throw new Error('simulated D1 write failure');
            }
            if (sql.trim().startsWith('DELETE FROM simuladores_guias_instrutor')) {
              deletedDraftId = binder._params[0] as number;
              return { meta: {} };
            }
            if (sql.trim().startsWith('INSERT INTO simuladores_guias_instrutor')) {
              return { meta: { last_row_id: 777 } };
            }
            return { meta: {} };
          },
        };
        return binder;
      },
      batch: vi.fn(async () => []),
    };

    const BUCKET = {
      async get() {
        return null;
      },
      async put(key: string) {
        putKeys.push(key);
        return {};
      },
      async delete(key: string) {
        deletedKeys.push(key);
        return undefined;
      },
    };

    const formData = new FormData();
    formData.set('versao', '2.0');
    formData.set('pdf', new File(['%PDF-1.4 fake'], 'guia.pdf', { type: 'application/pdf' }));

    const res = await app.request(
      '/api/simuladores/guias-instrutor/50/versoes',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer x', 'x-test-empresa-id': '6', 'x-test-guia-role': 'ADMIN' },
        body: formData,
      },
      { DB, BUCKET } as unknown as Env,
    );

    expect(res.status).toBe(500);
    expect(updateAttempted).toBe(true);
    expect(putKeys.length).toBeGreaterThan(0);
    // Todo objeto R2 que chegou a ser enviado é apagado na compensação.
    expect(deletedKeys).toEqual(putKeys);
    expect(deletedDraftId).toBe(777);
  });
});

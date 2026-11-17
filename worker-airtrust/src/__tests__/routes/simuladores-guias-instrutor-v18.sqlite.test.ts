/**
 * Testes SQLite reais das rotas /api/simuladores/guias-instrutor* sobre o schema V2 (0586):
 * - Novos programas V18 (TRANSICAO, REQUALIFICACAO, RECENTE, NOTURNO)
 * - Guias funcionais (INSTRUTOR / EXAMINADOR) com modelo_aeronave_id = null
 * - Rejeicao (400) para programa de aeronave sem modelo_aeronave_id
 * - Publicacao de versao, vinculo a modelo_sessao, ativacao/substituicao de guias funcionais
 * - Controle RBAC (403) e isolamento cross-tenant (404)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite';
import { errorHandler } from '../../middleware/error-handler';
import type { Env } from '../../types';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};
const root = join(process.cwd(), '..');
const sql0586 = readFileSync(
  join(root, 'worker-airtrust/schema-v2/changes/0586_simuladores_guias_instrutor_v18.sql'),
  'utf8',
);

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
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
    c.set('userRole', c.req.header('x-test-role') || 'gestor');
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: TestContext) => ({
      empresaId: Number(c.get('empresaId') || 6),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 6)}`,
      empresaNome: 'Costa do Sol',
      role: String(c.get('userRole') || 'gestor'),
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
  return {
    GUIAS_INSTRUTOR_CAPABILITIES: {
      visualizar: 'simuladores.guias.visualizar',
      gerenciar: 'simuladores.guias.gerenciar',
    },
    requireGuiaInstrutorRead: guard(READ, 'Acesso restrito a instrutores autorizados'),
    requireGuiaInstrutorManage: guard(MANAGE, 'Publicacao restrita a gestores/administradores'),
    hasGuiaInstrutorCapability: async (c: TestContext, capability: string) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      if (capability === 'simuladores.guias.gerenciar') return MANAGE.has(role);
      return READ.has(role);
    },
    resolveGuiaInstrutorPermissions: async (c: TestContext) => {
      const role = String(c.req.header('x-test-guia-role') || '').toUpperCase();
      return {
        podeVisualizar: READ.has(role),
        podeGerenciar: MANAGE.has(role),
        isPlatformAdmin: false,
      };
    },
  };
});

import guiasInstrutorRoutes from '../../routes/simuladores-guias-instrutor';
import { assertNoV2GuideDivergence } from '../../lib/guias-instrutor/legacy-v2-guard';

function createSqliteEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, operational_domain_rbac_enabled INTEGER DEFAULT 0);
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, usuario_id INTEGER, deleted_at TEXT);
    CREATE TABLE modelos_aeronave (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, codigo TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, deleted_at TEXT);
    CREATE TABLE modelos_sessao_versionamento (
      modelo_id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      is_current INTEGER NOT NULL, versao_matriz TEXT NOT NULL
    );
    CREATE TABLE simuladores (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
    CREATE TABLE simulador_agendamentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, template_id INTEGER, simulador_id INTEGER,
      data TEXT, hora_inicio TEXT, hora_fim TEXT, tipo_sessao TEXT, nome TEXT, instrutor_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE simuladores_guias_instrutor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      modelo_aeronave_id INTEGER NOT NULL REFERENCES modelos_aeronave(id),
      programa TEXT NOT NULL CHECK(programa IN ('INICIAL', 'PERIODICO', 'SEMESTRAL', 'CHECK')),
      ciclo INTEGER, sessao_numero INTEGER, sessao_total INTEGER,
      codigo TEXT NOT NULL, titulo TEXT NOT NULL, descricao TEXT, versao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RASCUNHO',
      html_r2_key TEXT, html_nome TEXT, html_mime_type TEXT, html_tamanho_bytes INTEGER, html_sha256 TEXT,
      html_status_validacao TEXT NOT NULL DEFAULT 'NAO_DISPONIVEL',
      pdf_r2_key TEXT, pdf_nome TEXT, pdf_mime_type TEXT, pdf_tamanho_bytes INTEGER, pdf_sha256 TEXT,
      substituido_por_id INTEGER REFERENCES simuladores_guias_instrutor(id),
      publicado_em TEXT, created_by INTEGER NOT NULL, updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE TABLE simuladores_modelos_sessao_guias (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      modelo_sessao_id INTEGER NOT NULL REFERENCES modelos_sessao(id),
      guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,
      principal INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE TABLE simuladores_guias_instrutor_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL, acao TEXT NOT NULL, valores_anteriores TEXT, valores_novos TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO empresas VALUES (6, 'Costa do Sol', 0), (7, 'Tenant Externo', 0);
    INSERT INTO usuarios VALUES (1, 'Gestor', 'g@cds.test');
    INSERT INTO modelos_aeronave VALUES (5, 'AW139', 'AW139', NULL), (6, 'SK76', 'SK76', NULL);
    INSERT INTO modelos_sessao VALUES
      (301, 'V18-A139-T1', 'AW139 - TRANSICAO - 01/04', 'Transicao V18', NULL),
      (302, 'V18-INST-E01', 'INSTRUTOR - E01/E02', 'Modulo E01 instrutor', NULL);
    INSERT INTO modelos_sessao_versionamento VALUES
      (301, 6, 1, 'PTO-REV10-V18'), (302, 6, 1, 'PTO-REV10-V18');
    INSERT INTO simuladores VALUES (10, 'FFS AW139');
    INSERT INTO simulador_agendamentos (id, empresa_id, template_id, simulador_id, data, hora_inicio, hora_fim, nome, deleted_at)
    VALUES (901, 6, 302, 10, '2026-12-01', '08:00', '10:00', 'Formacao Instrutor E01', NULL);
  `);
  db.exec(sql0586);

  const normalize = (v: unknown): SQLInputValue => (v === undefined ? null : v) as SQLInputValue;

  function wrapStatement(sql: string, params: SQLInputValue[] = []) {
    return {
      bind(...nextParams: unknown[]) {
        return wrapStatement(sql, nextParams.map(normalize));
      },
      async first<T = Record<string, unknown>>(): Promise<T | null> {
        const row = db.prepare(sql).get(...params);
        return (row as T | undefined) ?? null;
      },
      async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
        const rows = db.prepare(sql).all(...params);
        return { results: rows as T[] };
      },
      async run() {
        const info = db.prepare(sql).run(...params);
        return {
          success: true,
          meta: { last_row_id: Number(info.lastInsertRowid || 0), changes: Number(info.changes || 0) },
        };
      },
    };
  }

  const DB = {
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch(stmts: Array<ReturnType<typeof wrapStatement>>) {
      const results = [];
      for (const s of stmts) {
        results.push(await s.run());
      }
      return results;
    },
  };

  const r2 = new Map<string, { body: Uint8Array; type: string }>();
  const BUCKET = {
    async put(key: string, data: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data);
      r2.set(key, { body: bytes, type: opts?.httpMetadata?.contentType || 'application/octet-stream' });
      return {};
    },
    async get(key: string) {
      const entry = r2.get(key);
      if (!entry) return null;
      const bodyBytes = entry.body;
      return {
        body: new Blob([bodyBytes], { type: entry.type }).stream(),
        text: async () => new TextDecoder().decode(bodyBytes),
      };
    },
    async delete(key: string) {
      r2.delete(key);
    },
  };

  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/simuladores', guiasInstrutorRoutes);

  return { db, app, env: { DB, BUCKET } as unknown as Env };
}

describe('simuladores-guias-instrutor — PTO Rev.10 V18 (SQLite integration)', () => {
  let ctx: ReturnType<typeof createSqliteEnv>;

  beforeEach(() => {
    ctx = createSqliteEnv();
  });

  const gestorHeaders = (empresaId = 6) => ({
    Authorization: 'Bearer test',
    'x-test-empresa-id': String(empresaId),
    'x-test-guia-role': 'GESTOR',
  });

  const instrutorHeaders = (empresaId = 6) => ({
    Authorization: 'Bearer test',
    'x-test-empresa-id': String(empresaId),
    'x-test-guia-role': 'INSTRUTOR',
  });

  it('biblioteca do instrutor prioriza somente modelos correntes, mas o acervo administrativo preserva os legados', async () => {
    ctx.db.exec(`
      INSERT INTO modelos_sessao VALUES (303, 'LEGACY-A139-P', 'AW139 legado', 'Histórico', NULL);
      INSERT INTO modelos_sessao_versionamento VALUES (303, 6, 0, 'LEGACY');
      INSERT INTO simuladores_guias_instrutor_v2
        (id, empresa_id, modelo_aeronave_id, programa, codigo, titulo, versao, status, created_by)
      VALUES
        (501, 6, 5, 'PERIODICO', 'A139-P-LEGACY', 'Guia histórico', '1.0', 'ATIVO', 1),
        (502, 6, 5, 'PERIODICO', 'A139-P-V18', 'Guia atual', '1.0', 'ATIVO', 1);
      INSERT INTO simuladores_modelos_sessao_guias_v2
        (empresa_id, modelo_sessao_id, guia_id, principal)
      VALUES (6,303,501,1), (6,301,502,1);
    `);

    const instructor = await ctx.app.request(
      '/api/simuladores/guias-instrutor?aeronave=AW139',
      { headers: instrutorHeaders(6) }, ctx.env,
    );
    expect(instructor.status).toBe(200);
    const visible = (await instructor.json()) as { data: Array<{ id: number }> };
    expect(visible.data.map((guide) => guide.id)).toEqual([502]);

    const admin = await ctx.app.request(
      '/api/simuladores/guias-instrutor?admin=1&aeronave=AW139',
      { headers: gestorHeaders(6) }, ctx.env,
    );
    expect(admin.status).toBe(200);
    const archive = (await admin.json()) as { data: Array<{ id: number }> };
    expect(archive.data.map((guide) => guide.id).sort()).toEqual([501, 502]);
  });

  it('cria guias para novos programas de aeronave V18 e rejeita modelo_aeronave_id nulo fora de funcional', async () => {
    for (const programa of ['TRANSICAO', 'REQUALIFICACAO', 'RECENTE', 'NOTURNO']) {
      const ok = await ctx.app.request(
        '/api/simuladores/guias-instrutor',
        {
          method: 'POST',
          headers: { ...gestorHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelo_aeronave_id: 5,
            programa,
            sessao_numero: 1,
            sessao_total: 4,
            codigo: `A139-${programa}-01/04`,
            titulo: `Guia ${programa}`,
            versao: '1.0',
          }),
        },
        ctx.env,
      );
      expect(ok.status).toBe(201);
    }

    const bad = await ctx.app.request(
      '/api/simuladores/guias-instrutor',
      {
        method: 'POST',
        headers: { ...gestorHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelo_aeronave_id: null,
          programa: 'TRANSICAO',
          codigo: 'BAD-T1',
          titulo: 'Sem aeronave',
          versao: '1.0',
        }),
      },
      ctx.env,
    );
    expect(bad.status).toBe(400);
  });

  it('suporta ciclo completo de guia funcional (modelo_aeronave_id = null), substituicao e isolamento cross-tenant', async () => {
    // 1. Cria rascunho funcional INSTRUTOR com modelo_aeronave_id = null
    const createRes = await ctx.app.request(
      '/api/simuladores/guias-instrutor',
      {
        method: 'POST',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelo_aeronave_id: null,
          programa: 'INSTRUTOR',
          sessao_numero: 1,
          sessao_total: 2,
          codigo: 'INST-E01/E02',
          titulo: 'Formacao de Instrutores — Etapa 01',
          versao: '1.0',
        }),
      },
      ctx.env,
    );
    expect(createRes.status).toBe(201);
    const { data: created } = (await createRes.json()) as { data: { id: number } };

    // 2. Sobe PDF + HTML v1.0
    const fd1 = new FormData();
    fd1.append('versao', '1.0');
    fd1.append('pdf', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'inst-e01.pdf', { type: 'application/pdf' }));
    fd1.append('html', new File(['<html><body><h1>INST-E01 v1.0</h1></body></html>'], 'index.html', { type: 'text/html' }));

    const ver1Res = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${created.id}/versoes`,
      { method: 'POST', headers: gestorHeaders(6), body: fd1 },
      ctx.env,
    );
    expect(ver1Res.status).toBe(201);
    const { data: v1 } = (await ver1Res.json()) as { data: { id: number } };

    // 3. Vincula ao modelo_sessao funcional 302 e ativa
    const linkRes = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v1.id}`,
      {
        method: 'PUT',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_sessao_id: 302, principal: 1 }),
      },
      ctx.env,
    );
    expect(linkRes.status).toBe(200);

    const activateV1 = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v1.id}/ativar`,
      { method: 'POST', headers: gestorHeaders(6) },
      ctx.env,
    );
    expect(activateV1.status).toBe(200);

    // 4. Sobe v2.0, vincula e ativa -> v1 deve virar SUBSTITUIDO mesmo com modelo_aeronave_id NULL
    const fd2 = new FormData();
    fd2.append('versao', '2.0');
    fd2.append('pdf', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'inst-e01-v2.pdf', { type: 'application/pdf' }));
    fd2.append('html', new File(['<html><body><h1>INST-E01 v2.0</h1></body></html>'], 'index.html', { type: 'text/html' }));
    const ver2Res = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v1.id}/versoes`,
      { method: 'POST', headers: gestorHeaders(6), body: fd2 },
      ctx.env,
    );
    expect(ver2Res.status).toBe(201);
    const { data: v2 } = (await ver2Res.json()) as { data: { id: number } };

    await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v2.id}`,
      {
        method: 'PUT',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_sessao_id: 302, principal: 1 }),
      },
      ctx.env,
    );
    const activateV2 = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v2.id}/ativar`,
      { method: 'POST', headers: gestorHeaders(6) },
      ctx.env,
    );
    expect(activateV2.status).toBe(200);

    const versionsRes = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v2.id}/versoes`,
      { headers: gestorHeaders(6) },
      ctx.env,
    );
    expect(versionsRes.status).toBe(200);
    const versionsBody = (await versionsRes.json()) as { data: Array<{ id: number; status: string }> };
    const statusById = Object.fromEntries(versionsBody.data.map((r) => [r.id, r.status]));
    expect(statusById[v1.id]).toBe('SUBSTITUIDO');
    expect(statusById[v2.id]).toBe('ATIVO');

    // 5. Listagem filtrada por aeronave=FUNCIONAL e lookup pela sessao agendada 901 retornam v2
    const listFunc = await ctx.app.request(
      '/api/simuladores/guias-instrutor?aeronave=FUNCIONAL',
      { headers: instrutorHeaders(6) },
      ctx.env,
    );
    expect(listFunc.status).toBe(200);
    const listData = (await listFunc.json()) as {
      data: Array<{ id: number; aeronave_codigo: string; aeronave_nome: string }>;
    };
    expect(listData.data).toHaveLength(1);
    expect(listData.data[0]).toMatchObject({
      id: v2.id,
      aeronave_codigo: 'FUNCIONAL',
      aeronave_nome: 'Funcional (INST/EXA)',
    });

    const sessaoGuia = await ctx.app.request(
      '/api/simuladores/sessoes/901/guias-instrutor',
      { headers: instrutorHeaders(6) },
      ctx.env,
    );
    expect(sessaoGuia.status).toBe(200);
    const sessaoData = (await sessaoGuia.json()) as { data: { id: number; aeronave_codigo: string } | null };
    expect(sessaoData.data).toMatchObject({ id: v2.id, aeronave_codigo: 'FUNCIONAL' });

    // 6. Negativos: RBAC 403 e cross-tenant 404
    const alunoForbidden = await ctx.app.request(
      '/api/simuladores/guias-instrutor?aeronave=FUNCIONAL',
      { headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '6', 'x-test-guia-role': 'ALUNO' } },
      ctx.env,
    );
    expect(alunoForbidden.status).toBe(403);

    const otherTenantDetail = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${v2.id}`,
      { headers: instrutorHeaders(7) },
      ctx.env,
    );
    expect(otherTenantDetail.status).toBe(404);
  });

  it('mantém guia funcional visível na biblioteca FUNCIONAL mesmo se modelo_aeronave_id vier preenchido via API', async () => {
    const createRes = await ctx.app.request(
      '/api/simuladores/guias-instrutor',
      {
        method: 'POST',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelo_aeronave_id: 5,
          programa: 'EXAMINADOR',
          sessao_numero: 1,
          sessao_total: 4,
          codigo: 'EXA-01/04',
          titulo: 'Examinador Etapa 01',
          versao: '1.0',
        }),
      },
      ctx.env,
    );
    expect(createRes.status).toBe(201);
    const { data: created } = (await createRes.json()) as { data: { id: number } };

    const fd = new FormData();
    fd.append('versao', '1.0');
    fd.append('pdf', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'exa.pdf', { type: 'application/pdf' }));
    const verRes = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${created.id}/versoes`,
      { method: 'POST', headers: gestorHeaders(6), body: fd },
      ctx.env,
    );
    expect(verRes.status).toBe(201);
    const { data: ver } = (await verRes.json()) as { data: { id: number } };

    const linkRes = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${ver.id}`,
      {
        method: 'PUT',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_sessao_id: 302, principal: 1 }),
      },
      ctx.env,
    );
    expect(linkRes.status).toBe(200);

    const actRes = await ctx.app.request(
      `/api/simuladores/guias-instrutor/${ver.id}/ativar`,
      { method: 'POST', headers: gestorHeaders(6) },
      ctx.env,
    );
    expect(actRes.status).toBe(200);

    const listFunc = await ctx.app.request(
      '/api/simuladores/guias-instrutor?aeronave=FUNCIONAL',
      { headers: instrutorHeaders(6) },
      ctx.env,
    );
    expect(listFunc.status).toBe(200);
    const body = (await listFunc.json()) as { data: Array<{ id: number; codigo: string }> };
    expect(body.data.some((g) => g.id === ver.id && g.codigo === 'EXA-01/04')).toBe(true);
  });

  it('relink legado propaga vínculo para a API _v2 antes da divergência e bloqueia fail-closed após criação de guia V18', async () => {
    // 1. Estado pré-divergência: insere guia legado + vínculo em 301 e aplica 0586 novamente (ou re-executa) via trigger
    ctx.db.exec(`
      INSERT INTO simuladores_guias_instrutor
        (id, empresa_id, modelo_aeronave_id, programa, sessao_numero, sessao_total, codigo, titulo, versao, status, created_by)
      VALUES (1, 6, 5, 'INICIAL', 1, 12, 'A139-I-01/12', 'Guia Legado 1', '1.0', 'ATIVO', 1);
      INSERT INTO simuladores_modelos_sessao_guias
        (id, empresa_id, modelo_sessao_id, guia_id, principal, ordem)
      VALUES (10, 6, 301, 1, 1, 1);
    `);

    // Estado sincronizado: guard não bloqueia antes de guias _v2 divergentes
    await expect(
      assertNoV2GuideDivergence(ctx.env.DB, 6, (m) => {
        throw new Error(m);
      }),
    ).resolves.toBeUndefined();

    // Relink atualiza simuladores_modelos_sessao_guias (desativa 301, insere vínculo em 302)
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        "UPDATE simuladores_modelos_sessao_guias SET deleted_at = '2026-11-14T22:10:00Z' WHERE id = 10",
      ),
      ctx.env.DB.prepare(
        'INSERT INTO simuladores_modelos_sessao_guias (id, empresa_id, modelo_sessao_id, guia_id, principal, ordem) VALUES (11, 6, 302, 1, 1, 1)',
      ),
    ]);

    // API principal (leitura _v2) deve enxergar imediatamente o novo modelo_sessao_id=302
    const afterRelink = await ctx.app.request(
      '/api/simuladores/guias-instrutor?aeronave=AW139',
      { headers: instrutorHeaders(6) },
      ctx.env,
    );
    expect(afterRelink.status).toBe(200);
    const listBody = (await afterRelink.json()) as { data: Array<{ id: number; modelo_sessao_id: number | null }> };
    expect(listBody.data.find((g) => g.id === 1)?.modelo_sessao_id).toBe(302);

    // 2. Após criar guia V18 em _v2, o executor legado deve falhar fechado
    const createV18 = await ctx.app.request(
      '/api/simuladores/guias-instrutor',
      {
        method: 'POST',
        headers: { ...gestorHeaders(6), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelo_aeronave_id: 5,
          programa: 'TRANSICAO',
          sessao_numero: 1,
          sessao_total: 9,
          codigo: 'A139-T-01/09',
          titulo: 'Transicao V18',
          versao: '1.0',
        }),
      },
      ctx.env,
    );
    expect(createV18.status).toBe(201);

    await expect(
      assertNoV2GuideDivergence(ctx.env.DB, 6, (m) => {
        throw new Error(m);
      }),
    ).rejects.toThrow(/Executor legado bloqueado/i);
  });
});

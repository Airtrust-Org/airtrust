import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', String(c.env?.__mockRole ?? 'admin'));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.includes(role)) return c.json({ success: false, error: 'forbidden' }, 403);
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.env?.__mockEmpresaId ?? 6) }),
}));

import executorRoutes from '../../routes/admin-simuladores-matriz-executor';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/x', executorRoutes);
  return app;
}

type Row = Record<string, unknown>;

function createFakeD1(options: {
  empresas?: number[];
  migrationsPresent?: boolean;
  manobras?: Row[];
  resolutionRows?: Row[];
  versionamentoRows?: Row[];
  importRows?: Row[];
  links?: Row[];
  captureBatch?: (statements: string[]) => void;
  postApplyResolutionCount?: number;
}) {
  const {
    empresas = [6],
    migrationsPresent = true,
    manobras = [],
    resolutionRows = [],
    versionamentoRows = [],
    importRows = [],
    links = [],
    captureBatch,
    postApplyResolutionCount,
  } = options;
  let batchCalled = false;

  function respond(sql: string, args: unknown[]) {
    if (sql.includes('sqlite_master')) {
      return migrationsPresent
        ? [{ name: 'modelos_sessao_versionamento' }, { name: 'simuladores_matriz_manobra_resolution' }]
        : [];
    }
    if (sql.includes('FROM empresas')) {
      const id = Number(args[0]);
      return empresas.includes(id) ? [{ id }] : [];
    }
    if (sql.includes('FROM simuladores_matriz_imports WHERE uuid=')) {
      const uuid = args[0];
      return importRows.filter((r) => r.uuid === uuid);
    }
    if (sql.includes('modelos_sessao_versionamento') && sql.includes('is_current=1') && sql.includes('ORDER BY codigo_canonico')) {
      return versionamentoRows.filter((r) => r.is_current === 1);
    }
    if (sql.startsWith('SELECT id, codigo, empresa_id FROM manobras') && sql.includes('deleted_at IS NULL')) {
      return manobras.filter((r) => !r.deleted_at);
    }
    if (sql.includes('FROM modelos_sessao_manobras msm')) {
      return links;
    }
    if (sql.includes('SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1`') || sql.startsWith('SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=?1')) {
      return [{ c: versionamentoRows.length }];
    }
    if (sql.startsWith('SELECT id FROM manobras WHERE id=?1')) {
      const [id, empresaId] = args;
      return manobras.filter((r) => r.id === id && r.empresa_id === empresaId && !r.deleted_at);
    }
    if (sql.startsWith('SELECT codigo_canonico, manobra_id, resolution_type, source_hash FROM simuladores_matriz_manobra_resolution')) {
      return resolutionRows;
    }
    if (sql.startsWith('SELECT id, codigo, empresa_id, nome, categoria, tipo_aeronave, descricao FROM manobras')) {
      return manobras;
    }
    if (sql.startsWith('SELECT codigo_canonico, modelo_id, versao_numero FROM modelos_sessao_versionamento')) {
      return versionamentoRows;
    }
    if (sql.includes('HAVING c<>1')) {
      return [];
    }
    if (sql.startsWith('SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=?1 AND versao_matriz=?2')) {
      return [{ c: batchCalled && postApplyResolutionCount != null ? postApplyResolutionCount : resolutionRows.length }];
    }
    if (sql.includes('m.empresa_id<>?1')) {
      return [];
    }
    return [];
  }

  const db = {
    prepare(sql: string) {
      let boundArgs: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return stmt;
        },
        async all() {
          return { results: respond(sql, boundArgs) };
        },
        async run() {
          return { success: true };
        },
        _sql: sql,
      };
      return stmt;
    },
    async batch(stmts: Array<{ _sql: string }>) {
      batchCalled = true;
      captureBatch?.(stmts.map((s) => s._sql));
      return stmts.map(() => ({ success: true }));
    },
  };
  return db as unknown as D1Database;
}

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENABLE_SIMULADORES_MATRIZ_EXECUTOR: 'true',
    __mockEmpresaId: 6,
    ...overrides,
  } as unknown as Env;
}

describe('admin-simuladores-matriz-executor: gating', () => {
  it('refuses when the executor is not explicitly enabled', async () => {
    const app = buildApp();
    const db = createFakeD1({});
    const env = baseEnv({ ENABLE_SIMULADORES_MATRIZ_EXECUTOR: undefined, DB: db });
    const res = await app.request('/x/dry-run', { method: 'POST', body: JSON.stringify({ plan: {}, import_uuid: 'u1' }) }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/desabilitado/);
  });

  it('refuses a non-admin role', async () => {
    const app = buildApp();
    const db = createFakeD1({});
    const env = baseEnv({ __mockRole: 'manager', DB: db });
    const res = await app.request('/x/dry-run', { method: 'POST', body: '{}' }, env);
    expect(res.status).toBe(403);
  });

  it('refuses a tenant other than empresa_id 6', async () => {
    const app = buildApp();
    const db = createFakeD1({ empresas: [6, 8] });
    const env = baseEnv({ __mockEmpresaId: 8, DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ plan: { empresa_id: 8 }, import_uuid: 'u1' }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.error).toMatch(/não autorizado/);
  });

  it('rejects a plan whose empresa_id does not match the tenant context', async () => {
    const app = buildApp();
    const db = createFakeD1({});
    const env = baseEnv({ DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ plan: { empresa_id: 7 }, import_uuid: 'u1' }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.error).toMatch(/tenant do plano diverge/);
  });

  it('fails closed when migration 0440/0441 tables are absent', async () => {
    const app = buildApp();
    const db = createFakeD1({ migrationsPresent: false });
    const env = baseEnv({ DB: db });
    const res = await app.request(
      '/x/dry-run',
      { method: 'POST', body: JSON.stringify({ plan: { empresa_id: 6 }, import_uuid: 'u1' }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body.error).toMatch(/migration 044[01]/);
  });

  it('rejects a resolution reused by an existing_manobra_id belonging to another tenant', async () => {
    const app = buildApp();
    const db = createFakeD1({});
    const env = baseEnv({ DB: db });
    const plan = {
      empresa_id: 6,
      schema_version: 4,
      plan_sha256: 'irrelevant-for-this-gate',
      source_hashes: {},
      totals: { modelos: 51, vinculos: 918, loft: 22 },
      matrices: { AW139: { models: [], items: [] }, SK76: { models: [], items: [] } },
      manobra_resolution: [
        {
          codigo_canonico: 'A-1',
          resolution_type: 'EXACT_UNIQUE',
          existing_manobra_id: 999,
          create_payload: null,
          source_hash: 'x'.repeat(64),
        },
      ],
    };
    const res = await app.request('/x/dry-run', { method: 'POST', body: JSON.stringify({ plan, import_uuid: 'u1' }) }, env);
    expect(res.status).toBe(400);
  });
});

describe('admin-simuladores-matriz-executor: happy path', () => {
  it('validates a real 51/918/22 plan and executes exactly one atomic db.batch()', async () => {
    const { createDeterministicPlan, sha256, EXPECTED_SOURCE_HASH_COUNT } = await import(
      '../../../scripts/lib/matriz-import-plan.mjs'
    );
    const { buildManoeuvreResolutionEntries } = await import('../../../scripts/lib/matriz-manobra-resolution.mjs');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const contract = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data/simuladores-matriz/session-contract-51.json'), 'utf8'),
    );

    function item(codigo: string, modelo: string, ordem: number) {
      return {
        modelo,
        ordem,
        codigo,
        nome: `nome-${codigo}`,
        execucao_pf: 'AB',
        categoria: 'PROCEDIMENTO',
        fase_voo: 'VOO',
        tipo_conteudo: 'NORMAL',
        cenario: null,
        configuracao_ios: null,
        desempenho_esperado: null,
        foco_instrutor: null,
        como_observar: null,
        referencia_tecnica: null,
        rastreabilidade_interna: null,
        criterios: { '1-2': null, '3-5': null, '6-8': null, '9-10': null },
      };
    }
    function toMatrix(sessions: any[]) {
      const models = sessions.map((s) => ({
        codigo: s.codigo_canonico,
        programa: s.programa,
        ciclo: s.ciclo === '—' ? null : s.ciclo,
        titulo: s.titulo_sanitizado,
        aeronave: s.aeronave,
        tipo_qualificacao_estruturado: s.tipo_qualificacao_estruturado,
      }));
      let counter = 0;
      const items = models.flatMap((model) =>
        Array.from({ length: 18 }, (_, i) => item(`MAN-${(counter++ % 301) + 1}`, model.codigo, i + 1)),
      );
      return { models, items };
    }
    const aw139 = toMatrix(contract.sessions.filter((s: any) => s.aeronave === 'AW139'));
    const sk76 = toMatrix(contract.sessions.filter((s: any) => s.aeronave === 'SK76'));
    const manobraResolution = buildManoeuvreResolutionEntries({
      empresaId: 6,
      items: [...aw139.items, ...sk76.items],
      tenantManobras: [],
    });
    const sourceHashes = Object.fromEntries(
      Array.from({ length: EXPECTED_SOURCE_HASH_COUNT }, (_, i) => [`h-${i}`, sha256(`v-${i}`)]),
    );
    const plan = createDeterministicPlan({
      empresaId: 6,
      sourceHashes,
      aw139,
      sk76,
      loft: 22,
      manobraResolution,
    });

    let capturedStatements: string[] = [];
    const db = createFakeD1({
      migrationsPresent: true,
      empresas: [6],
      postApplyResolutionCount: 301,
      captureBatch: (statements) => {
        capturedStatements = statements;
      },
    });
    const env = baseEnv({ DB: db });
    const app = buildApp();

    const res = await app.request(
      '/x/apply',
      { method: 'POST', body: JSON.stringify({ plan, import_uuid: 'happy-path-1' }) },
      env,
    );
    const body = (await res.json()) as { success: boolean; error?: string };
    expect(body).toMatchObject({ success: true, status: 'APPLIED' });
    expect(res.status).toBe(200);
    expect(capturedStatements.length).toBeGreaterThan(0);
    expect(capturedStatements.some((s) => s.includes('INSERT INTO simuladores_matriz_imports'))).toBe(true);
    expect(capturedStatements.some((s) => s.includes('INSERT INTO manobras'))).toBe(true);
    expect(capturedStatements.some((s) => s.includes('INSERT INTO modelos_sessao_versionamento'))).toBe(true);
  });
});

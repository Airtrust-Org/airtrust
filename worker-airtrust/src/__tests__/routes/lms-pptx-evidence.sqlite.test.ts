import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { readFileSync } from 'node:fs';
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (location:string): DatabaseSyncType };
import type { Env } from '../../types';

const mockScope = vi.hoisted(() => ({ empresaId: 6, funcionarioId: 60 }));
vi.mock('../../utils/tenant-resolution', () => ({
  getEmpresaIdSafe: () => mockScope.empresaId,
}));
vi.mock('../../services/lms-learner-identity', () => ({
  resolveLmsFuncionarioId: vi.fn(async () => mockScope.funcionarioId),
}));

import { registerPptxEvidenceRoutes } from '../../routes/lms-pptx-evidence';
import { isPptxCompletionEvidenceReady } from '../../services/lms-pptx-evidence';

const change = readFileSync(
  fileURLToPath(new NodeURL('../../../schema-v2/changes/0574_lms_pptx_slide_evidence.sql', import.meta.url)), 'utf8',
);

class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');
  constructor() {
    this.sqlite.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER);
      CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,publicado INTEGER,
        tipo_conteudo TEXT,gerar_qualificacao_ao_concluir INTEGER,pptx_slide_count INTEGER,
        pptx_r2_key TEXT,deleted_at TEXT);
      CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,
        curso_id INTEGER,status TEXT,deleted_at TEXT);
      CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,
        matricula_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT);
      INSERT INTO funcionarios VALUES (60,6),(70,7);
      INSERT INTO lms_cursos VALUES (22,6,1,1,'pptx',1,3,'key-a',NULL),
        (23,7,1,1,'pptx',1,3,'key-b',NULL);
      INSERT INTO lms_matriculas VALUES (200,6,60,22,'EM_ANDAMENTO',NULL),
        (201,7,70,23,'EM_ANDAMENTO',NULL);
      INSERT INTO lms_matricula_ciclos VALUES (500,6,200,22,60,1,NULL),
        (501,7,201,23,70,1,NULL);
    `);
    this.sqlite.exec(change);
  }
  prepare(sql: string) {
    const database = this.sqlite;
    const wrap = (args: Array<string | number | null>) => ({
      first: async () => database.prepare(sql).get(...args) || null,
      all: async () => ({ results: database.prepare(sql).all(...args), success: true }),
      run: async () => {
        const result = database.prepare(sql).run(...args);
        return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
      },
    });
    return { bind: (...args: Array<string | number | null>) => wrap(args), ...wrap([]) };
  }
  asD1() { return this as unknown as D1Database; }
  close() { this.sqlite.close(); }
}
const etag = { value: 'asset-a' };
const bucket = { head: vi.fn(async () => ({ etag: etag.value })) } as unknown as R2Bucket;

function createApp(db: SqliteD1) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const e = error as { statusCode?: number; code?: string };
    return c.json({ success: false, code: e.code || 'UNEXPECTED' }, (e.statusCode || 500) as 400);
  });
  registerPptxEvidenceRoutes(app);
  return {
    request: (url: string, init?: RequestInit) => app.request(
      url, init, { DB: db.asD1(), BUCKET: bucket } as unknown as Env,
    ),
  };
}

describe('PPTX server evidence route (real SQLite, tenant and cycle boundary)', () => {
  let database: SqliteD1;
  beforeEach(() => {
    database = new SqliteD1();
    mockScope.empresaId = 6;
    mockScope.funcionarioId = 60;
    etag.value = 'asset-a';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  });
  afterEach(() => {
    database.close();
    vi.useRealTimers();
  });

  it('allows ordered slide observations, idempotent replay, resuming and final evidence', async () => {
    const app = createApp(database);
    const get = async () => (await app.request('/200/pptx-evidence')).json() as any;
    const post = async (i: number) => app.request('/200/pptx-evidence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide_index: i, asset_etag: etag.value }),
    });
    expect((await get()).data.next_slide).toBe(0);
    expect(await isPptxCompletionEvidenceReady(database.asD1(), bucket, 6, 200)).toBe(false);
    expect((await post(1)).status).toBe(409);
    expect((await post(0)).status).toBe(200);
    expect((await (await post(0)).json() as any).replay).toBe(true);
    expect((await post(1)).status).toBe(409);
    vi.setSystemTime(new Date('2026-11-05T10:00:02Z'));
    expect((await post(1)).status).toBe(200);
    vi.setSystemTime(new Date('2026-11-05T10:00:04Z'));
    expect((await post(2)).status).toBe(200);
    expect((await get()).data).toMatchObject({
      next_slide: 3, ready_to_finalize: true, visited_indexes: [0, 1, 2],
    });
    expect(await isPptxCompletionEvidenceReady(database.asD1(), bucket, 6, 200)).toBe(true);
  });

  it('rejects observations from a stale open tab after replacing R2 asset with the same slide count', async () => {
    const app = createApp(database);
    const post = (slide: number, loadedEtag: string) => app.request('/200/pptx-evidence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide_index: slide, asset_etag: loadedEtag }),
    });
    expect((await post(0, 'asset-a')).status).toBe(200);
    etag.value = 'asset-b';
    vi.setSystemTime(new Date('2026-11-05T10:00:03Z'));
    const stale = await post(1, 'asset-a');
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ code: 'PPTX_ASSET_VERSION_MISMATCH' });
    expect(await isPptxCompletionEvidenceReady(database.asD1(), bucket, 6, 200)).toBe(false);
    const freshState = await (await app.request('/200/pptx-evidence')).json() as any;
    expect(freshState.data).toMatchObject({ next_slide: 0, ready_to_finalize: false, asset_etag: 'asset-b' });
    expect((await post(0, 'asset-b')).status).toBe(200);
    const restarted = await (await app.request('/200/pptx-evidence')).json() as any;
    expect(restarted.data.visited_indexes).toEqual([0]);
    expect(await isPptxCompletionEvidenceReady(database.asD1(), bucket, 6, 200)).toBe(false);
  });

  it('cannot record as another employee, tenant or cancelled enrollment', async () => {
    const app = createApp(database);
    const post = () => app.request('/200/pptx-evidence', {
      method:'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide_index: 0, asset_etag: etag.value }),
    });
    mockScope.funcionarioId = 70;
    expect((await post()).status).toBe(403);
    mockScope.funcionarioId = 60;
    mockScope.empresaId = 7;
    expect((await post()).status).toBe(404);
    mockScope.empresaId = 6;
    database.sqlite.exec("UPDATE lms_matriculas SET status='CANCELADO' WHERE id=200");
    expect((await post()).status).toBe(409);
  });

  it('invalidates completed coverage after asset version or active cycle changes', async () => {
    const app = createApp(database);
    const post = async (i: number) => app.request('/200/pptx-evidence',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({slide_index:i,asset_etag:etag.value}),
    });
    await post(0);
    vi.setSystemTime(new Date('2026-11-05T10:00:02Z'));
    await post(1);
    vi.setSystemTime(new Date('2026-11-05T10:00:04Z'));
    await post(2);
    expect(await isPptxCompletionEvidenceReady(database.asD1(),bucket,6,200)).toBe(true);
    etag.value='asset-b';
    expect(await isPptxCompletionEvidenceReady(database.asD1(),bucket,6,200)).toBe(false);
    etag.value='asset-a';
    database.sqlite.exec(`UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=500;
       INSERT INTO lms_matricula_ciclos VALUES(502,6,200,22,60,1,NULL);`);
    expect(await isPptxCompletionEvidenceReady(database.asD1(),bucket,6,200)).toBe(false);
  });
});

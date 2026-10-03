import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'worker-airtrust/migrations/0527_training_compliance_loft_bootstrap.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0527_training_compliance_loft_bootstrap.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-loft-bootstrap-0527.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-loft-bootstrap-0527.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase(loft: 'absent' | 'soft-deleted' | 'active') {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-loft-bootstrap-0527-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(execSql(db, `
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL COLLATE NOCASE,
      nome TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      validade INTEGER,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      empresa_id INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_qt_tenant_code_active
      ON qualificacoes_tipos(empresa_id,codigo COLLATE NOCASE)
      WHERE deleted_at IS NULL;
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_id INTEGER, observacoes TEXT
    );
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER
    );
    CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,validade,ativo,empresa_id,deleted_at)
      VALUES (700,'LOFT','Outro tenant LOFT','Treinamento',18,1,7,NULL);
  `).code).toBe(0);
  if (loft === 'soft-deleted') {
    expect(execSql(db, `
      INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,validade,ativo,empresa_id,deleted_at)
      VALUES (12,'LOFT','LOFT histórico','Treinamento',12,0,6,'2026-09-30');
      INSERT INTO qualificacoes_historico(id,empresa_id,qualificacao_id,observacoes)
      VALUES (900,6,12,'preserve identity');
    `).code).toBe(0);
  } else if (loft === 'active') {
    expect(execSql(db, `
      INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,validade,ativo,empresa_id,deleted_at)
      VALUES (13,'LOFT','LOFT atual','Treinamento',24,1,6,NULL);
    `).code).toBe(0);
  }
  return db;
}

describe('0527 training compliance LOFT bootstrap', () => {
  it('pins the reviewed Schema V2 hashes and mirrors the canonical migration', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-loft-bootstrap-0527',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('creates one tenant-6 LOFT model when the environment has none and is idempotent', () => {
    const db = createDatabase('absent');
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);
    expect(querySql<{ total:number; validade:number }>(db,
      `SELECT COUNT(*) total, MAX(validade) validade FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL;`)[0])
      .toEqual({ total:1, validade:12 });
    expect(querySql<{ validade:number }>(db,
      `SELECT validade FROM qualificacoes_tipos WHERE id=700;`)[0].validade).toBe(18);
  });

  it('reactivates the existing historical LOFT identity instead of replacing it', () => {
    const db = createDatabase('soft-deleted');
    expect(execSql(db, migration).code).toBe(0);
    const loft = querySql<{ id:number; ativo:number; deleted_at:string|null }>(db,
      `SELECT id,ativo,deleted_at FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;`)[0];
    expect(loft).toEqual({ id:12, ativo:1, deleted_at:null });
    expect(querySql<{ qualificacao_id:number }>(db,
      `SELECT qualificacao_id FROM qualificacoes_historico WHERE id=900;`)[0].qualificacao_id).toBe(12);
  });

  it('preserves an existing active LOFT validity and contains no forbidden evidence writes', () => {
    const db = createDatabase('active');
    expect(execSql(db, migration).code).toBe(0);
    expect(querySql<{ id:number; validade:number }>(db,
      `SELECT id,validade FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL;`)[0])
      .toEqual({ id:13, validade:24 });
    const normalized = migration.toLowerCase();
    for (const forbidden of [
      'insert into qualificacoes_historico','update qualificacoes_historico','delete from qualificacoes_historico',
      'insert into treinamento_requisitos','update treinamento_requisitos','delete from treinamento_requisitos',
      'insert into lms_matriculas','update lms_matriculas','delete from lms_matriculas',
      'insert into certificados','delete from certificados',
    ]) expect(normalized).not.toContain(forbidden);
  });
});

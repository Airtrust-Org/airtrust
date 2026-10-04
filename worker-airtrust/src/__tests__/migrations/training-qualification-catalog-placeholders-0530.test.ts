import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'worker-airtrust/migrations/0530_training_qualification_catalog_placeholders.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0530_training_qualification_catalog_placeholders.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-qualification-catalog-placeholders-0530.md';
const manifestPath = 'worker-airtrust/schema-v2/training-qualification-catalog-placeholders-0530.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const CODES = [
  'REGRAS_OURO_PETROBRAS',
  'JUST_CULTURE',
  'STOP_WORK',
  'ETICA_CONDUTA',
  'LGPD_SEG_INFO',
];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-qualification-catalog-0530-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(execSql(db, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    INSERT INTO empresas(id) VALUES (6),(7);
    CREATE TABLE qualificacoes_categorias (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    INSERT INTO qualificacoes_categorias(id,empresa_id,codigo,nome,ativo,deleted_at) VALUES
      (601,6,'EAD','EAD',1,NULL),(701,7,'EAD','EAD',1,NULL);
    CREATE TABLE qualificacoes_areas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    INSERT INTO qualificacoes_areas(id,empresa_id,codigo,nome,ativo,deleted_at) VALUES
      (610,6,'QSMS','QSMS',1,NULL),
      (611,6,'SEGURANCA_OPERACIONAL','Segurança Operacional',1,NULL),
      (710,7,'QSMS','QSMS',1,NULL);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL COLLATE NOCASE,
      nome TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      categoria_id INTEGER,
      validade INTEGER,
      carga_horaria REAL,
      area_id INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      is_check INTEGER NOT NULL DEFAULT 0,
      observacoes TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_qt_tenant_code_active
      ON qualificacoes_tipos(empresa_id,codigo COLLATE NOCASE)
      WHERE deleted_at IS NULL;
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER
    );
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_id INTEGER
    );
    INSERT INTO qualificacoes_tipos(
      empresa_id,codigo,nome,categoria,categoria_id,ativo,is_check,created_at,updated_at
    ) VALUES (7,'JUST_CULTURE','Outro tenant','EAD',701,1,0,datetime('now'),datetime('now'));
  `).code).toBe(0);
  return db;
}

describe('0530 training qualification catalog placeholders', () => {
  it('pins reviewed manifest hashes and mirrors canonical migration', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-qualification-catalog-placeholders-0530',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('creates exactly the five tenant-6 qualification models and is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);
    const rows = querySql<{ codigo:string; categoria_id:number; validade:number|null; carga_horaria:number|null }>(
      db,
      `SELECT codigo,categoria_id,validade,carga_horaria
         FROM qualificacoes_tipos
        WHERE empresa_id=6 AND deleted_at IS NULL
        ORDER BY codigo;`,
    );
    expect(rows.map((row) => row.codigo).sort()).toEqual([...CODES].sort());
    expect(rows.every((row) => row.categoria_id === 601)).toBe(true);
    expect(rows.every((row) => row.validade === null)).toBe(true);
    expect(rows.every((row) => row.carga_horaria === null)).toBe(true);
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM qualificacoes_tipos WHERE empresa_id=7 AND UPPER(codigo)='JUST_CULTURE';`)[0].total).toBe(1);
  });

  it('assigns only deterministic qualification areas', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    const rows = querySql<{ codigo:string; area_id:number|null }>(db,
      `SELECT codigo,area_id FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL ORDER BY codigo;`);
    const byCode = Object.fromEntries(rows.map((row) => [row.codigo,row.area_id]));
    expect(byCode.REGRAS_OURO_PETROBRAS).toBe(610);
    expect(byCode.JUST_CULTURE).toBe(611);
    expect(byCode.STOP_WORK).toBe(611);
    expect(byCode.ETICA_CONDUTA).toBeNull();
    expect(byCode.LGPD_SEG_INFO).toBeNull();
  });

  it('creates no compliance, LMS, enrollment or qualification-history rows', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    for (const table of ['treinamento_requisitos','lms_cursos','lms_matriculas','qualificacoes_historico']) {
      expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM ${table};`)[0].total).toBe(0);
    }
    const normalized = migration.toLowerCase();
    for (const forbidden of [
      'insert into treinamento_requisitos','update treinamento_requisitos','delete from treinamento_requisitos',
      'insert into lms_cursos','update lms_cursos','delete from lms_cursos',
      'insert into lms_matriculas','update lms_matriculas','delete from lms_matriculas',
      'insert into qualificacoes_historico','update qualificacoes_historico','delete from qualificacoes_historico',
    ]) expect(normalized).not.toContain(forbidden);
  });

  it('fails closed when the canonical tenant-6 EAD category is missing', () => {
    const db = createDatabase();
    expect(execSql(db, `DELETE FROM qualificacoes_categorias WHERE empresa_id=6;`).code).toBe(0);
    expect(execSql(db, migration).code).not.toBe(0);
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM qualificacoes_tipos WHERE empresa_id=6;`)[0].total).toBe(0);
  });
});

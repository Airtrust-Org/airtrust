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
const productionWorkflowPath = '.github/workflows/apply-schema-change-v2.yml';
const productionPreflightPath = 'scripts/schema-v2/validate-0530-production-preflight.sh';
const productionPostconditionsPath = 'scripts/schema-v2/validate-0530-production-postconditions.sh';
const stagingPreflightPath = 'scripts/staging/validate-0530-preflight.sh';
const stagingPostconditionsPath = 'scripts/staging/validate-0530-postconditions.sh';
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
      (601,6,'EAD','EAD',1,NULL),(602,6,'TREINAMENTO_OPERACIONAL','Treinamento Operacional',1,NULL),(701,7,'EAD','EAD',1,NULL);
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

  it('wires preserve-existing fail-closed validation into staging and production', () => {
    const workflow = read(productionWorkflowPath);
    const preflight = read(productionPreflightPath);
    const postconditions = read(productionPostconditionsPath);
    const stagingPreflight = read(stagingPreflightPath);
    const stagingPostconditions = read(stagingPostconditionsPath);
    expect(workflow).toContain("inputs.change_id == 'training-qualification-catalog-placeholders-0530'");
    expect(workflow).toContain('bash scripts/schema-v2/validate-0530-production-preflight.sh --target=airtrust-db');
    expect(workflow).toContain('bash scripts/schema-v2/validate-0530-production-postconditions.sh --target=airtrust-db');
    expect(preflight).toContain('ALLOWED_DB_NAME="airtrust-db"');
    expect(preflight).toContain('duplicate-active-target-models 0');
    expect(preflight).toContain('inactive-target-models 0');
    expect(preflight).not.toContain('existing-target-compliance-requirements 0');
    expect(preflight).not.toContain('existing-target-lms-courses 0');
    for (const validator of [postconditions, stagingPostconditions]) {
      expect(validator).toContain('qualification-models 5');
      expect(validator).toContain('created-by-0530-invalid-category 0');
      expect(validator).toContain('created-by-0530-invented-validity-hours 0');
      expect(validator).toContain('created-by-0530-compliance-requirements 0');
      expect(validator).toContain('created-by-0530-lms-courses 0');
      expect(validator).not.toContain('canonical-ead-binding 5');
    }
    expect(stagingPreflight).toContain('inactive-target-models 0');
    expect(postconditions).toContain('schema-v2-change 1');
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

  it('preserves pre-existing target models and fills only missing codes', () => {
    const db = createDatabase();
    expect(execSql(db, `
      INSERT INTO qualificacoes_tipos(
        id,empresa_id,codigo,nome,categoria,categoria_id,validade,carga_horaria,
        ativo,is_check,observacoes,created_at,updated_at
      ) VALUES
        (9001,6,'JUST_CULTURE','Cultura Justa existente','Treinamento Operacional',602,24,2,1,0,'preserve-just',datetime('now'),datetime('now')),
        (9002,6,'STOP_WORK','Stop Work existente','Treinamento Operacional',602,24,2,1,0,'preserve-stop',datetime('now'),datetime('now'));
      INSERT INTO treinamento_requisitos(id,empresa_id,qualificacao_tipo_id) VALUES (1,6,9001);
      INSERT INTO lms_cursos(id,empresa_id,qualificacao_tipo_id) VALUES (1,6,9002);
    `).code).toBe(0);

    expect(execSql(db, migration).code).toBe(0);
    const allRows = querySql<{ codigo:string }>(db,
      `SELECT codigo FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;`);
    expect(allRows.map((row) => row.codigo).sort()).toEqual([...CODES].sort());

    const preserved = querySql<{
      codigo:string; nome:string; categoria_id:number; validade:number; carga_horaria:number; observacoes:string;
    }>(db, `SELECT codigo,nome,categoria_id,validade,carga_horaria,observacoes
             FROM qualificacoes_tipos
            WHERE empresa_id=6 AND codigo IN ('JUST_CULTURE','STOP_WORK')
            ORDER BY codigo;`);
    expect(preserved).toEqual([
      { codigo:'JUST_CULTURE', nome:'Cultura Justa existente', categoria_id:602, validade:24, carga_horaria:2, observacoes:'preserve-just' },
      { codigo:'STOP_WORK', nome:'Stop Work existente', categoria_id:602, validade:24, carga_horaria:2, observacoes:'preserve-stop' },
    ]);

    const created = querySql<{ codigo:string; categoria_id:number; validade:number|null; carga_horaria:number|null }>(db,
      `SELECT codigo,categoria_id,validade,carga_horaria
         FROM qualificacoes_tipos
        WHERE empresa_id=6 AND codigo IN ('REGRAS_OURO_PETROBRAS','ETICA_CONDUTA','LGPD_SEG_INFO')
        ORDER BY codigo;`);
    expect(created).toHaveLength(3);
    expect(created.every((row) => row.categoria_id === 601)).toBe(true);
    expect(created.every((row) => row.validade === null && row.carga_horaria === null)).toBe(true);
    expect(querySql<{ total:number }>(db, 'SELECT COUNT(*) total FROM treinamento_requisitos;')[0].total).toBe(1);
    expect(querySql<{ total:number }>(db, 'SELECT COUNT(*) total FROM lms_cursos;')[0].total).toBe(1);
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

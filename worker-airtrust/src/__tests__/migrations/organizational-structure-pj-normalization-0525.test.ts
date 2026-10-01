import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const changePath =
  'worker-airtrust/schema-v2/changes/0525_organizational_structure_pj_normalization.sql';
const planPath =
  'worker-airtrust/schema-v2/plans/organizational-structure-pj-normalization-0525.md';
const manifestPath =
  'worker-airtrust/schema-v2/organizational-structure-pj-normalization-0525.json';
const change = read(changePath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const targetIds = [111, 118, 174, 175, 176, 177, 181, 182, 185, 186, 187, 189, 191];

function idsSql(ids: number[]) {
  return ids.join(',');
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-org-0525-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(
    db,
    `
    PRAGMA foreign_keys=ON;
    CREATE TABLE setores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT, nome TEXT, descricao TEXT, ativo INTEGER DEFAULT 1,
      empresa_id INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_setores_codigo_empresa ON setores(empresa_id,codigo) WHERE deleted_at IS NULL;
    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT, ativo INTEGER DEFAULT 1,
      empresa_id INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_funcoes_codigo_empresa ON funcoes(empresa_id,codigo) WHERE deleted_at IS NULL;
    CREATE TABLE setores_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, alias TEXT NOT NULL,
      setor_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_setores_aliases_unique_active
      ON setores_aliases(empresa_id,LOWER(TRIM(alias))) WHERE ativo=1 AND deleted_at IS NULL;
    CREATE TABLE funcoes_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, alias TEXT NOT NULL,
      funcao_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_funcoes_aliases_unique_active
      ON funcoes_aliases(empresa_id,LOWER(TRIM(alias))) WHERE ativo=1 AND deleted_at IS NULL;
    CREATE TABLE setores_funcoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
      funcao_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_setores_funcoes_unique_active
      ON setores_funcoes(empresa_id,setor_id,funcao_id) WHERE ativo=1 AND deleted_at IS NULL;
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT, matricula TEXT,
      setor TEXT, setor_id INTEGER, funcao TEXT, funcao_id INTEGER, cargo TEXT,
      status TEXT DEFAULT 'ATIVO', ativo INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT,
      deleted_at TEXT
    );

    INSERT INTO setores(codigo,nome,ativo,empresa_id) VALUES
      ('QSMS','QSMS',1,6),('MAN','Manutenção',1,6),
      ('SEGURANCA','Segurança Operacional',1,6),('OPERACOES_CS','Operações',1,6),
      ('CONTROLADORIA','Controladoria',1,6),('RH_CS','Recursos Humanos',1,6),
      ('OUTRO','Outro tenant',1,7);

    INSERT INTO funcionarios(id,empresa_id,nome,matricula,setor,status,ativo) VALUES
      (111,6,'fixture-111',NULL,'Manutenção','ATIVO',1),
      (118,6,'fixture-118',NULL,'Manutenção','ATIVO',1),
      (174,6,'fixture-174','TEMP-TRN-20260920-001','Administrativo','ATIVO',1),
      (175,6,'fixture-175','TEMP-TRN-20260920-002','Administrativo','ATIVO',1),
      (176,6,'fixture-176','TEMP-TRN-20260920-003','Administrativo','ATIVO',1),
      (177,6,'fixture-177','TEMP-TRN-20260920-004','Administrativo','ATIVO',1),
      (181,6,'fixture-181','TEMP-TRN-20260920-008','Administrativo','ATIVO',1),
      (182,6,'fixture-182','TEMP-TRN-20260920-009','Administrativo','ATIVO',1),
      (185,6,'fixture-185','TEMP-TRN-20260920-012','Administrativo','ATIVO',1),
      (186,6,'fixture-186','TEMP-TRN-20260920-013','Administrativo','ATIVO',1),
      (187,6,'fixture-187','TEMP-TRN-20260920-014','Administrativo','ATIVO',1),
      (189,6,'fixture-189','TEMP-TRN-20260920-016','Administrativo','ATIVO',1),
      (191,6,'fixture-191','REAL-191','Controladoria','ATIVO',1),
      (7000,7,'tenant-control','KEEP-7000','Outro tenant','ATIVO',1);
    `,
  );
  expect(setup.code, setup.stderr).toBe(0);
  return db;
}

describe('0525 organizational structure PJ normalization', () => {
  it('pins the reviewed Schema V2 hashes', () => {
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(manifest).toMatchObject({
      changeId: 'organizational-structure-pj-normalization-0525',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('normalizes only the bounded tenant records and is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, change).code).toBe(0);
    expect(execSql(db, change).code).toBe(0);

    const normalized = querySql<{
      total: number;
      with_org: number;
      temp_matriculas: number;
    }>(
      db,
      `SELECT COUNT(*) total,
              SUM(CASE WHEN setor_id IS NOT NULL AND funcao_id IS NOT NULL AND NULLIF(TRIM(cargo),'') IS NOT NULL THEN 1 ELSE 0 END) with_org,
              SUM(CASE WHEN UPPER(TRIM(COALESCE(matricula,''))) LIKE 'TEMP-TRN-%' THEN 1 ELSE 0 END) temp_matriculas
         FROM funcionarios
        WHERE empresa_id=6 AND id IN (${idsSql(targetIds)});`,
    )[0];
    expect(normalized.total).toBe(13);
    expect(normalized.with_org).toBe(13);
    expect(normalized.temp_matriculas).toBe(0);

    const pairs = querySql<{ total: number }>(
      db,
      `SELECT COUNT(DISTINCT sf.funcao_id) total
         FROM setores_funcoes sf
         JOIN funcoes f ON f.id=sf.funcao_id
        WHERE sf.empresa_id=6 AND sf.ativo=1 AND sf.deleted_at IS NULL
          AND f.codigo IN (
            'ORG_DIR_FIN','ORG_GER_QSMS','ORG_GER_MAN','ORG_GER_TI','ORG_GER_EXEC',
            'ORG_GER_SEG_OP','ORG_AN_QUAL_OPS','ORG_GER_FIN','ORG_GER_RH','ORG_SUP_ENG',
            'ORG_DIR_GERAL','ORG_DIR_DEV_NEG','ORG_FINANCEIRO'
          );`,
    )[0];
    expect(pairs.total).toBe(13);

    const sectors = querySql<{ total: number }>(
      db,
      `SELECT COUNT(*) total FROM setores
        WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND codigo IN ('DIRETORIA','TI');`,
    )[0];
    expect(sectors.total).toBe(2);

    const preserved = querySql<{ matricula: string; setor: string; funcao_id: number | null }>(
      db,
      `SELECT matricula,setor,funcao_id FROM funcionarios WHERE id=7000 AND empresa_id=7;`,
    )[0];
    expect(preserved).toEqual({ matricula: 'KEEP-7000', setor: 'Outro tenant', funcao_id: null });

    const realMatricula = querySql<{ matricula: string }>(
      db,
      `SELECT matricula FROM funcionarios WHERE id=191 AND empresa_id=6;`,
    )[0];
    expect(realMatricula.matricula).toBe('REAL-191');
  });

  it('keeps employee names out of reviewed artifacts', () => {
    const reviewed = [change, read(planPath), read(manifestPath)].join('\n').toLowerCase();
    for (const forbidden of [
      'alessandro camelo',
      'daniel alonso',
      'jorge mario abadia',
      'mauricio castelo',
      'muza fornazieri',
      'renata miguez',
      'ricardo fontes',
      'rogerio affonso',
      'yuri azevedo',
      'mikhail loureiro',
    ]) {
      expect(reviewed).not.toContain(forbidden);
    }
  });
});

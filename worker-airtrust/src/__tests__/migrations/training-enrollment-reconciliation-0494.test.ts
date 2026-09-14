import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migration = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0494_training_enrollment_reconciliation.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-reconcile-0494-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const result = execSql(
    dbPath,
    `
      PRAGMA foreign_keys=ON;
      CREATE TABLE empresas (id INTEGER PRIMARY KEY);
      CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
      INSERT INTO empresas(id) VALUES (1),(2);
      INSERT INTO lms_matriculas(id,empresa_id) VALUES (10,1),(20,2);
    `,
  );
  expect(result.code, result.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0494 training enrollment reconciliation', () => {
  it('creates the additive reconciliation table, indexes and tenant guards', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);
    expect(
      querySql<{ n: number }>(
        dbPath,
        "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='treinamento_matricula_reconciliacoes';",
      )[0]?.n,
    ).toBe(1);
    expect(
      querySql<{ n: number }>(
        dbPath,
        "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('idx_treinamento_matricula_reconciliacoes_active','idx_treinamento_matricula_reconciliacoes_empresa');",
      )[0]?.n,
    ).toBe(2);
    expect(
      querySql<{ n: number }>(
        dbPath,
        "SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('trg_treinamento_matricula_reconciliacoes_tenant_insert','trg_treinamento_matricula_reconciliacoes_tenant_update');",
      )[0]?.n,
    ).toBe(2);
  });

  it('allows one active standalone acknowledgement and remains reversible', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    expect(
      execSql(
        dbPath,
        "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,10,'MANTER_AVULSA');",
      ).code,
    ).toBe(0);
    expect(
      execSql(
        dbPath,
        "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,10,'MANTER_AVULSA');",
      ).code,
    ).not.toBe(0);
    expect(
      execSql(
        dbPath,
        "UPDATE treinamento_matricula_reconciliacoes SET ativo=0,deleted_at=datetime('now') WHERE empresa_id=1 AND matricula_id=10;",
      ).code,
    ).toBe(0);
    expect(
      execSql(
        dbPath,
        "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,10,'MANTER_AVULSA');",
      ).code,
    ).toBe(0);
    expect(
      querySql<{ n: number }>(
        dbPath,
        'SELECT COUNT(*) n FROM treinamento_matricula_reconciliacoes WHERE empresa_id=1 AND matricula_id=10 AND ativo=1 AND deleted_at IS NULL;',
      )[0]?.n,
    ).toBe(1);
  });

  it('fails closed for cross-tenant enrollment references on insert and update', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    const crossInsert = execSql(
      dbPath,
      "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,20,'MANTER_AVULSA');",
    );
    expect(crossInsert.code).not.toBe(0);
    expect(crossInsert.stderr).toContain('matricula fora do tenant');
    expect(
      execSql(
        dbPath,
        "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,10,'MANTER_AVULSA');",
      ).code,
    ).toBe(0);
    const crossUpdate = execSql(
      dbPath,
      'UPDATE treinamento_matricula_reconciliacoes SET matricula_id=20 WHERE empresa_id=1;',
    );
    expect(crossUpdate.code).not.toBe(0);
    expect(crossUpdate.stderr).toContain('matricula fora do tenant');
  });

  it('accepts only the reviewed standalone decision', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    const invalid = execSql(
      dbPath,
      "INSERT INTO treinamento_matricula_reconciliacoes(empresa_id,matricula_id,decisao) VALUES(1,10,'CRIAR_REGRA');",
    );
    expect(invalid.code).not.toBe(0);
  });
});

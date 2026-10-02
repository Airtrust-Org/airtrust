import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const changePath = 'worker-airtrust/schema-v2/changes/0527_setor_compliance_responsibles.sql';
const planPath = 'worker-airtrust/schema-v2/plans/setor-compliance-responsibles-0527.md';
const manifestPath = 'worker-airtrust/schema-v2/setor-compliance-responsibles-0527.json';
const change = read(changePath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-0527-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(
    db,
    `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas(id INTEGER PRIMARY KEY);
    CREATE TABLE setores(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    INSERT INTO empresas(id) VALUES (6),(7);
    INSERT INTO setores(id,empresa_id) VALUES (10,6),(20,7);
    INSERT INTO funcionarios(id,empresa_id) VALUES (100,6),(200,7);
    `,
  );
  expect(setup.code, setup.stderr).toBe(0);
  return db;
}

describe('0527 sector Compliance responsibles', () => {
  it('pins reviewed Schema V2 hashes', () => {
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(manifest).toMatchObject({
      changeId: 'setor-compliance-responsibles-0527',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(read(planPath)));
  });

  it('is idempotent and rejects cross-tenant responsibility links', () => {
    const db = createDatabase();
    expect(execSql(db, change).code).toBe(0);
    expect(execSql(db, change).code).toBe(0);

    expect(
      execSql(
        db,
        `INSERT INTO setores_responsaveis_compliance(empresa_id,setor_id,funcionario_id)
         VALUES (6,10,100);`,
      ).code,
    ).toBe(0);

    const crossSector = execSql(
      db,
      `INSERT INTO setores_responsaveis_compliance(empresa_id,setor_id,funcionario_id)
       VALUES (6,20,100);`,
    );
    expect(crossSector.code).not.toBe(0);

    const crossEmployee = execSql(
      db,
      `INSERT INTO setores_responsaveis_compliance(empresa_id,setor_id,funcionario_id)
       VALUES (6,10,200);`,
    );
    expect(crossEmployee.code).not.toBe(0);

    const row = querySql<{ total: number }>(
      db,
      `SELECT COUNT(*) total FROM setores_responsaveis_compliance WHERE empresa_id=6;`,
    )[0];
    expect(row.total).toBe(1);
  });
});

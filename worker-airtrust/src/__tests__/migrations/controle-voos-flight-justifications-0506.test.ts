import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0506_controle_voos_flight_justifications.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0506_controle_voos_flight_justifications.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function run(db: string, sql: string, expectSuccess = true) {
  const result = spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  else expect(result.status).not.toBe(0);
}

function query<T>(db: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-flight-justifications-0506-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(
    db,
    `
      CREATE TABLE cv_voos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO cv_voos(id, empresa_id, deleted_at) VALUES (42, 7, NULL), (43, 8, NULL);
    `,
  );
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0506 Controle de Voos flight justifications', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('creates tenant-scoped catalog and flight justification tables', () => {
    const db = createDb();
    const tables = query<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cv_%justificativas%';",
    ).map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['cv_justificativas_voo', 'cv_voo_justificativas']),
    );
  });

  it('enforces positive minutes and same-tenant references', () => {
    const db = createDb();
    run(
      db,
      "INSERT INTO cv_justificativas_voo(empresa_id,codigo,nome) VALUES (7,'WX','Meteorologia');",
    );
    run(
      db,
      "INSERT INTO cv_voo_justificativas(empresa_id,voo_id,justificativa_id,minutos) VALUES (7,42,1,15);",
    );
    run(
      db,
      "INSERT INTO cv_voo_justificativas(empresa_id,voo_id,justificativa_id,minutos) VALUES (7,42,1,0);",
      false,
    );
    run(
      db,
      "INSERT INTO cv_voo_justificativas(empresa_id,voo_id,justificativa_id,minutos) VALUES (8,43,1,5);",
      false,
    );
    expect(
      query<{ total: number }>(
        db,
        'SELECT COALESCE(SUM(minutos),0) total FROM cv_voo_justificativas WHERE empresa_id=7 AND voo_id=42;',
      )[0].total,
    ).toBe(15);
  });
});

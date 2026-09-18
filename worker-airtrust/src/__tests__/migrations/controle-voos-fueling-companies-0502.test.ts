import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0502_controle_voos_fueling_companies.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0502_controle_voos_fueling_companies.sql'),
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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-fueling-company-0502-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0502 Controle de Voos fueling companies', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('creates the tenant-scoped fueling-company catalog with lifecycle fields', () => {
    const db = createDb();
    const columns = query<{ name: string }>(db, 'PRAGMA table_info(cv_empresas_abastecimento);').map(
      (row) => row.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'empresa_id',
        'codigo',
        'nome',
        'descricao',
        'ativo',
        'ordem',
        'created_by',
        'updated_by',
        'created_at',
        'updated_at',
        'deleted_at',
      ]),
    );
  });

  it('enforces code uniqueness inside a tenant without leaking across tenants', () => {
    const db = createDb();
    run(
      db,
      "INSERT INTO cv_empresas_abastecimento(empresa_id,codigo,nome) VALUES (6,'BR','BR Distribuidora');",
    );
    run(
      db,
      "INSERT INTO cv_empresas_abastecimento(empresa_id,codigo,nome) VALUES (7,'BR','Outro tenant');",
    );
    run(
      db,
      "INSERT INTO cv_empresas_abastecimento(empresa_id,codigo,nome) VALUES (6,'BR','Duplicado');",
      false,
    );
    expect(
      query<{ total: number }>(
        db,
        "SELECT COUNT(*) total FROM cv_empresas_abastecimento WHERE codigo='BR';",
      )[0].total,
    ).toBe(2);
  });
});

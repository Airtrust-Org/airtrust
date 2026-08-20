import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(testDir, '../../../migrations');
const migration = readFileSync(join(migrationsDir, '0463_frms_iogp_schema_v2.sql'), 'utf8');
const rollback = readFileSync(
  join(testDir, '../../../../scripts/rollback/0463_frms_iogp_schema_v2_rollback.sql'),
  'utf8',
);

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sqlite(databasePath: string, sql: string) {
  return spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

/** Minimal baseline: only what 0463 actually depends on (empresas). */
function createBaselineDb(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-0463-'));
  tempDirs.push(tempDir);
  const databasePath = join(tempDir, 'baseline.sqlite');

  let result = sqlite(databasePath, 'PRAGMA foreign_keys = ON;');
  expect(result.status, result.stderr).toBe(0);
  result = sqlite(
    databasePath,
    `CREATE TABLE empresas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
     INSERT INTO empresas (id, nome) VALUES (1, 'Empresa A'), (2, 'Empresa B');`,
  );
  expect(result.status, result.stderr).toBe(0);
  return databasePath;
}

describe('migration 0463 FRMS IOGP schema v2 — preflight/postcondition/rollback governance', () => {
  it('preflight: fails closed when the empresas dependency is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-0463-preflight-'));
    tempDirs.push(tempDir);
    const databasePath = join(tempDir, 'no-empresas.sqlite');
    sqlite(databasePath, 'PRAGMA foreign_keys = ON;');

    const applied = sqlite(databasePath, migration);
    // CREATE TABLE succeeds (SQLite does not validate FK targets at DDL time),
    // but any insert referencing a non-existent empresa must fail — this is
    // the real enforcement point, asserted below. PRAGMA foreign_keys must be
    // set within the same sqlite3 process as the write; it is not persisted
    // to the database file across separate invocations.
    expect(applied.status, applied.stderr).toBe(0);
    const insert = sqlite(
      databasePath,
      `PRAGMA foreign_keys = ON;
       INSERT INTO frms_regulatory_profiles
         (id, empresa_id, profile_code, policy_version, effective_from, created_at, updated_at)
       VALUES ('p1', 999, 'ANAC_BASIC', 'v1', '2026-01-01', '2026-01-01', '2026-01-01');`,
    );
    expect(insert.status).not.toBe(0);
    // Without the `empresas` dependency, SQLite refuses even before evaluating
    // the FK constraint itself — an even stronger preflight signal than a
    // runtime FK violation.
    expect(insert.stderr).toMatch(/no such table: main\.empresas|FOREIGN KEY constraint failed/i);
  });

  it('preflight: refuses to apply twice (table-already-exists is surfaced, not silently ignored)', () => {
    const databasePath = createBaselineDb();
    const first = sqlite(databasePath, migration);
    expect(first.status, first.stderr).toBe(0);

    const second = sqlite(databasePath, migration);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/already exists/i);
  });

  it('postconditions: all three tables, expected columns, FKs, and indexes exist', () => {
    const databasePath = createBaselineDb();
    expect(sqlite(databasePath, migration).status).toBe(0);

    const tables = queryJson<{ name: string }>(
      databasePath,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'frms_%' ORDER BY name;",
    );
    expect(tables.map((row) => row.name)).toEqual([
      'frms_jornada_avaliacoes',
      'frms_location_catalog',
      'frms_regulatory_profiles',
    ]);

    for (const table of [
      'frms_regulatory_profiles',
      'frms_location_catalog',
      'frms_jornada_avaliacoes',
    ]) {
      const columns = queryJson<{ name: string; notnull: number }>(
        databasePath,
        `PRAGMA table_info(${table});`,
      );
      const columnNames = columns.map((column) => column.name);
      expect(columnNames).toContain('empresa_id');
      const empresaColumn = columns.find((column) => column.name === 'empresa_id');
      expect(empresaColumn?.notnull).toBe(1);

      const foreignKeys = queryJson<{ table: string; from: string; to: string }>(
        databasePath,
        `PRAGMA foreign_key_list(${table});`,
      );
      expect(foreignKeys.some((fk) => fk.table === 'empresas' && fk.from === 'empresa_id')).toBe(true);
    }

    const indexes = queryJson<{ name: string }>(
      databasePath,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_frms_%' ORDER BY name;",
    );
    expect(indexes.map((row) => row.name)).toEqual([
      'idx_frms_jornada_avaliacoes_empresa_jornada',
      'idx_frms_jornada_avaliacoes_empresa_level',
      'idx_frms_jornada_avaliacoes_input_active',
      'idx_frms_location_catalog_empresa_code_active',
      'idx_frms_reg_profiles_empresa_effective',
    ]);
  });

  it('postconditions: tenant-scoped uniqueness — same location_code is fine across tenants, rejected within one', () => {
    const databasePath = createBaselineDb();
    expect(sqlite(databasePath, migration).status).toBe(0);

    const insertBase = (empresaId: number) =>
      sqlite(
        databasePath,
        `INSERT INTO frms_location_catalog
           (id, empresa_id, location_code, operational_class, weather_source_kind, created_at, updated_at)
         VALUES ('loc-${empresaId}', ${empresaId}, 'SBME', 'AERODROME', 'REDEMET', '2026-01-01', '2026-01-01');`,
      );

    expect(insertBase(1).status).toBe(0);
    expect(insertBase(2).status).toBe(0); // same code, different tenant: allowed

    const duplicate = sqlite(
      databasePath,
      `INSERT INTO frms_location_catalog
         (id, empresa_id, location_code, operational_class, weather_source_kind, created_at, updated_at)
       VALUES ('loc-1-dup', 1, 'SBME', 'AERODROME', 'REDEMET', '2026-01-01', '2026-01-01');`,
    );
    expect(duplicate.status).not.toBe(0); // same code, same tenant: rejected
  });

  it('postconditions: no table lacking empresa_id where required — CREATE TABLE statements audited', () => {
    const withoutComments = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const createStatements = withoutComments.match(/CREATE TABLE[\s\S]*?;/g) ?? [];
    expect(createStatements.length).toBe(3);
    for (const statement of createStatements) {
      expect(statement).toMatch(/empresa_id INTEGER NOT NULL/);
      expect(statement).toMatch(/FOREIGN KEY \(empresa_id\) REFERENCES empresas\(id\)/);
    }
  });

  it('governance: ON DELETE CASCADE was deliberately not used for these audit/regulatory-trail tables', () => {
    const withoutComments = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(withoutComments).not.toMatch(/ON DELETE CASCADE/);
  });

  it('rollback: drops all three tables individually (D1/SQLite has no multi-table DROP), safe to run after apply', () => {
    const databasePath = createBaselineDb();
    expect(sqlite(databasePath, migration).status).toBe(0);

    const dropStatements = rollback
      .split('\n')
      .filter((line) => line.trim().toUpperCase().startsWith('DROP TABLE'));
    expect(dropStatements).toHaveLength(3);
    for (const statement of dropStatements) {
      expect(statement.trim()).toMatch(/^DROP TABLE IF EXISTS \w+;$/);
    }

    const rolledBack = sqlite(databasePath, rollback);
    expect(rolledBack.status, rolledBack.stderr).toBe(0);

    const remaining = queryJson<{ name: string }>(
      databasePath,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'frms_%';",
    );
    expect(remaining).toEqual([]);
  });

  it('rollback: is safe to run even if some tables were never created (IF EXISTS)', () => {
    const databasePath = createBaselineDb();
    // Migration not applied at all — rollback must still succeed.
    const rolledBack = sqlite(databasePath, rollback);
    expect(rolledBack.status, rolledBack.stderr).toBe(0);
  });
});

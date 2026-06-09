import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
    timeout: 10_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function migrationSql(): string {
  return readFileSync(
    join(__dirname, '../../../migrations/0400_reconcile_wave3_d1_ledger.sql'),
    'utf8',
  );
}

describe('Wave 3 ledger reconciliation', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setupDb(options: { wave3Applied: boolean }): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave3-ledger-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    runSqlite(
      dbPath,
      `
      CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO d1_migrations (name, applied_at)
      VALUES ('0398_reconcile_wave1_wave2_d1_ledger.sql', datetime('now'));

      CREATE TABLE documentos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE pasta_virtual (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE setores (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE funcoes (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE arquivos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave3Applied ? 'NOT NULL' : 'DEFAULT 1'});
      `,
    );

    return dbPath;
  }

  it('does not record 0399 before the Wave 3 schema shape exists', () => {
    const dbPath = setupDb({ wave3Applied: false });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, `SELECT name FROM d1_migrations ORDER BY id;`)
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual(['0398_reconcile_wave1_wave2_d1_ledger.sql']);
  });

  it('records 0399 when Wave 3 schema shape is already present', () => {
    const dbPath = setupDb({ wave3Applied: true });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, `SELECT name FROM d1_migrations ORDER BY id;`)
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual([
      '0398_reconcile_wave1_wave2_d1_ledger.sql',
      '0399_harden_empresa_id_wave3.sql',
    ]);
  });

  it('is idempotent when executed more than once', () => {
    const dbPath = setupDb({ wave3Applied: true });
    runSqlite(dbPath, migrationSql());
    runSqlite(dbPath, migrationSql());

    const rows = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM d1_migrations;`).trim());
    expect(rows).toBe(2);
  });
});

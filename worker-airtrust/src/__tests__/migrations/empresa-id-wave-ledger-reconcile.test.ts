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
    join(__dirname, '../../../migrations/0398_reconcile_wave1_wave2_d1_ledger.sql'),
    'utf8',
  );
}

describe('Wave 1/2 ledger reconciliation', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setupDb(options: { wave2Applied: boolean }): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave-ledger-'));
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
      VALUES ('0395_f7_platform_admin_backfill.sql', datetime('now'));

      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL
      );

      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL
      );

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL
      );

      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER ${options.wave2Applied ? 'NOT NULL' : 'DEFAULT 1'}
      );

      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER ${options.wave2Applied ? 'NOT NULL' : ''}
      );

      CREATE TABLE certificados (
        id INTEGER PRIMARY KEY AUTOINCREMENT
        ${options.wave2Applied ? ', empresa_id INTEGER NOT NULL' : ''}
      );
      `,
    );

    return dbPath;
  }

  it('records only 0396 when wave 1 shape exists but wave 2 is not applied', () => {
    const dbPath = setupDb({ wave2Applied: false });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, `SELECT name FROM d1_migrations ORDER BY id;`)
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual([
      '0395_f7_platform_admin_backfill.sql',
      '0396_harden_empresa_id_wave1.sql',
    ]);
  });

  it('records 0396, 0397 and 0398 when both schema waves are already present', () => {
    const dbPath = setupDb({ wave2Applied: true });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, `SELECT name FROM d1_migrations ORDER BY id;`)
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual([
      '0395_f7_platform_admin_backfill.sql',
      '0396_harden_empresa_id_wave1.sql',
      '0397_harden_empresa_id_wave2.sql',
      '0398_reconcile_wave1_wave2_d1_ledger.sql',
    ]);
  });

  it('is idempotent when executed more than once', () => {
    const dbPath = setupDb({ wave2Applied: true });
    runSqlite(dbPath, migrationSql());
    runSqlite(dbPath, migrationSql());

    const rows = Number(runSqlite(dbPath, `SELECT COUNT(*) FROM d1_migrations;`).trim());
    expect(rows).toBe(4);
  });
});

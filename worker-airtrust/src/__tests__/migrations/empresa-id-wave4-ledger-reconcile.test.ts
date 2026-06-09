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
    join(__dirname, '../../../migrations/0403_reconcile_wave4_d1_ledger.sql'),
    'utf8',
  );
}

describe('Wave 4 ledger reconciliation', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setupDb(options: { wave4Applied: boolean; alreadyReconciled?: boolean }): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave4-ledger-'));
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
      VALUES ('0401_add_cor_column_tipos_sessao.sql', datetime('now'));
      ${options.alreadyReconciled ? `INSERT INTO d1_migrations (name, applied_at) VALUES ('0402_harden_empresa_id_wave4.sql', datetime('now'));` : ''}

      CREATE TABLE importacoes_log (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave4Applied ? 'NOT NULL' : 'DEFAULT 1'});
      CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nome TEXT, empresa_id INTEGER ${options.wave4Applied ? 'NOT NULL' : 'DEFAULT 1'}, deleted_at TEXT);
      CREATE TABLE sgso_spi_config (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER ${options.wave4Applied ? 'NOT NULL' : 'DEFAULT 1'}, ativo INTEGER DEFAULT 1);
      ${options.wave4Applied ? `
      CREATE TRIGGER trg_qualificacoes_historico_set_tipo AFTER INSERT ON qualificacoes_tipos BEGIN SELECT 1; END;
      CREATE VIEW qualificacoes_historico_v AS SELECT 1 AS x;
      INSERT INTO qualificacoes_tipos (codigo, nome, empresa_id) VALUES ('T1', 'Test', 6);
      ` : ''}
      `,
    );

    return dbPath;
  }

  it('does not record 0402 before Wave 4 schema shapes exist', () => {
    const dbPath = setupDb({ wave4Applied: false });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, 'SELECT name FROM d1_migrations ORDER BY id;')
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual(['0401_add_cor_column_tipos_sessao.sql']);
  });

  it('records 0402 when Wave 4 schema shapes are present', () => {
    const dbPath = setupDb({ wave4Applied: true });
    runSqlite(dbPath, migrationSql());

    const names = runSqlite(dbPath, 'SELECT name FROM d1_migrations ORDER BY id;')
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(names).toEqual([
      '0401_add_cor_column_tipos_sessao.sql',
      '0402_harden_empresa_id_wave4.sql',
    ]);
  });

  it('is idempotent when executed more than once', () => {
    const dbPath = setupDb({ wave4Applied: true, alreadyReconciled: true });
    runSqlite(dbPath, migrationSql());
    runSqlite(dbPath, migrationSql());

    const rows = Number(runSqlite(dbPath, 'SELECT COUNT(*) FROM d1_migrations;').trim());
    expect(rows).toBe(2);
  });
});

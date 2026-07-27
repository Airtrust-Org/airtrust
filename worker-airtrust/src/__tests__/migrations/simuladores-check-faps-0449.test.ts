import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MIGRATION_PATH = join(ROOT, 'migrations/0449_simuladores_check_faps_reconciliacao.sql');
const ROLLBACK_PATH = join(ROOT, 'migrations/0449_simuladores_check_faps_reconciliacao_rollback.sql');
const migration = readFileSync(MIGRATION_PATH, 'utf8');
const rollback = readFileSync(ROLLBACK_PATH, 'utf8');

function dbPath(name: string) {
  return join(
    tmpdir(),
    `airtrust-0449-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], { input: sql, encoding: 'utf8' });
}

function queryJson<T = unknown>(db: string, sql: string): T {
  const result = spawnSync('sqlite3', ['-json', db], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const trimmed = result.stdout.trim();
  return (trimmed ? JSON.parse(trimmed) : []) as T;
}

const SCHEMA = `
CREATE TABLE qualificacoes_tipos(
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  is_check INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE modelos_sessao_checks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  deleted_at TEXT
);

INSERT INTO qualificacoes_tipos VALUES
  (164, 6, 'FAP6-139', 0, NULL),
  (114, 6, 'IFR-SK76', 0, NULL),
  (79, 6, 'IFR-139', 1, NULL),
  (78, 6, 'FAP06-76', 1, NULL);

-- AW139 checks already have IFR-139 (matches the state confirmed in prod).
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id, deleted_at) VALUES
  (105, 79, NULL), (109, 79, NULL), (115, 79, NULL), (121, 79, NULL),
  (111, 79, NULL), (117, 79, NULL), (153, 79, NULL);

-- SK76-P-CHECK (142) already has FAP06-76; SK76-I-12/12 (135) and
-- SK76-S-02/02 (144) have zero links, matching the audited state.
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id, deleted_at) VALUES
  (142, 78, NULL);
`;

function setupDb(): string {
  const db = dbPath('setup');
  const result = run(db, SCHEMA);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return db;
}

describe('migration 0449 — check FAP reconciliation', () => {
  it('flips is_check to 1 for FAP6-139 and IFR-SK76 only', () => {
    const db = setupDb();
    const result = run(db, migration);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const rows = queryJson<Array<{ id: number; is_check: number }>>(
      db,
      'SELECT id, is_check FROM qualificacoes_tipos ORDER BY id;',
    );
    expect(rows).toEqual([
      { id: 78, is_check: 1 },
      { id: 79, is_check: 1 },
      { id: 114, is_check: 1 },
      { id: 164, is_check: 1 },
    ]);
  });

  it('adds FAP6-139 to AW139 inicial/periodico checks but not semestral', () => {
    const db = setupDb();
    run(db, migration);

    const aw139Links = queryJson<Array<{ modelo_id: number; qualificacao_tipo_id: number }>>(
      db,
      `SELECT modelo_id, qualificacao_tipo_id FROM modelos_sessao_checks
       WHERE modelo_id IN (105, 109, 115, 121, 111, 117, 153)
       ORDER BY modelo_id, qualificacao_tipo_id;`,
    );

    expect(aw139Links).toEqual([
      { modelo_id: 105, qualificacao_tipo_id: 79 },
      { modelo_id: 105, qualificacao_tipo_id: 164 },
      { modelo_id: 109, qualificacao_tipo_id: 79 },
      { modelo_id: 109, qualificacao_tipo_id: 164 },
      { modelo_id: 111, qualificacao_tipo_id: 79 },
      { modelo_id: 115, qualificacao_tipo_id: 79 },
      { modelo_id: 115, qualificacao_tipo_id: 164 },
      { modelo_id: 117, qualificacao_tipo_id: 79 },
      { modelo_id: 121, qualificacao_tipo_id: 79 },
      { modelo_id: 121, qualificacao_tipo_id: 164 },
      { modelo_id: 153, qualificacao_tipo_id: 79 },
    ]);
  });

  it('gives SK76 checks FAP06-76+IFR-SK76 for inicial, IFR-SK76 only for periodico/semestral', () => {
    const db = setupDb();
    run(db, migration);

    const sk76Links = queryJson<Array<{ modelo_id: number; qualificacao_tipo_id: number }>>(
      db,
      `SELECT modelo_id, qualificacao_tipo_id FROM modelos_sessao_checks
       WHERE modelo_id IN (135, 142, 144)
       ORDER BY modelo_id, qualificacao_tipo_id;`,
    );

    expect(sk76Links).toEqual([
      { modelo_id: 135, qualificacao_tipo_id: 78 },
      { modelo_id: 135, qualificacao_tipo_id: 114 },
      { modelo_id: 142, qualificacao_tipo_id: 78 },
      { modelo_id: 142, qualificacao_tipo_id: 114 },
      { modelo_id: 144, qualificacao_tipo_id: 114 },
    ]);
  });

  it('is idempotent: a second run aborts on the preflight guard', () => {
    const db = setupDb();
    run(db, migration);
    const second = run(db, migration);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('0449 preflight');
  });

  it('the rollback file reverses every write exactly', () => {
    const db = setupDb();
    run(db, migration);
    const rollbackResult = run(db, rollback);
    expect(rollbackResult.status, rollbackResult.stderr || rollbackResult.stdout).toBe(0);

    const isCheckRows = queryJson<Array<{ id: number; is_check: number }>>(
      db,
      'SELECT id, is_check FROM qualificacoes_tipos WHERE id IN (114, 164) ORDER BY id;',
    );
    expect(isCheckRows).toEqual([
      { id: 114, is_check: 0 },
      { id: 164, is_check: 0 },
    ]);

    const remainingLinks = queryJson<Array<{ modelo_id: number; qualificacao_tipo_id: number }>>(
      db,
      `SELECT modelo_id, qualificacao_tipo_id FROM modelos_sessao_checks
       ORDER BY modelo_id, qualificacao_tipo_id;`,
    );
    // Back to exactly the pre-migration fixture state.
    expect(remainingLinks).toEqual([
      { modelo_id: 105, qualificacao_tipo_id: 79 },
      { modelo_id: 109, qualificacao_tipo_id: 79 },
      { modelo_id: 111, qualificacao_tipo_id: 79 },
      { modelo_id: 115, qualificacao_tipo_id: 79 },
      { modelo_id: 117, qualificacao_tipo_id: 79 },
      { modelo_id: 121, qualificacao_tipo_id: 79 },
      { modelo_id: 142, qualificacao_tipo_id: 78 },
      { modelo_id: 153, qualificacao_tipo_id: 79 },
    ]);
  });
});

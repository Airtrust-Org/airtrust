import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const migration = readFileSync(
  join(ROOT, 'migrations/0455_aeronaves_codigo_tenant_active_unique.sql'),
  'utf8',
);
const rollback = readFileSync(
  join(ROOT, '..', 'scripts/rollback/0455_aeronaves_codigo_tenant_active_unique.sql'),
  'utf8',
);

function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], { input: sql, encoding: 'utf8' });
}

describe('migration 0455 aeronaves active tenant uniqueness', () => {
  it('allows reuse after soft delete and across tenants, but rejects active duplicate in one tenant', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-0455-'));
    const db = join(dir, 'test.sqlite');
    try {
      const setup = run(
        db,
        `CREATE TABLE aeronaves (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          modelo TEXT NOT NULL,
          fabricante TEXT,
          prefixo TEXT,
          ano_fabricacao INTEGER,
          status TEXT DEFAULT 'ATIVO',
          observacoes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          deleted_at TEXT,
          empresa_id INTEGER NOT NULL
        );
        INSERT INTO aeronaves (codigo, modelo, prefixo, empresa_id, deleted_at)
        VALUES ('PR-XYZ', 'AW139', 'PR-XYZ', 6, datetime('now'));`,
      );
      expect(setup.status, setup.stderr).toBe(0);

      const applied = run(db, migration);
      expect(applied.status, applied.stderr).toBe(0);

      expect(
        run(
          db,
          `INSERT INTO aeronaves (codigo, modelo, prefixo, empresa_id)
           VALUES ('PR-XYZ', 'AW139', 'PR-XYZ', 6);`,
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          `INSERT INTO aeronaves (codigo, modelo, prefixo, empresa_id)
           VALUES ('PR-XYZ', 'AW139', 'PR-XYZ', 8);`,
        ).status,
      ).toBe(0);
      expect(
        run(
          db,
          `INSERT INTO aeronaves (codigo, modelo, prefixo, empresa_id)
           VALUES ('pr-xyz', 'AW139', 'pr-xyz', 6);`,
        ).status,
      ).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates active duplicates before dropping the source table', () => {
    expect(
      migration.indexOf('CREATE UNIQUE INDEX ux_aeronaves_empresa_codigo_active'),
    ).toBeLessThan(migration.indexOf('DROP TABLE aeronaves;'));
  });

  it('restores the previous global uniqueness contract when rollback preconditions hold', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-0455-rollback-'));
    const db = join(dir, 'test.sqlite');
    try {
      const setup = run(
        db,
        `CREATE TABLE aeronaves (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          modelo TEXT NOT NULL,
          fabricante TEXT,
          prefixo TEXT,
          ano_fabricacao INTEGER,
          status TEXT DEFAULT 'ATIVO',
          observacoes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          deleted_at TEXT,
          empresa_id INTEGER NOT NULL
        );
        INSERT INTO aeronaves (codigo, modelo, empresa_id)
        VALUES ('PR-AAA', 'AW139', 6), ('PR-BBB', 'S76', 8);`,
      );
      expect(setup.status, setup.stderr).toBe(0);
      expect(run(db, migration).status).toBe(0);

      const rolledBack = run(db, rollback);
      expect(rolledBack.status, rolledBack.stderr).toBe(0);
      expect(
        run(
          db,
          `INSERT INTO aeronaves (codigo, modelo, empresa_id)
           VALUES ('PR-AAA', 'AW139', 8);`,
        ).status,
      ).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ships an explicit reviewed rollback artifact', () => {
    expect(rollback).toContain('codigo TEXT UNIQUE NOT NULL');
    expect(rollback).toContain('ALTER TABLE aeronaves_0455_rollback RENAME TO aeronaves');
  });
});

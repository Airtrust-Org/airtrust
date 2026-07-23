/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-ignore — pure .mjs module, no type declarations
import { sqliteExecutor } from '../../../../scripts/production/lib/executors.mjs';
// @ts-ignore — pure .mjs module, no type declarations
import {
  reconcile,
  planLedgerWrite,
  discoverLedgerSchema,
  ledgerHasEntry,
  LEDGER_ENTRY_NAME,
} from '../../../../scripts/production/lib/simuladores-0440-ledger-reconciler.mjs';
// @ts-ignore — pure .mjs module, no type declarations
import {
  assertProductionTarget,
  validateBackup,
  validateMigrationHash,
  PRODUCTION_TARGET,
} from '../../../../scripts/production/lib/reconcile-gates.mjs';

const WORKER_ROOT = process.cwd();
const MIGRATION_PATH = join(
  WORKER_ROOT,
  'migrations/0440_simuladores_matriz_versionada_metadata.sql',
);
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
const MIG_0441 = join(WORKER_ROOT, 'migrations/0441_simuladores_matriz_manobra_resolution.sql');
const MIG_0442 = join(WORKER_ROOT, 'migrations/0442_simuladores_matriz_guia_relink.sql');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `0440-recon-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function sqlite(db: string, sql: string) {
  const res = spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return res.stdout;
}

const PRE_0440_SCHEMA = `
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_sessao(
  id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL DEFAULT 'f',
  empresa_id INTEGER NOT NULL, created_at TEXT, deleted_at TEXT, created_by TEXT, updated_by TEXT);
CREATE TABLE manobras(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
CREATE TABLE modelos_sessao_manobras(
  id INTEGER PRIMARY KEY, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, ordem INTEGER NOT NULL,
  obrigatoria INTEGER, observacoes TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, created_by TEXT, updated_by TEXT,
  tripulante TEXT NOT NULL DEFAULT 'AB',
  UNIQUE(modelo_id, manobra_id),
  FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY(manobra_id) REFERENCES manobras(id));
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
INSERT INTO empresas VALUES(6);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at) VALUES(10,'A139-I-01',6,'2020-01-01');
INSERT INTO manobras VALUES(100,6,NULL),(101,6,NULL);
INSERT INTO modelos_sessao_manobras VALUES
  (1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),
  (2,10,101,2,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
`;

// Wrangler's real d1_migrations shape (id PK, name TEXT, applied_at TIMESTAMP NOT NULL DEFAULT).
const LEDGER_BOOTSTRAP = `
CREATE TABLE d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO d1_migrations (name, applied_at) VALUES ('0439_bootstrap.sql', datetime('now'));
`;

/** Build a fixture: pre-0440 schema + ledger (bootstrap only, 0440 absent) + 0440 physically applied. */
function fixtureApplied0440(name: string): string {
  const db = join(tmp(name), 'prod-copy.db');
  sqlite(db, PRE_0440_SCHEMA);
  sqlite(db, LEDGER_BOOTSTRAP);
  sqlite(db, `BEGIN IMMEDIATE;\n${migrationSql}\nCOMMIT;`);
  return db;
}

describe('0440 ledger reconciler — gates', () => {
  it('assertProductionTarget accepts the exact production target and refuses others', () => {
    expect(assertProductionTarget({ ...PRODUCTION_TARGET })).toBe(true);
    expect(() =>
      assertProductionTarget({
        database_name: 'airtrust-db-dev',
        database_id: PRODUCTION_TARGET.database_id,
      }),
    ).toThrow(/database_name/);
    expect(() =>
      assertProductionTarget({ database_name: 'airtrust-db', database_id: 'deadbeef' }),
    ).toThrow(/database_id/);
  });

  it('validateMigrationHash refuses a wrong expected hash and accepts the real one', () => {
    const real = validateMigrationHash({ path: MIGRATION_PATH });
    expect(real).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      validateMigrationHash({ path: MIGRATION_PATH, expectedSha256: 'a'.repeat(64) }),
    ).toThrow(/diverge/);
    expect(validateMigrationHash({ path: MIGRATION_PATH, expectedSha256: real })).toBe(real);
  });

  it('validateBackup refuses a missing file and a size/hash mismatch', () => {
    const dir = tmp('backup');
    const file = join(dir, 'backup.sql');
    writeFileSync(file, 'hello world');
    const bytes = Buffer.byteLength('hello world');
    const sha = createHash('sha256').update('hello world').digest('hex');
    expect(validateBackup({ path: file, expectedBytes: bytes, expectedSha256: sha })).toMatchObject(
      { bytes },
    );
    expect(() =>
      validateBackup({ path: join(dir, 'nope.sql'), expectedBytes: bytes, expectedSha256: sha }),
    ).toThrow(/não encontrado/);
    expect(() =>
      validateBackup({ path: file, expectedBytes: bytes + 1, expectedSha256: sha }),
    ).toThrow(/tamanho/);
    expect(() =>
      validateBackup({ path: file, expectedBytes: bytes, expectedSha256: 'b'.repeat(64) }),
    ).toThrow(/SHA-256/);
  });
});

describe('0440 ledger reconciler — core against a disposable copy', () => {
  it('discovers the real ledger shape and plans exactly one idempotent insert', () => {
    const db = fixtureApplied0440('plan');
    const exec = sqliteExecutor(db);
    const schema = discoverLedgerSchema(exec);
    expect(schema.columns.map((c: { name: string }) => c.name)).toEqual([
      'id',
      'name',
      'applied_at',
    ]);
    const plan = planLedgerWrite({ ledgerSchema: schema, name: LEDGER_ENTRY_NAME });
    expect(plan.sql).toContain('INSERT INTO d1_migrations');
    expect(plan.sql).toContain('WHERE NOT EXISTS');
    expect(plan.sql).toContain(LEDGER_ENTRY_NAME);
  });

  it('dry-run performs zero writes and leaves the ledger untouched', () => {
    const db = fixtureApplied0440('dry-run');
    let writes = 0;
    const base = sqliteExecutor(db);
    const spy = {
      ...base,
      exec: (sql: string) => {
        writes += 1;
        return base.exec(sql);
      },
    };
    const before = base.query('SELECT COUNT(*) AS c FROM d1_migrations')[0].c;
    const res = reconcile({ executor: spy, migrationSql, fkCheckBaseline: 0, apply: false });
    expect(res.auditState).toBe('INTEGRALMENTE_APLICADA');
    expect(res.ok).toBe(true);
    expect(res.plannedWrites).toHaveLength(1);
    expect(writes).toBe(0);
    expect(base.query('SELECT COUNT(*) AS c FROM d1_migrations')[0].c).toBe(before);
    expect(ledgerHasEntry(base, LEDGER_ENTRY_NAME)).toBe(false);
  });

  it('--apply records only the 0440 entry and is idempotent on a second run', () => {
    const db = fixtureApplied0440('apply');
    const exec = sqliteExecutor(db);
    const first = reconcile({ executor: exec, migrationSql, fkCheckBaseline: 0, apply: true });
    expect(first.ok).toBe(true);
    expect(first.wrote).toBe(true);
    expect(first.revalidatedState).toBe('INTEGRALMENTE_APLICADA');
    // Only bootstrap + 0440 exist now.
    const names1 = exec
      .query('SELECT name FROM d1_migrations ORDER BY id')
      .map((r: { name: string }) => r.name);
    expect(names1).toEqual(['0439_bootstrap.sql', LEDGER_ENTRY_NAME]);

    const second = reconcile({ executor: exec, migrationSql, fkCheckBaseline: 0, apply: true });
    expect(second.ok).toBe(true);
    const names2 = exec
      .query('SELECT name FROM d1_migrations ORDER BY id')
      .map((r: { name: string }) => r.name);
    expect(names2).toEqual(names1); // no duplicate, no error
    const count = exec.query(
      `SELECT COUNT(*) AS c FROM d1_migrations WHERE name = '${LEDGER_ENTRY_NAME}'`,
    )[0].c;
    expect(count).toBe(1);
  });

  it('refuses to write when the state is only partial (a trigger dropped)', () => {
    const db = fixtureApplied0440('partial-refuse');
    sqlite(db, 'DROP TRIGGER trg_modelo_versao_updated_at;');
    const exec = sqliteExecutor(db);
    const res = reconcile({ executor: exec, migrationSql, fkCheckBaseline: 0, apply: true });
    expect(res.ok).toBe(false);
    expect(res.auditState).toBe('PARCIALMENTE_APLICADA');
    expect(res.wrote).toBe(false);
    expect(ledgerHasEntry(exec, LEDGER_ENTRY_NAME)).toBe(false);
  });

  it('refuses to write when an index diverges (conflict)', () => {
    const db = fixtureApplied0440('conflict-refuse');
    sqlite(
      db,
      'DROP INDEX idx_modelo_versionamento_anterior; CREATE INDEX idx_modelo_versionamento_anterior ON modelos_sessao_versionamento(empresa_id);',
    );
    const exec = sqliteExecutor(db);
    const res = reconcile({ executor: exec, migrationSql, fkCheckBaseline: 0, apply: true });
    expect(res.ok).toBe(false);
    expect(res.auditState).toBe('CONFLITANTE');
    expect(res.wrote).toBe(false);
    expect(ledgerHasEntry(exec, LEDGER_ENTRY_NAME)).toBe(false);
  });

  it('refuses to write when the FK baseline diverges from the measured count', () => {
    const db = fixtureApplied0440('fk-refuse');
    const exec = sqliteExecutor(db);
    // Measured fk-check is 0 (valid seed); passing a baseline of 525 forces a conflict.
    const res = reconcile({ executor: exec, migrationSql, fkCheckBaseline: 525, apply: true });
    expect(res.ok).toBe(false);
    expect(res.auditState).toBe('CONFLITANTE');
    expect(res.wrote).toBe(false);
  });
});

function hasWrangler(): boolean {
  const r = spawnSync('npx', ['--no-install', 'wrangler', '--version'], {
    cwd: WORKER_ROOT,
    encoding: 'utf8',
  });
  return r.status === 0;
}

describe('0441/0442 ledger-aware remote runner mechanism (local rehearsal)', () => {
  it('applies only 0441/0442 through the ledger, idempotently, touching no historical migration and no FK', () => {
    if (!hasWrangler()) {
      expect(true).toBe(true);
      return;
    }
    const dir = tmp('runner');
    const configPath = join(dir, 'wrangler.toml');
    const migrationsDir = join(dir, 'migrations');
    const stateDir = join(dir, 'state');
    // Isolated migrations dir: ONLY 0441 and 0442 (never the 400+ historical dir).
    mkdirSync(migrationsDir, { recursive: true });
    copyFileSync(MIG_0441, join(migrationsDir, '0441_simuladores_matriz_manobra_resolution.sql'));
    copyFileSync(MIG_0442, join(migrationsDir, '0442_simuladores_matriz_guia_relink.sql'));

    writeFileSync(
      configPath,
      `name = "airtrust-0440-runner-proof"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "airtrust-0440-runner-proof"
database_id = "00000000-0000-0000-0000-000000000440"
migrations_dir = "${migrationsDir}"
`,
    );
    writeFileSync(
      join(dir, 'index.js'),
      'export default { fetch(){ return new Response("ok"); } };',
    );

    const wr = (command: string, json = false) => {
      const args = [
        '--no-install',
        'wrangler',
        'd1',
        'execute',
        'airtrust-0440-runner-proof',
        '--local',
        '--config',
        configPath,
        '--persist-to',
        stateDir,
      ];
      if (json) args.push('--json');
      args.push('--command', command);
      const r = spawnSync('npx', args, { cwd: WORKER_ROOT, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
      return r.stdout;
    };
    const wrJson = (command: string) => {
      const out = wr(command, true).trim();
      const payload = JSON.parse(out.slice(out.indexOf('[')));
      return payload.flatMap((b: { results?: unknown[] }) => b.results || []);
    };

    // Seed pre-0440 schema, apply 0440 physically, and pre-load the ledger with
    // bootstrap + the reconciled 0440 entry (mirrors post-reconciliation state).
    const seedFile = join(dir, 'seed.sql');
    writeFileSync(
      seedFile,
      `${PRE_0440_SCHEMA}\n${migrationSql}\n` +
        `CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);\n` +
        `INSERT INTO d1_migrations (name) VALUES ('0439_bootstrap.sql'), ('0440_simuladores_matriz_versionada_metadata.sql');\n` +
        // 0442's applied-assertion trigger references this table at fire time.
        `CREATE TABLE simuladores_modelos_sessao_guias (id INTEGER PRIMARY KEY, empresa_id INTEGER, guia_id INTEGER, modelo_sessao_id INTEGER, deleted_at TEXT);\n`,
    );
    const seed = spawnSync(
      'npx',
      [
        '--no-install',
        'wrangler',
        'd1',
        'execute',
        'airtrust-0440-runner-proof',
        '--local',
        '--config',
        configPath,
        '--persist-to',
        stateDir,
        '--file',
        seedFile,
      ],
      { cwd: WORKER_ROOT, encoding: 'utf8' },
    );
    expect(seed.status, seed.stderr || seed.stdout).toBe(0);

    const fkBefore = wrJson('PRAGMA foreign_key_check').length;

    const apply1 = spawnSync(
      'npx',
      [
        '--no-install',
        'wrangler',
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--config',
        configPath,
        '--persist-to',
        stateDir,
      ],
      { cwd: WORKER_ROOT, encoding: 'utf8' },
    );
    expect(apply1.status, apply1.stderr || apply1.stdout).toBe(0);

    const namesAfter = wrJson('SELECT name FROM d1_migrations ORDER BY id').map(
      (r: { name: string }) => r.name,
    );
    expect(namesAfter).toEqual([
      '0439_bootstrap.sql',
      '0440_simuladores_matriz_versionada_metadata.sql',
      '0441_simuladores_matriz_manobra_resolution.sql',
      '0442_simuladores_matriz_guia_relink.sql',
    ]);
    // The follow-up tables exist.
    const tables = wrJson(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simuladores_matriz_manobra_resolution','simuladores_matriz_guia_relink')",
    )
      .map((r: { name: string }) => r.name)
      .sort();
    expect(tables).toEqual([
      'simuladores_matriz_guia_relink',
      'simuladores_matriz_manobra_resolution',
    ]);

    // Idempotent re-apply: ledger unchanged.
    const apply2 = spawnSync(
      'npx',
      [
        '--no-install',
        'wrangler',
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--config',
        configPath,
        '--persist-to',
        stateDir,
      ],
      { cwd: WORKER_ROOT, encoding: 'utf8' },
    );
    expect(apply2.status, apply2.stderr || apply2.stdout).toBe(0);
    const namesAfter2 = wrJson('SELECT name FROM d1_migrations ORDER BY id').map(
      (r: { name: string }) => r.name,
    );
    expect(namesAfter2).toEqual(namesAfter);

    const fkAfter = wrJson('PRAGMA foreign_key_check').length;
    expect(fkAfter).toBe(fkBefore);
  }, 120_000);
});

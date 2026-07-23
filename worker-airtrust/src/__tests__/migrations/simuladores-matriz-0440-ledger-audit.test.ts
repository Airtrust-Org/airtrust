import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-ignore — pure .mjs auditor, no type declarations
import { classify0440, STATES, deriveExpectedContract, splitStatements } from '../../../scripts/lib/simuladores-matriz-0440-audit.mjs';

const ROOT = process.cwd();
const MIGRATION_PATH = join(ROOT, 'migrations/0440_simuladores_matriz_versionada_metadata.sql');
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

const PRE_0440_SCHEMA = `
PRAGMA foreign_keys=ON;
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
INSERT INTO empresas VALUES(7),(8);
INSERT INTO modelos_sessao(id,codigo,empresa_id,created_at) VALUES(10,'OLD-A',7,'2020-01-01'),(20,'OTHER',8,'2020-01-01');
INSERT INTO manobras VALUES(100,7,NULL),(101,7,NULL),(200,8,NULL);
INSERT INTO modelos_sessao_manobras VALUES
  (1,10,100,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),
  (2,10,101,2,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB'),
  (3,20,200,1,1,NULL,NULL,NULL,NULL,NULL,NULL,'AB');
`;

function sqlite(db: string, sql: string) {
  const res = spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return res.stdout;
}

function sqliteJson<T = unknown>(db: string, sql: string): T {
  const res = spawnSync('sqlite3', ['-json', db], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  const out = res.stdout.trim();
  return (out ? JSON.parse(out) : []) as T;
}

const SNAPSHOT_TABLES = [
  'modelos_sessao_manobras',
  'modelos_sessao_versionamento',
  'modelos_sessao_manobras_contexto',
  'simuladores_matriz_imports',
  'simuladores_matriz_import_changes',
];

function buildSnapshot(db: string, withInvariants = true) {
  const objects = sqliteJson<Array<{ type: string; name: string; tbl_name: string; sql: string | null }>>(
    db,
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')",
  );
  const existing = new Set(objects.filter((o) => o.type === 'table').map((o) => o.name));
  const columns: Record<string, string[]> = {};
  for (const t of SNAPSHOT_TABLES) {
    if (!existing.has(t)) continue;
    const info = sqliteJson<Array<{ name: string }>>(db, `PRAGMA table_info(${t})`);
    columns[t] = info.map((c) => c.name.toLowerCase());
  }
  const snapshot: {
    objects: typeof objects;
    columns: Record<string, string[]>;
    invariants?: Record<string, number>;
  } = { objects, columns };
  if (withInvariants) {
    snapshot.invariants = {
      duplicateCurrentVersions: 0,
      crossTenantLinks: 0,
      legacyVersionRowsMissing: 0,
      fkCheckBaseline: 0,
      fkCheckCurrent: 0,
    };
  }
  return snapshot;
}

function applied0440Db(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `0440-audit-${name}-`));
  const db = join(dir, 'test.db');
  sqlite(db, PRE_0440_SCHEMA);
  sqlite(db, `BEGIN IMMEDIATE;\n${migrationSql}\nCOMMIT;`);
  return db;
}

describe('0440 auditor — statement parsing', () => {
  it('derives every expected artifact from the migration', () => {
    const contract = deriveExpectedContract(migrationSql);
    expect(Object.keys(contract.tables).sort()).toEqual([
      'modelos_sessao_manobras_contexto',
      'modelos_sessao_versionamento',
      'simuladores_matriz_import_changes',
      'simuladores_matriz_imports',
    ]);
    expect(Object.keys(contract.indexes)).toHaveLength(10);
    expect(Object.keys(contract.triggers)).toHaveLength(18);
    expect(contract.rebuiltColumns).toContain('tripulante');
  });

  it('splits trigger bodies without breaking on inner semicolons or comment semicolons', () => {
    const stmts = splitStatements(migrationSql);
    // The big state-update trigger has a two-line comment containing a ';'.
    const stateUpdate = stmts.find((s: string) =>
      s.includes('trg_simuladores_matriz_import_state_update'),
    );
    expect(stateUpdate).toBeTruthy();
    expect(stateUpdate).toContain("RAISE(ABORT, 'transição de status da importação inválida')");
  });
});

describe('0440 auditor — four states', () => {
  const dbs: string[] = [];
  afterAll(() => {
    for (const db of dbs) rmSync(join(db, '..'), { recursive: true, force: true });
  });

  it('AUSENTE for a pristine pre-0440 schema', () => {
    const dir = mkdtempSync(join(tmpdir(), '0440-audit-ausente-'));
    const db = join(dir, 'test.db');
    dbs.push(db);
    sqlite(db, PRE_0440_SCHEMA);
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db, false) });
    expect(res.state).toBe(STATES.AUSENTE);
  });

  it('INTEGRALMENTE_APLICADA after a clean physical apply with invariants', () => {
    const db = applied0440Db('integral');
    dbs.push(db);
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.conflicts).toEqual([]);
    expect(res.missing).toEqual([]);
    expect(res.state).toBe(STATES.INTEGRALMENTE_APLICADA);
  });

  it('never INTEGRAL on versionamento existence alone (missing invariants => PARCIAL)', () => {
    const db = applied0440Db('no-invariants');
    dbs.push(db);
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db, false) });
    expect(res.state).toBe(STATES.PARCIALMENTE_APLICADA);
  });

  it('PARCIALMENTE_APLICADA when a trigger is missing', () => {
    const db = applied0440Db('missing-trigger');
    dbs.push(db);
    sqlite(db, 'DROP TRIGGER trg_modelo_versao_updated_at;');
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.state).toBe(STATES.PARCIALMENTE_APLICADA);
    expect(res.missing).toContain('trigger trg_modelo_versao_updated_at');
  });

  it('PARCIALMENTE_APLICADA when a new table is missing', () => {
    const db = applied0440Db('missing-table');
    dbs.push(db);
    // Drop dependents then the table.
    sqlite(db, 'DROP TABLE simuladores_matriz_import_changes; DROP TABLE simuladores_matriz_imports;');
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.state).toBe(STATES.PARCIALMENTE_APLICADA);
    expect(res.missing).toContain('tabela simuladores_matriz_imports');
  });

  it('CONFLITANTE when an index definition diverges', () => {
    const db = applied0440Db('divergent-index');
    dbs.push(db);
    sqlite(
      db,
      'DROP INDEX idx_modelo_versionamento_anterior; CREATE INDEX idx_modelo_versionamento_anterior ON modelos_sessao_versionamento(empresa_id);',
    );
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('idx_modelo_versionamento_anterior'))).toBe(true);
  });

  it('CONFLITANTE when a trigger body diverges', () => {
    const db = applied0440Db('divergent-trigger');
    dbs.push(db);
    sqlite(
      db,
      `DROP TRIGGER trg_modelo_versao_updated_at;
       CREATE TRIGGER trg_modelo_versao_updated_at AFTER UPDATE OF is_current ON modelos_sessao_versionamento
       FOR EACH ROW BEGIN UPDATE modelos_sessao_versionamento SET updated_at = 'tampered' WHERE modelo_id = NEW.modelo_id; END;`,
    );
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('trg_modelo_versao_updated_at'))).toBe(true);
  });

  it('CONFLITANTE when the legacy UNIQUE(modelo_id, manobra_id) survives on the links table', () => {
    // Simulate a divergent apply: new tables present, but links table still
    // carries the legacy UNIQUE constraint (rebuild did not happen).
    const db = applied0440Db('legacy-unique');
    dbs.push(db);
    const snapshot = buildSnapshot(db);
    const links = snapshot.objects.find((o) => o.type === 'table' && o.name === 'modelos_sessao_manobras')!;
    links.sql = `${links.sql!.replace(/\)\s*$/, '')}, UNIQUE(modelo_id, manobra_id))`;
    const res = classify0440({ migrationSql, snapshot });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => /UNIQUE\(modelo_id/.test(c))).toBe(true);
  });

  it('CONFLITANTE when a residual temp table remains', () => {
    const db = applied0440Db('residual-temp');
    dbs.push(db);
    sqlite(db, 'CREATE TABLE modelos_sessao_manobras_0440(id INTEGER PRIMARY KEY);');
    const res = classify0440({ migrationSql, snapshot: buildSnapshot(db) });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('modelos_sessao_manobras_0440'))).toBe(true);
  });

  it('CONFLITANTE on a new cross-tenant link', () => {
    const db = applied0440Db('cross-tenant');
    dbs.push(db);
    const snapshot = buildSnapshot(db);
    snapshot.invariants!.crossTenantLinks = 1;
    const res = classify0440({ migrationSql, snapshot });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('cross-tenant'))).toBe(true);
  });

  it('CONFLITANTE when the FK-check baseline changed', () => {
    const db = applied0440Db('fk-delta');
    dbs.push(db);
    const snapshot = buildSnapshot(db);
    snapshot.invariants!.fkCheckBaseline = 525;
    snapshot.invariants!.fkCheckCurrent = 526;
    const res = classify0440({ migrationSql, snapshot });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('foreign_key_check'))).toBe(true);
  });

  it('CONFLITANTE when a duplicate current version exists', () => {
    const db = applied0440Db('dup-current');
    dbs.push(db);
    const snapshot = buildSnapshot(db);
    snapshot.invariants!.duplicateCurrentVersions = 2;
    const res = classify0440({ migrationSql, snapshot });
    expect(res.state).toBe(STATES.CONFLITANTE);
  });

  it('CONFLITANTE when link count diverged before/after (data loss)', () => {
    const db = applied0440Db('count-drift');
    dbs.push(db);
    const snapshot = buildSnapshot(db);
    snapshot.invariants!.modelosSessaoManobrasBefore = 918;
    snapshot.invariants!.modelosSessaoManobrasAfter = 900;
    const res = classify0440({ migrationSql, snapshot });
    expect(res.state).toBe(STATES.CONFLITANTE);
    expect(res.conflicts.some((c: string) => c.includes('vínculos perdidos'))).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MIGRATION_PATH = join(ROOT, 'migrations/0449_simuladores_check_faps_reconciliacao.sql');
const ROLLBACK_PATH = join(ROOT, '..', 'docs/operations/rollbacks/0449_rollback.sql');
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

const BASE_SCHEMA = `
CREATE TABLE modelos_sessao(
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL
);
CREATE TABLE modelos_sessao_versionamento(
  modelo_id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo_canonico TEXT NOT NULL,
  is_current INTEGER NOT NULL
);
CREATE TABLE qualificacoes_tipos(
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  is_check INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  updated_at TEXT
);
CREATE TABLE modelos_sessao_checks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  deleted_at TEXT,
  UNIQUE(modelo_id, qualificacao_tipo_id)
);
`;

// A full, self-consistent tenant fixture in EXACTLY the audited
// pre-migration state: 10 check-session models (ids offset by `base`), 4
// qualification codes (ids offset by `qbase`), IFR-139 already active on
// the 4 AW139 checks and FAP06-76 already active on SK76-P-CHECK (the two
// "already correct, never touched" invariants), and nothing else.
function tenantFixtureSql(empresaId: number, base: number, qbase: number): string {
  const roles: Array<[string, string]> = [
    ['AW_INI', 'A139-I-12/12'],
    ['AW_PER_C1', 'A139-P-04/04-C1-CHECK'],
    ['AW_PER_C2', 'A139-P-04/04-C2-CHECK'],
    ['AW_PER_C3', 'A139-P-04/04-C3-CHECK'],
    ['AW_SEM_C1', 'A139-S-02/02-C1'],
    ['AW_SEM_C2', 'A139-S-02/02-C2'],
    ['AW_SEM_C3', 'A139-S-02/02-C3'],
    ['SK_INI', 'SK76-I-12/12'],
    ['SK_PER', 'SK76-P-CHECK'],
    ['SK_SEM', 'SK76-S-02/02'],
  ];
  const modelIds: Record<string, number> = {};
  roles.forEach(([role], i) => {
    modelIds[role] = base + i;
  });
  const quals = {
    AW_FAP06: qbase + 1,
    AW_IFR: qbase + 2,
    SK_FAP06: qbase + 3,
    SK_IFR: qbase + 4,
  };

  const modelRows = roles.map((_, i) => `(${base + i}, ${empresaId})`).join(',\n    ');
  const versionRows = roles
    .map(([, codigo], i) => `(${base + i}, ${empresaId}, '${codigo}', 1)`)
    .join(',\n    ');

  return `
INSERT INTO modelos_sessao (id, empresa_id) VALUES
    ${modelRows};
INSERT INTO modelos_sessao_versionamento (modelo_id, empresa_id, codigo_canonico, is_current) VALUES
    ${versionRows};
INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, is_check) VALUES
    (${quals.AW_FAP06}, ${empresaId}, 'FAP6-139', 0),
    (${quals.AW_IFR}, ${empresaId}, 'IFR-139', 1),
    (${quals.SK_FAP06}, ${empresaId}, 'FAP06-76', 1),
    (${quals.SK_IFR}, ${empresaId}, 'IFR-SK76', 0);
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES
    (${modelIds.AW_INI}, ${quals.AW_IFR}),
    (${modelIds.AW_PER_C1}, ${quals.AW_IFR}),
    (${modelIds.AW_PER_C2}, ${quals.AW_IFR}),
    (${modelIds.AW_PER_C3}, ${quals.AW_IFR}),
    (${modelIds.AW_SEM_C1}, ${quals.AW_IFR}),
    (${modelIds.AW_SEM_C2}, ${quals.AW_IFR}),
    (${modelIds.AW_SEM_C3}, ${quals.AW_IFR}),
    (${modelIds.SK_PER}, ${quals.SK_FAP06});
`;
}

const IDS = {
  AW_INI: 1,
  AW_PER_C1: 2,
  AW_PER_C2: 3,
  AW_PER_C3: 4,
  AW_SEM_C1: 5,
  AW_SEM_C2: 6,
  AW_SEM_C3: 7,
  SK_INI: 8,
  SK_PER: 9,
  SK_SEM: 10,
};
const QUALS = { AW_FAP06: 101, AW_IFR: 102, SK_FAP06: 103, SK_IFR: 104 };

function setupDb(extraSql = ''): string {
  const db = dbPath('setup');
  const sql = BASE_SCHEMA + tenantFixtureSql(6, 1, 100) + extraSql;
  const result = run(db, sql);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return db;
}

function countRows(db: string): { links: number; checks: number } {
  return queryJson<Array<{ links: number; checks: number }>>(
    db,
    `SELECT (SELECT COUNT(*) FROM modelos_sessao_checks) as links,
            (SELECT COUNT(*) FROM qualificacoes_tipos WHERE is_check = 1) as checks;`,
  )[0];
}

describe('migration 0449 — check FAP reconciliation (fail-closed, exact baseline only)', () => {
  it('1. applies cleanly against exactly the audited pre-migration baseline', () => {
    const db = setupDb();
    const result = run(db, migration);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const rows = queryJson<Array<{ id: number; is_check: number }>>(
      db,
      'SELECT id, is_check FROM qualificacoes_tipos ORDER BY id;',
    );
    expect(rows).toEqual([
      { id: QUALS.AW_FAP06, is_check: 1 },
      { id: QUALS.AW_IFR, is_check: 1 },
      { id: QUALS.SK_FAP06, is_check: 1 },
      { id: QUALS.SK_IFR, is_check: 1 },
    ]);

    const links = queryJson<Array<{ modelo_id: number; qualificacao_tipo_id: number }>>(
      db,
      `SELECT modelo_id, qualificacao_tipo_id FROM modelos_sessao_checks
       ORDER BY modelo_id, qualificacao_tipo_id;`,
    );
    expect(links).toEqual([
      { modelo_id: IDS.AW_INI, qualificacao_tipo_id: QUALS.AW_FAP06 },
      { modelo_id: IDS.AW_INI, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_PER_C1, qualificacao_tipo_id: QUALS.AW_FAP06 },
      { modelo_id: IDS.AW_PER_C1, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_PER_C2, qualificacao_tipo_id: QUALS.AW_FAP06 },
      { modelo_id: IDS.AW_PER_C2, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_PER_C3, qualificacao_tipo_id: QUALS.AW_FAP06 },
      { modelo_id: IDS.AW_PER_C3, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_SEM_C1, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_SEM_C2, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.AW_SEM_C3, qualificacao_tipo_id: QUALS.AW_IFR },
      { modelo_id: IDS.SK_INI, qualificacao_tipo_id: QUALS.SK_FAP06 },
      { modelo_id: IDS.SK_INI, qualificacao_tipo_id: QUALS.SK_IFR },
      { modelo_id: IDS.SK_PER, qualificacao_tipo_id: QUALS.SK_FAP06 },
      { modelo_id: IDS.SK_PER, qualificacao_tipo_id: QUALS.SK_IFR },
      { modelo_id: IDS.SK_SEM, qualificacao_tipo_id: QUALS.SK_IFR },
    ]);
  });

  describe('2. any of the 8 target links already active aborts', () => {
    const targets: Array<[string, number, number]> = [
      ['AW_INI + FAP6-139', IDS.AW_INI, QUALS.AW_FAP06],
      ['AW_PER_C1 + FAP6-139', IDS.AW_PER_C1, QUALS.AW_FAP06],
      ['AW_PER_C2 + FAP6-139', IDS.AW_PER_C2, QUALS.AW_FAP06],
      ['AW_PER_C3 + FAP6-139', IDS.AW_PER_C3, QUALS.AW_FAP06],
      ['SK_INI + FAP06-76', IDS.SK_INI, QUALS.SK_FAP06],
      ['SK_INI + IFR-SK76', IDS.SK_INI, QUALS.SK_IFR],
      ['SK_PER + IFR-SK76', IDS.SK_PER, QUALS.SK_IFR],
      ['SK_SEM + IFR-SK76', IDS.SK_SEM, QUALS.SK_IFR],
    ];
    for (const [label, modeloId, qualId] of targets) {
      it(`aborts when ${label} is already active`, () => {
        const db = setupDb(
          `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${modeloId}, ${qualId});`,
        );
        const before = countRows(db);
        const result = run(db, migration);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('migration ja aplicada ou estado divergente');
        expect(countRows(db)).toEqual(before);
      });
    }
  });

  it('3. aborts on a soft-deleted link for a target pair instead of silently reactivating or duplicating it', () => {
    const db = setupDb(
      `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id, deleted_at) VALUES (${IDS.SK_INI}, ${QUALS.SK_IFR}, '2026-01-01');`,
    );
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('soft-deleted');

    const rows = queryJson<Array<{ deleted_at: string | null }>>(
      db,
      `SELECT deleted_at FROM modelos_sessao_checks WHERE modelo_id = ${IDS.SK_INI} AND qualificacao_tipo_id = ${QUALS.SK_IFR};`,
    );
    expect(rows).toEqual([{ deleted_at: '2026-01-01' }]);
  });

  it('4. aborts if FAP6-139.is_check is already 1', () => {
    const db = setupDb(`UPDATE qualificacoes_tipos SET is_check = 1 WHERE id = ${QUALS.AW_FAP06};`);
    const before = countRows(db);
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('migration ja aplicada ou estado divergente');
    expect(result.stderr).toContain('FAP6-139');
    expect(countRows(db)).toEqual(before);
  });

  it('5. aborts if IFR-SK76.is_check is already 1', () => {
    const db = setupDb(`UPDATE qualificacoes_tipos SET is_check = 1 WHERE id = ${QUALS.SK_IFR};`);
    const before = countRows(db);
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('migration ja aplicada ou estado divergente');
    expect(result.stderr).toContain('IFR-SK76');
    expect(countRows(db)).toEqual(before);
  });

  it('6. aborts on a partially-applied state (2 of 4 FAP6-139 links already present) rather than completing it', () => {
    const db = setupDb(
      `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES
       (${IDS.AW_INI}, ${QUALS.AW_FAP06}), (${IDS.AW_PER_C1}, ${QUALS.AW_FAP06});`,
    );
    const before = countRows(db);
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('migration ja aplicada ou estado divergente');
    expect(countRows(db)).toEqual(before);
  });

  it('7. a second manual run after a clean apply aborts with zero additional writes', () => {
    const db = setupDb();
    const first = run(db, migration);
    expect(first.status, first.stderr || first.stdout).toBe(0);

    const after = countRows(db);
    const second = run(db, migration);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('migration ja aplicada ou estado divergente');
    expect(countRows(db)).toEqual(after);
  });

  it('8. aborts rather than guessing when two tenants both match the full fingerprint (ambiguous scope fails closed)', () => {
    const db = dbPath('ambiguous-tenant');
    const sql = BASE_SCHEMA + tenantFixtureSql(6, 1, 100) + tenantFixtureSql(7, 1000, 2000);
    expect(run(db, sql).status).toBe(0);

    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('tenant nao resolvido de forma unica');
  });

  describe('9. cross-aircraft contamination aborts', () => {
    it('aborts if an AW139 model is already (incorrectly) linked to a SK76-only FAP', () => {
      const db = setupDb(
        `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.AW_SEM_C1}, ${QUALS.SK_IFR});`,
      );
      const result = run(db, migration);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('cross-aircraft');
    });

    it('aborts if a SK76 model is already (incorrectly) linked to an AW139-only FAP', () => {
      const db = setupDb(
        `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.SK_SEM}, ${QUALS.AW_IFR});`,
      );
      const result = run(db, migration);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('cross-aircraft');
    });
  });

  it('aborts if FAP06 is already (incorrectly) active on a semestral check', () => {
    const db = setupDb(
      `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.AW_SEM_C1}, ${QUALS.AW_FAP06});`,
    );
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('estado proibido');
  });

  it('aborts if the assumed pre-existing IFR-139 baseline is missing (environment drifted from what this fix assumes)', () => {
    const db = dbPath('missing-baseline');
    const sql = BASE_SCHEMA + tenantFixtureSql(6, 1, 100).replace(
      `    (${IDS.AW_PER_C3}, ${QUALS.AW_IFR}),\n`,
      '',
    );
    expect(run(db, sql).status).toBe(0);

    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('baseline pre-existente');
  });

  it('12. resolves by evidence, not by a hardcoded literal: a differently-numbered tenant is fixed the same way', () => {
    const db = dbPath('shifted-ids');
    const sql = BASE_SCHEMA + tenantFixtureSql(42, 1000, 2000);
    expect(run(db, sql).status).toBe(0);

    const result = run(db, migration);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const linkCount = queryJson<Array<{ n: number }>>(
      db,
      'SELECT COUNT(*) as n FROM modelos_sessao_checks;',
    )[0].n;
    expect(linkCount).toBe(16);
  });

  it('13. does not touch a second tenant with the same qualification codes but not the full check-model fingerprint', () => {
    const db = dbPath('multi-tenant');
    const sql =
      BASE_SCHEMA +
      tenantFixtureSql(6, 1, 100) +
      `
      INSERT INTO modelos_sessao (id, empresa_id) VALUES (501, 7), (502, 7);
      INSERT INTO modelos_sessao_versionamento (modelo_id, empresa_id, codigo_canonico, is_current) VALUES
        (501, 7, 'A139-I-12/12', 1), (502, 7, 'SK76-P-CHECK', 1);
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, is_check) VALUES
        (601, 7, 'FAP6-139', 0), (602, 7, 'IFR-139', 1), (603, 7, 'FAP06-76', 1), (604, 7, 'IFR-SK76', 0);
      `;
    expect(run(db, sql).status).toBe(0);

    const result = run(db, migration);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const tenant7 = queryJson<Array<{ codigo: string; is_check: number }>>(
      db,
      `SELECT codigo, is_check FROM qualificacoes_tipos WHERE empresa_id = 7 AND codigo IN ('FAP6-139','IFR-SK76') ORDER BY codigo;`,
    );
    expect(tenant7).toEqual([
      { codigo: 'FAP6-139', is_check: 0 },
      { codigo: 'IFR-SK76', is_check: 0 },
    ]);
    const tenant7Links = queryJson<Array<{ n: number }>>(
      db,
      `SELECT COUNT(*) as n FROM modelos_sessao_checks WHERE modelo_id IN (501, 502);`,
    )[0].n;
    expect(tenant7Links).toBe(0);

    const tenant6 = queryJson<Array<{ codigo: string; is_check: number }>>(
      db,
      `SELECT codigo, is_check FROM qualificacoes_tipos WHERE empresa_id = 6 AND codigo IN ('FAP6-139','IFR-SK76') ORDER BY codigo;`,
    );
    expect(tenant6).toEqual([
      { codigo: 'FAP6-139', is_check: 1 },
      { codigo: 'IFR-SK76', is_check: 1 },
    ]);
  });

  describe('10 & 11. rollback', () => {
    it('reverses every write exactly, back to the pre-migration fixture', () => {
      const db = setupDb();
      run(db, migration);
      const rollbackResult = run(db, rollback);
      expect(rollbackResult.status, rollbackResult.stderr || rollbackResult.stdout).toBe(0);

      const isCheckRows = queryJson<Array<{ id: number; is_check: number }>>(
        db,
        `SELECT id, is_check FROM qualificacoes_tipos WHERE id IN (${QUALS.AW_FAP06}, ${QUALS.SK_IFR}) ORDER BY id;`,
      );
      expect(isCheckRows).toEqual([
        { id: QUALS.AW_FAP06, is_check: 0 },
        { id: QUALS.SK_IFR, is_check: 0 },
      ]);

      const remainingLinks = queryJson<Array<{ modelo_id: number; qualificacao_tipo_id: number }>>(
        db,
        `SELECT modelo_id, qualificacao_tipo_id FROM modelos_sessao_checks ORDER BY modelo_id, qualificacao_tipo_id;`,
      );
      expect(remainingLinks).toEqual([
        { modelo_id: IDS.AW_INI, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_PER_C1, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_PER_C2, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_PER_C3, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_SEM_C1, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_SEM_C2, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.AW_SEM_C3, qualificacao_tipo_id: QUALS.AW_IFR },
        { modelo_id: IDS.SK_PER, qualificacao_tipo_id: QUALS.SK_FAP06 },
      ]);
    });

    it('aborts instead of rolling back if a new legitimate link was added since the migration ran (drift)', () => {
      const db = setupDb();
      run(db, migration);

      // Someone legitimately linked FAP6-139 to a model this migration
      // never touched — changes the tenant-wide count the rollback's
      // invariant checks against.
      run(
        db,
        `INSERT INTO modelos_sessao (id, empresa_id) VALUES (999, 6);
         INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (999, ${QUALS.AW_FAP06});`,
      );

      const rollbackResult = run(db, rollback);
      expect(rollbackResult.status).not.toBe(0);
      expect(rollbackResult.stderr).toContain('drift');
    });

    it('aborts if run before the migration ever applied (nothing to roll back)', () => {
      const db = setupDb();
      const rollbackResult = run(db, rollback);
      expect(rollbackResult.status).not.toBe(0);
      expect(rollbackResult.stderr).toContain('nada a reverter');
    });
  });
});

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

// A full, self-consistent tenant fixture: 10 check-session models (ids
// offset by `base`), 4 qualification codes (ids offset by `qbase`), IFR-139
// already active on the 4 AW139 checks and FAP06-76 already active on
// SK76-P-CHECK (the two "already correct, never touched" invariants), and
// nothing else — i.e. exactly the audited pre-migration production state.
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

  const modelRows = roles
    .map(([, codigo], i) => `(${base + i}, ${empresaId})`)
    .join(',\n    ');
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

const IDS = { AW_INI: 1, AW_PER_C1: 2, AW_PER_C2: 3, AW_PER_C3: 4, AW_SEM_C1: 5, AW_SEM_C2: 6, AW_SEM_C3: 7, SK_INI: 8, SK_PER: 9, SK_SEM: 10 };
const QUALS = { AW_FAP06: 101, AW_IFR: 102, SK_FAP06: 103, SK_IFR: 104 };

function setupDb(extraSql = ''): string {
  const db = dbPath('setup');
  const sql = BASE_SCHEMA + tenantFixtureSql(6, 1, 100) + extraSql;
  const result = run(db, sql);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return db;
}

describe('migration 0449 — check FAP reconciliation (resolved by code, not by ID)', () => {
  it('flips is_check to 1 for FAP6-139 and IFR-SK76 only', () => {
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
  });

  it('adds FAP06+IFR per the canonical rule and nothing to semestral', () => {
    const db = setupDb();
    run(db, migration);

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

  it('is truly idempotent: a second run succeeds and performs zero writes', () => {
    const db = setupDb();
    const first = run(db, migration);
    expect(first.status, first.stderr || first.stdout).toBe(0);

    const before = queryJson(
      db,
      `SELECT (SELECT COUNT(*) FROM modelos_sessao_checks) as links,
              (SELECT COUNT(*) FROM qualificacoes_tipos WHERE is_check = 1) as checks;`,
    );

    const second = run(db, migration);
    expect(second.status, second.stderr || second.stdout).toBe(0);

    const after = queryJson(
      db,
      `SELECT (SELECT COUNT(*) FROM modelos_sessao_checks) as links,
              (SELECT COUNT(*) FROM qualificacoes_tipos WHERE is_check = 1) as checks;`,
    );
    expect(after).toEqual(before);
  });

  it('resolves the tenant by evidence, not by a hardcoded literal: a differently-numbered tenant is fixed the same way', () => {
    // Same shape, but every id is offset by +1000 and empresa_id is 42
    // instead of 6 — proves nothing in the migration depends on the
    // specific IDs seen during the production audit.
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

  describe('multi-tenant safety', () => {
    it('does not touch a second tenant that has the same qualification codes but not the full check-model fingerprint', () => {
      const db = dbPath('multi-tenant');
      // Tenant 6: the full, fixable fixture. Tenant 7: same qualification
      // codes (realistic — every tenant names its FAPs the same way) but
      // only a couple of the 10 check-session models, so it can never be
      // mistaken for "the" tenant to fix.
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

      // Tenant 7's data is completely untouched: still is_check=0/0 and no links.
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

      // Tenant 6 got fixed as normal.
      const tenant6 = queryJson<Array<{ codigo: string; is_check: number }>>(
        db,
        `SELECT codigo, is_check FROM qualificacoes_tipos WHERE empresa_id = 6 AND codigo IN ('FAP6-139','IFR-SK76') ORDER BY codigo;`,
      );
      expect(tenant6).toEqual([
        { codigo: 'FAP6-139', is_check: 1 },
        { codigo: 'IFR-SK76', is_check: 1 },
      ]);
    });

    it('aborts rather than guessing when two tenants both match the full fingerprint (ambiguous scope fails closed)', () => {
      const db = dbPath('ambiguous-tenant');
      const sql = BASE_SCHEMA + tenantFixtureSql(6, 1, 100) + tenantFixtureSql(7, 1000, 2000);
      expect(run(db, sql).status).toBe(0);

      const result = run(db, migration);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('tenant nao resolvido de forma unica');
    });
  });

  describe('cross-aircraft safety', () => {
    it('aborts if an AW139 model is already (incorrectly) linked to a SK76-only FAP', () => {
      const db = setupDb(
        `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.AW_INI}, ${QUALS.SK_IFR});`,
      );
      const result = run(db, migration);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('cross-aircraft');
    });

    it('aborts if a SK76 model is already (incorrectly) linked to an AW139-only FAP', () => {
      const db = setupDb(
        `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.SK_PER}, ${QUALS.AW_FAP06});`,
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

  it('aborts on a soft-deleted link for a target pair instead of silently reactivating or duplicating it', () => {
    const db = setupDb(
      `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id, deleted_at) VALUES (${IDS.SK_INI}, ${QUALS.SK_IFR}, '2026-01-01');`,
    );
    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('soft-deleted');

    // Prove nothing was silently reactivated or duplicated.
    const rows = queryJson<Array<{ deleted_at: string | null }>>(
      db,
      `SELECT deleted_at FROM modelos_sessao_checks WHERE modelo_id = ${IDS.SK_INI} AND qualificacao_tipo_id = ${QUALS.SK_IFR};`,
    );
    expect(rows).toEqual([{ deleted_at: '2026-01-01' }]);
  });

  it('aborts if the assumed pre-existing IFR-139 baseline is missing (environment drifted from what this fix assumes)', () => {
    const db = dbPath('missing-baseline');
    const sql =
      BASE_SCHEMA +
      tenantFixtureSql(6, 1, 100).replace(
        `    (${IDS.AW_PER_C3}, ${QUALS.AW_IFR}),\n`,
        '',
      );
    expect(run(db, sql).status).toBe(0);

    const result = run(db, migration);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('IFR-139 nao esta ativo');
  });

  it('completes a partially-applied additive fix (self-healing on its own writes, not a drift condition)', () => {
    // 2 of the 4 FAP06 links already present from an interrupted prior
    // run; the migration should finish the job rather than treat this as
    // an unrecoverable drift, since these are its own additive writes.
    const db = setupDb(
      `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES
       (${IDS.AW_INI}, ${QUALS.AW_FAP06}), (${IDS.AW_PER_C1}, ${QUALS.AW_FAP06});`,
    );
    const result = run(db, migration);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const links = queryJson<Array<{ n: number }>>(
      db,
      `SELECT COUNT(*) as n FROM modelos_sessao_checks WHERE qualificacao_tipo_id = ${QUALS.AW_FAP06};`,
    )[0].n;
    expect(links).toBe(4);
  });

  describe('rollback', () => {
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

      // Someone (a human, or another workflow) legitimately linked FAP6-139
      // to a model this migration never touched.
      run(
        db,
        `INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id) VALUES (${IDS.AW_SEM_C1 + 5000}, ${QUALS.AW_FAP06});`,
      );
      // (the row above references a nonexistent modelo_id on purpose — it
      // only needs to exist in modelos_sessao_checks to change the count
      // the rollback's invariant checks against)

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

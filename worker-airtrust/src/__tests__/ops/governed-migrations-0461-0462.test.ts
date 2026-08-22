import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { buildLedgerAppliedSql } from '../../../scripts/lib/migration-remote-apply.mjs';
import {
  MIGRATION_0461,
  MIGRATION_0462,
  assertSequentialOrder,
  evaluate0461,
  evaluate0462,
} from '../../../../scripts/staging/lib/governed-migration-0461-0462-contract.mjs';

const ROOT = join(__dirname, '../../../..');
const migration0461 = readFileSync(join(ROOT, 'worker-airtrust/migrations', MIGRATION_0461), 'utf8');
const migration0462 = readFileSync(join(ROOT, 'worker-airtrust/migrations', MIGRATION_0462), 'utf8');

function sql(db: string, statement: string) {
  const result = spawnSync('sqlite3', [db], { input: statement, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function metadata(db: string, table: string) {
  return {
    tables: sql(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").trim().split('\n').filter(Boolean),
    columns: JSON.parse(sql(db, `SELECT json_group_array(json_object('name',name,'type',type,'notnull',"notnull")) FROM pragma_table_info('${table}')`) || '[]'),
    indexes: JSON.parse(sql(db, `SELECT json_group_array(json_object('name',name,'sql',sql)) FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`) || '[]'),
    ledgerNames: sql(db, 'SELECT name FROM d1_migrations ORDER BY name').trim().split('\n').filter(Boolean),
  };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-governed-046x-'));
  const db = join(dir, 'governance.sqlite');
  sql(db, `
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT, revoked_at TEXT);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL COLLATE NOCASE, deleted_at TEXT);
    CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
  `);
  return { dir, db };
}

function setupKnownLegacyBaseline() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-governed-0462-legacy-'));
  const db = join(dir, 'governance.sqlite');
  sql(db, `
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT, revoked_at TEXT);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, codigo TEXT NOT NULL COLLATE NOCASE,
      nome TEXT NOT NULL, descricao TEXT, categoria TEXT, carga_horaria REAL,
      carga_horaria_inicial REAL, carga_horaria_recorrente REAL, conteudo_programatico TEXT,
      validade INTEGER, vencimento_fim_mes INTEGER DEFAULT 0, observacoes TEXT,
      ativo INTEGER DEFAULT 1, is_check INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL, empresa_id INTEGER NOT NULL, formato_id INTEGER,
      categoria_id INTEGER, classe_requisito TEXT, dominio_codigo TEXT
    );
    CREATE INDEX idx_qualificacoes_tipos_ativo ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;
    CREATE INDEX idx_qualificacoes_tipos_deleted_at ON qualificacoes_tipos(deleted_at);
    CREATE INDEX idx_qualificacoes_tipos_empresa ON qualificacoes_tipos(empresa_id);
    CREATE INDEX idx_qt_formato ON qualificacoes_tipos(formato_id, empresa_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_qt_categoria_id ON qualificacoes_tipos(categoria_id, empresa_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_qualificacoes_tipos_dominio_codigo ON qualificacoes_tipos(dominio_codigo);
  `);
  return { dir, db };
}

function applyWithLedger(db: string, migration: string, name: string) {
  sql(db, buildLedgerAppliedSql({ migrationSql: migration, migrationName: name }));
}

describe('governed staging migrations 0461/0462', () => {
  it('0461 transitions a valid legacy schema from PENDING to ledger-confirmed ALREADY_APPLIED and revokes legacy rows', () => {
    const { dir, db } = setup();
    try {
      sql(db, "INSERT INTO refresh_tokens (id,user_id,token,revoked_at) VALUES (1,7,'legacy',NULL)");
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('PENDING');
      applyWithLedger(db, migration0461, MIGRATION_0461);
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('ALREADY_APPLIED');
      expect(sql(db, 'SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE id=1').trim()).toBe('1');
      // A retry is idempotent at the governed executor boundary: it observes
      // ALREADY_APPLIED and must not re-submit ALTER TABLE.
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('ALREADY_APPLIED');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('0461 fails closed for partial, unexpected, and ledger-divergent states', () => {
    const { dir, db } = setup();
    try {
      sql(db, 'ALTER TABLE refresh_tokens ADD COLUMN empresa_id INTEGER');
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('PARTIALLY_APPLIED');
      sql(db, 'CREATE INDEX idx_refresh_tokens_empresa ON refresh_tokens(empresa_id); INSERT INTO d1_migrations(name) VALUES (\'' + MIGRATION_0461 + '\')');
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('ALREADY_APPLIED');
      sql(db, 'DELETE FROM d1_migrations');
      expect(evaluate0461(metadata(db, 'refresh_tokens')).state).toBe('PARTIALLY_APPLIED');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('0462 permits the same active CMA in two tenants, rejects same-tenant case variants, and permits soft-delete/recreate', () => {
    const { dir, db } = setup();
    try {
      applyWithLedger(db, migration0461, MIGRATION_0461);
      sql(db, "INSERT INTO qualificacoes_tipos (empresa_id,codigo) VALUES (1,'CMA')");
      const before = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...before, activeDuplicateCount: 0 }).state).toBe('PENDING');
      assertSequentialOrder(MIGRATION_0462, before.ledgerNames, evaluate0461(metadata(db, 'refresh_tokens')));
      applyWithLedger(db, migration0462, MIGRATION_0462);
      const after = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...after, activeDuplicateCount: 0 }).state).toBe('ALREADY_APPLIED');
      sql(db, "INSERT INTO qualificacoes_tipos (empresa_id,codigo) VALUES (2,'CMA')");
      expect(() => sql(db, "INSERT INTO qualificacoes_tipos (empresa_id,codigo) VALUES (1,'cma')")).toThrow();
      sql(db, "UPDATE qualificacoes_tipos SET deleted_at=datetime('now') WHERE empresa_id=1 AND codigo='CMA'");
      sql(db, "INSERT INTO qualificacoes_tipos (empresa_id,codigo) VALUES (1,'cma')");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('0462 fails closed for duplicate data, residual global uniqueness, partial schema, and missing 0461 order', () => {
    const { dir, db } = setup();
    try {
      const before = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...before, activeDuplicateCount: 1 }).state).toBe('MIGRATION_DATA_PRECONDITION_FAILURE');
      expect(() => assertSequentialOrder(MIGRATION_0462, before.ledgerNames, { state: 'PENDING' })).toThrow('MIGRATION_ORDER_VIOLATION');
      sql(db, 'CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo_empresa_active ON qualificacoes_tipos(empresa_id, codigo COLLATE NOCASE) WHERE deleted_at IS NULL');
      expect(evaluate0462({ ...metadata(db, 'qualificacoes_tipos'), activeDuplicateCount: 0 }).state).toBe('PARTIALLY_APPLIED');
      sql(db, 'DROP INDEX idx_qualificacoes_tipos_codigo; DROP INDEX idx_qualificacoes_tipos_codigo_empresa_active');
      expect(evaluate0462({ ...metadata(db, 'qualificacoes_tipos'), activeDuplicateCount: 0 }).state).toBe('UNEXPECTED_SCHEMA');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('0462 recognizes only the exact 20260701 schema-only baseline fingerprint and otherwise fails closed', () => {
    const { dir, db } = setupKnownLegacyBaseline();
    try {
      let before = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...before, activeDuplicateCount: 0 }).state).toBe('PENDING');
      expect(evaluate0462({ ...before, activeDuplicateCount: 0 }).state).toBe('PENDING');
      expect(() => assertSequentialOrder(MIGRATION_0462, before.ledgerNames, { state: 'PENDING' })).toThrow('MIGRATION_ORDER_VIOLATION');
      applyWithLedger(db, migration0461, MIGRATION_0461);
      before = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...before, activeDuplicateCount: 0 }).state).toBe('PENDING');
      assertSequentialOrder(MIGRATION_0462, before.ledgerNames, evaluate0461(metadata(db, 'refresh_tokens')));

      sql(db, "INSERT INTO qualificacoes_tipos (empresa_id,codigo,nome) VALUES (1,'CMA','CMA'),(1,'cma','CMA duplicate')");
      expect(evaluate0462({ ...metadata(db, 'qualificacoes_tipos'), activeDuplicateCount: 1 }).state).toBe('MIGRATION_DATA_PRECONDITION_FAILURE');
      sql(db, 'DELETE FROM qualificacoes_tipos');

      sql(db, 'CREATE INDEX idx_unknown_missing_index_state ON qualificacoes_tipos(nome)');
      before = metadata(db, 'qualificacoes_tipos');
      expect(evaluate0462({ ...before, activeDuplicateCount: 0 }).state).toBe('UNEXPECTED_SCHEMA');
      sql(db, 'DROP INDEX idx_unknown_missing_index_state');

      sql(db, 'DROP INDEX idx_qt_formato; CREATE INDEX idx_qt_formato ON qualificacoes_tipos(empresa_id, formato_id) WHERE deleted_at IS NULL');
      expect(evaluate0462({ ...metadata(db, 'qualificacoes_tipos'), activeDuplicateCount: 0 }).state).toBe('UNEXPECTED_SCHEMA');
      sql(db, 'DROP INDEX idx_qt_formato; CREATE INDEX idx_qt_formato ON qualificacoes_tipos(formato_id, empresa_id) WHERE deleted_at IS NULL');

      sql(db, "INSERT INTO d1_migrations(name) VALUES ('0462_qualificacoes_tipos_codigo_tenant_active_unique.sql')");
      expect(evaluate0462({ ...metadata(db, 'qualificacoes_tipos'), activeDuplicateCount: 0 }).state).toBe('PARTIALLY_APPLIED');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps the executor allowlisted, ledger-atomic, ordered, and backed by read-only validators', () => {
    const runner = readFileSync(join(ROOT, 'scripts/staging/apply-approved-migration-with-recovery-point.sh'), 'utf8');
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');
    for (const file of [MIGRATION_0461, MIGRATION_0462]) expect(runner).toContain(file);
    expect(runner).toContain('preflight-0461-0462.mjs');
    expect(runner).toContain('buildLedgerAppliedSql');
    expect(runner).toContain('validate-0461-postconditions.sh');
    expect(runner).toContain('validate-0462-postconditions.sh');
    expect(workflow).toContain('0461_refresh_tokens_empresa_id.sql 0462_qualificacoes_tipos_codigo_tenant_active_unique.sql');
    expect(workflow).toContain('apply-approved-migration-with-recovery-point.sh');
    expect(readFileSync(join(ROOT, 'docs/ops/staging-migrations-0461-0462-governance.md'), 'utf8')).toContain('RESTORE_REQUIRED');
    const contract = readFileSync(join(ROOT, 'scripts/staging/lib/governed-migration-0461-0462-contract.mjs'), 'utf8');
    for (const state of ['ALREADY_APPLIED', 'PENDING', 'PARTIALLY_APPLIED', 'UNEXPECTED_SCHEMA', 'NOT_VERIFIABLE']) {
      expect(contract).toContain(state);
    }
    for (const validator of ['validate-0461-postconditions.sh', 'validate-0462-postconditions.sh']) {
      const source = readFileSync(join(ROOT, 'scripts/staging', validator), 'utf8');
      expect(source).toContain('airtrust-db-staging-baseline-20260701');
      expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
    }
  });
});

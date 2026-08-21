import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe, it } from 'node:test';
import { sqliteExecutor } from '../production/lib/executors.mjs';
import {
  auditPostconditions,
  discoverLedgerSchema,
  getLedgerCount,
  planLedgerWrites,
  reconcile0461To0463,
  RECONCILIATION_TARGET_MIGRATIONS,
} from '../production/lib/ledger-0461-0463-reconciler.mjs';

function withTempDb(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-reconcile-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  try {
    // Create base tables
    execSync(`sqlite3 "${dbPath}" << 'EOF'
CREATE TABLE d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE refresh_tokens(
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  token TEXT,
  expires_at TEXT,
  created_at TEXT,
  revoked_at TEXT
);
CREATE TABLE qualificacoes_tipos(
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  codigo TEXT,
  nome TEXT,
  deleted_at TEXT
);
EOF`);
    const executor = sqliteExecutor(dbPath);
    return callback(executor, dbPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('0461-0463 Ledger Reconciler Unit Tests', () => {
  it('discovers d1_migrations schema properly', () => {
    withTempDb((executor) => {
      const schema = discoverLedgerSchema(executor);
      assert.ok(Array.isArray(schema.columns));
      assert.ok(schema.columns.some((c) => c.name === 'name'));
      assert.ok(schema.columns.some((c) => c.name === 'applied_at'));
    });
  });

  it('fails audit when postconditions are not met (fresh baseline)', () => {
    withTempDb((executor) => {
      const audit = auditPostconditions(executor);
      assert.strictEqual(audit.ok, false);
      assert.ok(audit.errors.length > 0);
      assert.strictEqual(audit.details['0461'].state, 'INCOMPLETA');
      assert.strictEqual(audit.details['0462'].state, 'INCOMPLETA');
      assert.strictEqual(audit.details['0463'].state, 'INCOMPLETA');
    });
  });

  it('passes audit and reconciles when postconditions are met', () => {
    withTempDb((executor) => {
      // Apply physical schema changes for 0461, 0462, 0463
      executor.exec(`
        ALTER TABLE refresh_tokens ADD COLUMN empresa_id INTEGER;
        CREATE INDEX idx_refresh_tokens_empresa ON refresh_tokens(empresa_id);

        CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo_empresa_active
          ON qualificacoes_tipos(empresa_id, codigo COLLATE NOCASE)
          WHERE deleted_at IS NULL;

        CREATE TABLE frms_regulatory_profiles (
          id TEXT PRIMARY KEY,
          empresa_id INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          effective_from TEXT,
          effective_to TEXT
        );
        CREATE INDEX idx_frms_reg_profiles_empresa_effective
          ON frms_regulatory_profiles (empresa_id, active, effective_from, effective_to);

        CREATE TABLE frms_location_catalog (
          id TEXT PRIMARY KEY,
          empresa_id INTEGER NOT NULL,
          location_code TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );
        CREATE UNIQUE INDEX idx_frms_location_catalog_empresa_code_active
          ON frms_location_catalog (empresa_id, location_code)
          WHERE active = 1 AND deleted_at IS NULL;

        CREATE TABLE frms_jornada_avaliacoes (
          id TEXT PRIMARY KEY,
          empresa_id INTEGER NOT NULL,
          jornada_id TEXT NOT NULL,
          overall_level TEXT,
          calculated_at TEXT,
          deleted_at TEXT
        );
        CREATE INDEX idx_frms_jornada_avaliacoes_empresa_jornada
          ON frms_jornada_avaliacoes (empresa_id, jornada_id, deleted_at);
        CREATE INDEX idx_frms_jornada_avaliacoes_empresa_level
          ON frms_jornada_avaliacoes (empresa_id, overall_level, calculated_at);
      `);

      // 1. Dry run
      const dryResult = reconcile0461To0463({ executor, apply: false });
      assert.strictEqual(dryResult.ok, true);
      assert.strictEqual(dryResult.wrote, false);
      assert.strictEqual(dryResult.plannedWrites.length, 3);

      // Ledger still 0
      for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
        assert.strictEqual(getLedgerCount(executor, m.name), 0);
      }

      // 2. Apply run
      const applyResult = reconcile0461To0463({ executor, apply: true });
      assert.strictEqual(applyResult.ok, true);
      assert.strictEqual(applyResult.wrote, true);
      for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
        assert.strictEqual(applyResult.finalCounts[m.name], 1);
        assert.strictEqual(getLedgerCount(executor, m.name), 1);
      }

      // 3. Second apply run (Idempotent / No extra writes)
      const secondRun = reconcile0461To0463({ executor, apply: true });
      assert.strictEqual(secondRun.ok, true);
      assert.strictEqual(secondRun.wrote, false);
      for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
        assert.strictEqual(secondRun.finalCounts[m.name], 1);
        assert.strictEqual(getLedgerCount(executor, m.name), 1);
      }
    });
  });
});

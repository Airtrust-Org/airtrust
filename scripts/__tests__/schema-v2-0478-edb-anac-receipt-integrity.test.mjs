// source_reference: 0478 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and SQLite guard verification
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/edb-anac-receipt-integrity-0478.json';
const MIGRATION = 'worker-airtrust/migrations/0478_edb_anac_receipt_integrity.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function apply0478InMemory() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE edb_anac_outbox (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      revision_id TEXT NOT NULL,
      operation_kind TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error_code TEXT,
      last_error_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE edb_anac_recibos (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      outbox_id TEXT NOT NULL,
      external_receipt_id TEXT NOT NULL,
      http_status INTEGER,
      received_at TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT
    );
  `);
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return db;
}

test('pins reviewed hashes for edb-anac-receipt-integrity-0478', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'edb-anac-receipt-integrity-0478');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0478 migration and Schema V2 copy carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (value) => executable(value).replace(/\s+/g, ' ').trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('0478 preserves mutable delivery state but freezes outbox identity and history', () => {
  const db = apply0478InMemory();
  db.exec(`
    INSERT INTO edb_anac_outbox (
      id, empresa_id, revision_id, operation_kind, idempotency_key,
      payload_json, status, attempt_count
    ) VALUES ('out-1', 1, 'rev-1', 'CREATE', 'idem-1', '{"a":1}', 'PENDING', 0);
  `);

  db.exec(`UPDATE edb_anac_outbox SET status = 'PROCESSING', attempt_count = 1 WHERE id = 'out-1';`);
  assert.throws(
    () => db.exec(`UPDATE edb_anac_outbox SET revision_id = 'rev-other' WHERE id = 'out-1';`),
    /EDB_ANAC_OUTBOX_IDENTITY_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec(`UPDATE edb_anac_outbox SET payload_json = '{"a":2}' WHERE id = 'out-1';`),
    /EDB_ANAC_OUTBOX_IDENTITY_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec(`DELETE FROM edb_anac_outbox WHERE id = 'out-1';`),
    /EDB_ANAC_OUTBOX_IMMUTABLE_HISTORY/,
  );
  db.close();
});

test('0478 binds receipts to the same-tenant outbox and keeps receipt evidence immutable', () => {
  const db = apply0478InMemory();
  db.exec(`
    INSERT INTO edb_anac_outbox (
      id, empresa_id, revision_id, operation_kind, idempotency_key, status, attempt_count
    ) VALUES ('out-1', 1, 'rev-1', 'CREATE', 'idem-1', 'PENDING', 0);
  `);

  assert.throws(
    () =>
      db.exec(`
        INSERT INTO edb_anac_recibos (
          id, empresa_id, outbox_id, external_receipt_id, http_status, received_at, receipt_json
        ) VALUES ('receipt-cross', 2, 'out-1', 'ext-cross', 200, '2026-08-29T03:00:00Z', '{}');
      `),
    /EDB_ANAC_OUTBOX_NOT_FOUND_OR_SCOPE_MISMATCH/,
  );

  db.exec(`
    INSERT INTO edb_anac_recibos (
      id, empresa_id, outbox_id, external_receipt_id, http_status, received_at, receipt_json
    ) VALUES ('receipt-1', 1, 'out-1', 'ext-1', 200, '2026-08-29T03:00:00Z', '{}');
  `);
  assert.throws(
    () => db.exec(`UPDATE edb_anac_recibos SET receipt_json = '{"changed":true}' WHERE id = 'receipt-1';`),
    /EDB_ANAC_RECEIPT_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec(`DELETE FROM edb_anac_recibos WHERE id = 'receipt-1';`),
    /EDB_ANAC_RECEIPT_IMMUTABLE/,
  );
  db.close();
});

test('official Schema V2 apply builder accepts 0478 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0478-')),
    '0478-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-anac-receipt-integrity-0478',
    githubSha: 'cccccccccccccccccccccccccccccccccccccccc',
  });
  assert.equal(result.changeId, 'edb-anac-receipt-integrity-0478');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /trg_edb_anac_outbox_identity_immutable/);
  assert.match(applied, /trg_edb_anac_recibo_require_outbox_scope/);
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /'edb-anac-receipt-integrity-0478'/);
});

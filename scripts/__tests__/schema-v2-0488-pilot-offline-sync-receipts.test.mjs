// source_reference: Pilot offline sync receipts 0488 Schema V2 verification
// operational_decision: verify reviewed hashes, tenant idempotency and additive schema contract
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST =
  'worker-airtrust/schema-v2/controle-voos-pilot-offline-sync-receipts-0488.json';
const MIGRATION =
  'worker-airtrust/migrations/0488_controle_voos_pilot_offline_sync_receipts.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('pins reviewed hashes for Pilot offline sync receipts 0488', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(
    manifest.changeId,
    'controle-voos-pilot-offline-sync-receipts-0488',
  );
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0488 Schema V2 SQL is byte-equivalent, additive and tenant scoped', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  assert.equal(change, migration);
  assert.match(change, /CREATE TABLE IF NOT EXISTS cv_offline_sync_receipts/);
  assert.match(change, /empresa_id INTEGER NOT NULL/);
  assert.match(change, /client_operation_id TEXT NOT NULL/);
  assert.match(change, /payload_hash TEXT NOT NULL/);
  assert.match(
    change,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_offline_sync_receipts_empresa_operation[sS]*empresa_id, client_operation_id/,
  );
  assert.match(change, /result_status IN ('accepted', 'conflict', 'rejected_retriable', 'rejected_permanent')/);
  assert.match(change, /idx_cv_offline_sync_receipts_voo_received/);
  assert.match(change, /idx_cv_offline_sync_receipts_actor_device/);
  assert.doesNotMatch(
    change,
    /(?:INSERT INTO|UPDATEs+w+s+SET|DELETE FROM|DROP TABLE|ALTER TABLE)/i,
  );
});

test('0488 does not persist the operational payload body', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');

  assert.match(change, /payload_hash TEXT NOT NULL/);
  assert.doesNotMatch(change, /payload_json/i);
  assert.doesNotMatch(change, /request_body/i);
  assert.doesNotMatch(change, /authorization/i);
  assert.doesNotMatch(change, /access_token/i);
  assert.doesNotMatch(change, /refresh_token/i);
});

test('official Schema V2 builder accepts 0488 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0488-')),
    '0488-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'controle-voos-pilot-offline-sync-receipts-0488',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });

  assert.equal(
    result.changeId,
    'controle-voos-pilot-offline-sync-receipts-0488',
  );
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS cv_offline_sync_receipts/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'controle-voos-pilot-offline-sync-receipts-0488'/);
});

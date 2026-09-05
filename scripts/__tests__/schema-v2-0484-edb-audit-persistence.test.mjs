// source_reference: local-only eDB 0484 Schema V2 verification
// operational_decision: verify reviewed audit-persistence hashes and fail-closed exclusions only
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/edb-audit-persistence-0484.json';
const MIGRATION = 'worker-airtrust/migrations/0484_edb_audit_persistence.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for edb-audit-persistence-0484', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'edb-audit-persistence-0484');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0484 is append-only local audit schema with no ANAC transport lifecycle', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const sql of [
    readFileSync(manifest.filePath, 'utf8'),
    readFileSync(MIGRATION, 'utf8'),
  ]) {
    const body = executable(sql);
    assert.match(body, /CREATE TABLE IF NOT EXISTS edb_audit_events/i);
    assert.match(body, /trg_edb_audit_no_update/i);
    assert.match(body, /trg_edb_audit_no_delete/i);
    assert.doesNotMatch(body, /ANAC_PENDING|ANAC_SYNCED|CREATE TABLE IF NOT EXISTS edb_anac_/i);
    assert.doesNotMatch(body, /ALTER TABLE\s+cv_voo_etapas/i);
    assert.doesNotMatch(body, /\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|DROP TABLE)\b/i);
  }
});

test('migration and Schema V2 change are byte-identical', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0484 and appends one schema ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0484-')),
    '0484-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-audit-persistence-0484',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'edb-audit-persistence-0484');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS edb_audit_events/);
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /'edb-audit-persistence-0484'/);
});

// source_reference: 0476 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and apply verification
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/frms-pvtb-v2-operational-load-0476.json';
const MIGRATION = 'worker-airtrust/migrations/0476_frms_pvtb_v2_operational_load.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for frms-pvtb-v2-operational-load-0476', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, 'frms-pvtb-v2-operational-load-0476');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0476 is additive and idempotent — no destructive DML', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  for (const sql of [change, migration]) {
    const body = executable(sql);
    assert.match(body, /CREATE INDEX IF NOT EXISTS idx_frms_readiness_baseline_protocol/i);
    assert.match(body, /ALTER TABLE frms_fatorizacao_jornada\s+ADD COLUMN operational_load_policy_version/i);
    assert.doesNotMatch(body, /\b(?:DROP|DELETE|UPDATE|REPLACE)\b/i);
  }
});

test('the migration/ copy and the schema-v2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (sql) =>
    executable(sql)
      .replace(/\s+/g, ' ')
      .trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('official Schema V2 apply builder accepts 0476 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0476-')),
    '0476-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'frms-pvtb-v2-operational-load-0476',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'frms-pvtb-v2-operational-load-0476');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE INDEX IF NOT EXISTS idx_frms_readiness_baseline_protocol/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'frms-pvtb-v2-operational-load-0476'/);
});

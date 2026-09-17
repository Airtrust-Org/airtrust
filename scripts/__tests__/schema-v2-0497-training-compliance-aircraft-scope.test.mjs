// source_reference: training compliance aircraft scope 0497 Schema V2 governance
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/training-compliance-aircraft-scope-0497.json';
const MIGRATION = 'worker-airtrust/migrations/0497_training_compliance_aircraft_scope.sql';
const CHANGE_ID = 'training-compliance-aircraft-scope-0497';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes and canonical SQL for 0497', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0497 and appends one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0497-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: CHANGE_ID,
    githubSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  });
  assert.equal(result.changeId, CHANGE_ID);
  const sql = readFileSync(outputPath, 'utf8');
  assert.equal((sql.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
});

test('production workflow wires dedicated 0497 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'training-compliance-aircraft-scope-0497'/);
  assert.match(workflow, /validate-0497-production-preflight\.sh/);
  assert.match(workflow, /validate-0497-production-postconditions\.sh/);
  for (const file of [
    'scripts/schema-v2/validate-0497-production-preflight.sh',
    'scripts/schema-v2/validate-0497-production-postconditions.sh',
  ]) {
    execFileSync('bash', ['-n', file]);
    const src = readFileSync(file, 'utf8');
    assert.match(src, /airtrust-db/);
    assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  }
});

test('staging allowlists 0497 and routes it through its guarded runner', () => {
  const outer = readFileSync('scripts/staging/apply-approved-migrations.sh', 'utf8');
  assert.match(outer, /0497_training_compliance_aircraft_scope\.sql/);
  assert.match(outer, /apply-0497-training-compliance-aircraft-scope\.sh/);
  const runner = readFileSync(
    'scripts/staging/apply-0497-training-compliance-aircraft-scope.sh',
    'utf8',
  );
  assert.match(runner, /SCHEMA_CHANGE_ID="training-compliance-aircraft-scope-0497"/);
  assert.match(runner, /AIRTRUST_STAGING_SCHEMA_CHANGE/);
  assert.match(runner, /time-travel info/);
  execFileSync('bash', ['-n', 'scripts/staging/apply-0497-training-compliance-aircraft-scope.sh']);
  execFileSync('bash', ['-n', 'scripts/staging/validate-0497-postconditions.sh']);
});

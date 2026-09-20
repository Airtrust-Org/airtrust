// source_reference: worker-airtrust/schema-v2/controle-voos-flight-justifications-0506.json
// operational_decision: static/local governance test only; never writes to staging or production D1
// dry_run_required: true
// rollback_plan_required: worker-airtrust/schema-v2/plans/controle-voos-flight-justifications-0506.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/controle-voos-flight-justifications-0506.json';
const MIGRATION = 'worker-airtrust/migrations/0506_controle_voos_flight_justifications.sql';
const CHANGE_ID = 'controle-voos-flight-justifications-0506';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes and canonical SQL for 0506', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0506 and appends exactly one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0506-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: CHANGE_ID,
    githubSha: 'ffffffffffffffffffffffffffffffffffffffff',
  });
  assert.equal(result.changeId, CHANGE_ID);
  const sql = readFileSync(outputPath, 'utf8');
  assert.equal((sql.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
});

test('production workflow wires dedicated 0506 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'controle-voos-flight-justifications-0506'/);
  assert.match(workflow, /validate-0506-production-preflight\.sh/);
  assert.match(workflow, /validate-0506-production-postconditions\.sh/);

  for (const file of [
    'scripts/schema-v2/validate-0506-production-preflight.sh',
    'scripts/schema-v2/validate-0506-production-postconditions.sh',
  ]) {
    execFileSync('bash', ['-n', file]);
    const src = readFileSync(file, 'utf8');
    assert.match(src, /airtrust-db/);
    assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  }
});

test('staging allowlists 0506 and validates postconditions', () => {
  const outer = readFileSync('scripts/staging/apply-approved-migrations.sh', 'utf8');
  assert.match(outer, /0506_controle_voos_flight_justifications\.sql/);
  assert.match(outer, /apply-approved-migration-with-recovery-point\.sh/);

  const generic = readFileSync(
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
    'utf8',
  );
  assert.match(generic, /0506_controle_voos_flight_justifications\.sql/);
  assert.match(generic, /validate-0506-postconditions\.sh/);

  execFileSync('bash', ['-n', 'scripts/staging/apply-approved-migrations.sh']);
  execFileSync('bash', ['-n', 'scripts/staging/apply-approved-migration-with-recovery-point.sh']);
  execFileSync('bash', ['-n', 'scripts/staging/validate-0506-postconditions.sh']);
});

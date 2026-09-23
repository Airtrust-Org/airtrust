// source_reference: worker-airtrust/schema-v2/frms-duty-boundary-config-0511.json
// operational_decision: static/local governance test only; never writes to staging or production D1
// dry_run_required: true
// rollback_plan_required: worker-airtrust/schema-v2/plans/frms-duty-boundary-config-0511.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/frms-duty-boundary-config-0511.json';
const MIGRATION = 'worker-airtrust/migrations/0511_frms_duty_boundary_config.sql';
const CHANGE_ID = 'frms-duty-boundary-config-0511';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes and canonical SQL for 0511', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0511 and appends exactly one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0511-')), 'apply.sql');
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

test('production workflow wires dedicated 0511 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /frms-duty-boundary-config-0511/);
  assert.match(workflow, /validate-0511-production-preflight\.sh/);
  assert.match(workflow, /validate-0511-production-postconditions\.sh/);
  execFileSync('bash', ['-n', 'scripts/schema-v2/validate-0511-production-preflight.sh']);
  execFileSync('bash', ['-n', 'scripts/schema-v2/validate-0511-production-postconditions.sh']);
});

test('staging allowlists 0511 with recovery-point postconditions', () => {
  const outer = readFileSync('scripts/staging/apply-approved-migrations.sh', 'utf8');
  const generic = readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh', 'utf8');
  assert.match(outer, /0511_frms_duty_boundary_config\.sql/);
  assert.match(generic, /0511_frms_duty_boundary_config\.sql/);
  assert.match(generic, /validate-0511-postconditions\.sh/);
  execFileSync('bash', ['-n', 'scripts/staging/validate-0511-postconditions.sh']);
});

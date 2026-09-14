// source_reference: simulator annual curriculum cycles 0493 Schema V2 verification
// operational_decision: pin reviewed hashes, cycle rotation semantics and governed production apply path
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/simulator-annual-curriculum-cycles-0493.json';
const MIGRATION = 'worker-airtrust/migrations/0493_simulator_annual_curriculum_cycles.sql';
const CHANGE_ID = 'simulator-annual-curriculum-cycles-0493';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes and canonical SQL for simulator curriculum cycles 0493', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0493 and appends exactly one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0493-')), '0493-apply.sql');
  const result = buildReviewedSchemaApply({ manifestPath: MANIFEST, outputPath, expectedChangeId: CHANGE_ID, githubSha: 'cccccccccccccccccccccccccccccccccccccccc' });
  assert.equal(result.changeId, CHANGE_ID);
  const applied = readFileSync(outputPath, 'utf8');
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, new RegExp(`'${CHANGE_ID}'`));
});

test('production workflow wires dedicated 0493 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'simulator-annual-curriculum-cycles-0493'/);
  assert.match(workflow, /validate-0493-production-preflight\.sh/);
  assert.match(workflow, /validate-0493-production-postconditions\.sh/);
});

test('0493 production guards freeze prerequisite, rotation and seeded cardinalities', () => {
  const pre = readFileSync('scripts/schema-v2/validate-0493-production-preflight.sh', 'utf8');
  for (const pattern of [/prerequisite-0490/, /cycle-tables-not-present/, /aw139-cycle-models/, /s76-cycle-models/, /target-duration-conflicts/]) assert.match(pre, pattern);
  const post = readFileSync('scripts/schema-v2/validate-0493-production-postconditions.sh', 'utf8');
  for (const pattern of [/cycle-config-mismatch/, /curriculum-item-total/, /curriculum-cardinality-mismatch/, /curriculum-unresolved-current-model/, /curriculum-order-gaps/]) assert.match(post, pattern);
});

test('canonical staging runner does not allowlist production-only 0493', () => {
  const runner = readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh', 'utf8');
  assert.doesNotMatch(runner, /0493_simulator_annual_curriculum_cycles\.sql/);
});

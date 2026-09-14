// source_reference: simulator planning curriculum metadata 0490 Schema V2 verification
// operational_decision: pin reviewed hashes, ordered-curriculum semantics and guarded apply paths
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/simulator-planning-curriculum-metadata-0490.json';
const MIGRATION = 'worker-airtrust/migrations/0490_simulator_planning_curriculum_metadata.sql';
const CHANGE_ID = 'simulator-planning-curriculum-metadata-0490';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes for simulator planning curriculum 0490', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0490 Schema V2 SQL is byte-equivalent to the canonical migration', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  assert.equal(change, readFileSync(MIGRATION, 'utf8'));
  assert.match(change, /ordem_no_treinamento IS NOT NULL/);
  assert.match(change, /duracao_estimada=120/);
  assert.match(change, /A139-P-04\/04-C2-CHECK/);
  assert.match(change, /SK76-P-CHECK/);
  assert.match(change, /S76-P-01\/04-C2','S76-P-01\/03-C2/);
  assert.doesNotMatch(change, /UPDATE\s+qualificacoes_historico/i);
});

test('official Schema V2 builder accepts 0490 and appends exactly one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0490-')), '0490-apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: CHANGE_ID,
    githubSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(result.changeId, CHANGE_ID);
  const applied = readFileSync(outputPath, 'utf8');
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, new RegExp(`'${CHANGE_ID}'`));
});

test('production workflow wires dedicated 0490 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'simulator-planning-curriculum-metadata-0490'/);
  assert.match(workflow, /validate-0490-production-preflight\.sh/);
  assert.match(workflow, /validate-0490-production-postconditions\.sh/);
});

test('staging recovery path allowlists 0490 but remains fail-closed behind its dedicated preflight', () => {
  const workflow = readFileSync('.github/workflows/staging-d1-schema-change.yml', 'utf8');
  const runner = readFileSync('scripts/staging/apply-approved-migration-with-recovery-point.sh', 'utf8');
  assert.match(workflow, /0490_simulator_planning_curriculum_metadata\.sql/);
  assert.match(runner, /0490_simulator_planning_curriculum_metadata\.sql/);
  assert.match(runner, /validate-0490-preflight\.sh/);
  assert.match(runner, /validate-0490-postconditions\.sh/);
  const ledgerRead = runner.indexOf('ledger_count="$(read_ledger_count)"');
  const specializedPreflight = runner.indexOf('bash scripts/staging/validate-0490-preflight.sh --target="$db_name"');
  assert.ok(ledgerRead >= 0);
  assert.ok(specializedPreflight > ledgerRead);
  assert.match(runner, /0490_simulator_planning_curriculum_metadata\.sql" && "\$ledger_count" == "0"/);
});

test('0490 read-only guards freeze the reviewed tenant, cycle, duration and dependency invariants', () => {
  const scripts = [
    readFileSync('scripts/staging/validate-0490-preflight.sh', 'utf8'),
    readFileSync('scripts/schema-v2/validate-0490-production-preflight.sh', 'utf8'),
  ];
  for (const source of scripts) {
    assert.match(source, /qualification-types/);
    assert.match(source, /aw139-current-recurrent/);
    assert.match(source, /s76-code-state/);
    assert.match(source, /duration-conflicts/);
    assert.match(source, /ordered-outside-approved-c2/);
  }
  const post = readFileSync('scripts/schema-v2/validate-0490-production-postconditions.sh', 'utf8');
  assert.match(post, /recurrent-duration-120/);
  assert.match(post, /ordered-curriculum-count/);
  assert.match(post, /ordered-curriculum-mismatch/);
  assert.match(post, /open-dependency-unordered-models/);
});

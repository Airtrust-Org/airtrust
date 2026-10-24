// Production HFA 0529 contract checks; offline-only, no Cloudflare credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const workflow = read('.github/workflows/apply-schema-change-v2.yml');
const pre = read('scripts/schema-v2/validate-0529-production-preflight.sh');
const post = read('scripts/schema-v2/validate-0529-production-postconditions.sh');
const manifest = JSON.parse(read('worker-airtrust/schema-v2/hfa-integration-bridge-0529.json'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('0529 production evidence is tied to immutable SQL and plan hashes', () => {
  assert.equal(manifest.changeId, 'hfa-integration-bridge-0529');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(manifest.fileHash, sha256(manifest.filePath));
  assert.equal(manifest.planHash, sha256(manifest.planPath));
  assert.ok(post.includes(manifest.fileHash));
  assert.ok(post.includes(manifest.planHash));
  assert.ok(pre.includes(manifest.changeId));
  assert.ok(post.includes(manifest.changeId));
});

test('read-only 0529 preflight is before backup/recovery/apply; postcheck is after exact ledger', () => {
  const positions = [
    '      - name: Preflight HFA 0529 production tenant schema and original data',
    '      - name: Backup governance ledger',
    '      - name: Capture D1 Time Travel recovery point',
    '      - name: Apply schema and ledger atomically',
    '      - name: Verify ledger postcondition',
    '      - name: Post-validate HFA 0529 exact ledger, tenant schema and preserved reports',
  ].map((name) => {
    const index = workflow.indexOf(name);
    assert.ok(index >= 0, 'missing step: ' + name);
    return index;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const preStep = workflow.slice(positions[0], positions[1]);
  const postStep = workflow.slice(positions[5], workflow.indexOf('      - name: Post-validate schema contract', positions[5]));
  assert.match(preStep, /id: hfa0529preflight/);
  assert.match(preStep, /inputs\.change_id == 'hfa-integration-bridge-0529'/);
  assert.match(preStep, /validate-0529-production-preflight\.sh --target=airtrust-db/);
  assert.match(postStep, /inputs\.change_id == 'hfa-integration-bridge-0529'/);
  assert.match(postStep, /validate-0529-production-postconditions\.sh --target=airtrust-db/);
  assert.match(postStep, /steps\.hfa0529preflight\.outputs\.sgso_relatos_before/);
  assert.match(postStep, /EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /group: apply-schema-change-v2-production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION/);
});

test('0529 physical preflight rejects absent upstream tables, partial schema and applied ledger', () => {
  assert.match(pre, /ALLOWED_DB_NAME='airtrust-db'/);
  assert.match(pre, /--env production --remote --json --command/);
  assert.match(pre, /unapplied_change 0/);
  assert.match(pre, /source_tables 2/);
  assert.match(pre, /source_tenant_columns 3/);
  assert.match(pre, /hfa_tables_absent 0/);
  assert.match(pre, /hfa_indexes_absent 0/);
  assert.match(pre, /hfa_triggers_absent 0/);
  assert.match(pre, /SELECT COUNT\(\*\) AS count FROM sgso_relatos/);
  assert.match(pre, /sgso_relatos_before=%s/);
  assert.match(pre, /GITHUB_OUTPUT_REQUIRED/);
});

test('0529 postcheck proves exact source, immutable ledger, tenant guards and no data changes', () => {
  assert.match(post, /EXPECTED_SHA/);
  assert.match(post, /EXPECTED_SGSO_RELATOS_BEFORE/);
  for (const constraint of [
    'exact_ledger 1', 'target_tables 2', 'hfa_indexes 3',
    'hfa_tenant_triggers 2', 'hfa_config_tenant_key 1',
    'hfa_event_tenant_key 1', 'hfa_config_empty 0',
    'hfa_events_empty 0', 'preserved_sgso_count',
  ]) assert.ok(post.includes(constraint), constraint);
  assert.match(post, /github_sha='\$EXPECTED_SHA'/);
  assert.match(post, /RAISE\(ABORT/);
});

test('0529 validation scripts cannot write D1 or accept a staging database', () => {
  for (const source of [pre, post]) {
    assert.match(source, /\[\[ "\$target" == "\$ALLOWED_DB_NAME" \]\]/);
    assert.doesNotMatch(source, /--file|d1 migrations apply|d1 time-travel restore/i);
    const statements = [...source.matchAll(/"(SELECT [^"\n]+)"|'(SELECT [^'\n]+)'/g)].map((m) => m[1] || m[2]);
    assert.ok(statements.length >= 8, 'expected fixed read-only SQL queries');
    assert.ok(statements.every((sql) => /^SELECT\s/i.test(sql)));
  }
});

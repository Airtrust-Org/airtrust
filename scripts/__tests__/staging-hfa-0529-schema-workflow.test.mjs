// HFA 0529: staging-only Schema V2 admission checks. No Cloudflare access or writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const manifest = JSON.parse(readFileSync('worker-airtrust/schema-v2/hfa-integration-bridge-0529.json', 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const assertHas = (fragment, text = workflow) => assert.ok(text.includes(fragment), 'Missing contract: ' + fragment);

test('0529 SQL/plan pin matches committed artifacts and only approved staging target', () => {
  assert.equal(manifest.changeId, 'hfa-integration-bridge-0529');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(manifest.filePath, 'worker-airtrust/schema-v2/changes/0529_hfa_integration_bridge.sql');
  assert.equal(manifest.fileHash, sha256(manifest.filePath));
  assert.equal(manifest.planHash, sha256(manifest.planPath));
  assertHas(manifest.fileHash);
  assertHas(manifest.planHash);
  assertHas(manifest.filePath);
  assertHas('airtrust-staging-mutations-and-scorm-qa');
  assertHas('STAGING_DB_NAME: airtrust-db-staging-baseline-20260701');
  assertHas('PRODUCTION_TARGET_REJECTED');
  assertHas('STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS');
  assertHas('SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED');
});

test('0529 merged-PR admission requires current main, exact merge SHA and same-repo origin', () => {
  for (const fragment of [
    "process.env.CHANGE_ID === 'hfa-integration-bridge-0529'",
    "pr.merged === true && pr.merge_commit_sha?.toLowerCase() === sha",
    "await github('/git/refs/heads/main')",
    "mainRef.object?.sha?.toLowerCase() === sha",
    "pr.base?.ref === 'main'",
    "pr.head?.repo?.full_name === repo && !pr.head?.repo?.fork",
    'reviewedOpenHead || reviewedMergedHfa',
    'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'WORKFLOW_ACTOR_NOT_AUTHORIZED',
    'verify-release-gates.mjs',
  ]) assertHas(fragment);
  assertHas("reviewedMergedHfa = false");
});

test('0529 preflight refuses partial installs and requires original SGSO tenant contract', () => {
  const pre = workflow.split('      - name: Verify staging credentials and physical preconditions read-only')[1]
    ?.split('      - name: Capture verified staging D1 Time Travel recovery point')[0];
  assert.ok(pre, 'preflight section');
  for (const fragment of [
    'HFA_0529_SOURCE_TABLES_MISSING',
    'HFA_0529_SGSO_TENANT_COLUMNS_MISSING',
    'HFA_0529_TABLES_ALREADY_PRESENT_WITHOUT_LEDGER',
    'HFA_0529_INDEXES_ALREADY_PRESENT_WITHOUT_LEDGER',
    'HFA_0529_TRIGGERS_ALREADY_PRESENT_WITHOUT_LEDGER',
    'sgso_relato_count=',
  ]) assertHas(fragment, pre);
});

test('0529 readback proves tables, three indexes, two tenant triggers, no backfill and unchanged SGSO', () => {
  const post = workflow.split('      - name: Verify physical column and exact ledger provenance')[1];
  assert.ok(post, 'readback section');
  for (const fragment of [
    'HFA_0529_RELATOS_BEFORE:',
    'HFA_0529_TABLES_MISSING',
    'HFA_0529_INDEXES_MISSING',
    'HFA_0529_TENANT_TRIGGERS_MISSING',
    'HFA_0529_UNEXPECTED_CONFIG_ROWS',
    'HFA_0529_UNEXPECTED_EVENT_ROWS',
    'HFA_0529_SGSO_REPORTS_CHANGED',
    'SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED',
  ]) assertHas(fragment, post);
});

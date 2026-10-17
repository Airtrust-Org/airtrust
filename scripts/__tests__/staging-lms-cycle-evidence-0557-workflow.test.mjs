import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/staging-lms-cycle-evidence-0557.yml'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'worker-airtrust/schema-v2/lms-cycle-evidence-0557.json'), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');

test('LMS 0557 governed workflow pins the actual immutable Schema V2 artifact and baseline', () => {
  assert.equal(manifest.changeId, 'lms-cycle-evidence-0557');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(manifest.fileHash, sha256(manifest.filePath));
  assert.equal(manifest.planHash, sha256(manifest.planPath));
  assert.ok(workflow.includes(manifest.fileHash));
  assert.ok(workflow.includes(manifest.planHash));
  assert.ok(workflow.includes('lms-cycle-evidence-0557'));
  assert.ok(workflow.includes('0557_lms_cycle_evidence_archive.sql'));
  assert.ok(!workflow.includes('frms-sleep-opportunity-0552'));
});

test('LMS staging workflow is manually authorized, SHA-pinned, isolated and serialized', () => {
  for (const fragment of [
    'workflow_dispatch:',
    "group: airtrust-staging-mutations-and-scorm-qa",
    'environment: staging',
    "GITHUB_REF\" == 'refs/heads/main'",
    'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'WORKFLOW_ACTOR_NOT_AUTHORIZED',
    'Verify eight required GitHub release gates for exact SHA',
    'STAGING_DB_PIN_MISMATCH',
    'REVIEWED_MANIFEST_SCOPE_MISMATCH',
    'STAGING_MIGRATION_CREDENTIALS_MISSING',
    'STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS',
  ]) {
    // Staging target is verified as STAGING_D1_PIN_MISMATCH in original shared flow.
    if (fragment === 'STAGING_DB_PIN_MISMATCH') {
      assert.match(workflow, /STAGING_D1_PIN_MISMATCH/); continue;
    }
    assert.ok(workflow.includes(fragment), `Missing security contract: ${fragment}`);
  }
  assert.ok(!workflow.includes('--env production'));
  assert.ok(!workflow.includes('airtrust-db --env production'));
});

test('LMS 0557 refuses schema drift and validates exact immutable D1 postconditions', () => {
  for (const fragment of [
    'LMS_0557_REQUIRED_BASE_TABLE_MISSING',
    'LMS_0557_XAPI_TENANT_SCHEMA_MISMATCH',
    'LMS_0557_CYCLE_TENANT_SCHEMA_MISMATCH',
    'LMS_0557_PHYSICAL_COLUMN_DRIFT',
    'LMS_0557_ARCHIVE_TABLE_DRIFT',
    'LMS_0557_INDEX_DRIFT',
    'LMS_0557_TRIGGER_DRIFT',
    'LMS_0557_LEDGER_PROVENANCE_MISMATCH',
    'LMS_0557_ARCHIVED_CYCLE_FK_MISSING',
    'LMS_0557_ARCHIVE_CYCLE_UNIQUE_CONSTRAINT_MISSING',
    'LMS_0557_IMMUTABILITY_TRIGGERS_MISSING',
    'LMS_0557_XAPI_ROWS_CHANGED',
    'LMS_0557_ENROLLMENT_ROWS_CHANGED',
    'LMS_0557_CYCLE_ROWS_CHANGED',
    'LMS_0557_SCORM_ROWS_CHANGED',
    'LMS_0557_DIAGNOSTICS_ROWS_CHANGED',
    'LMS_0557_UNAUTHORIZED_XAPI_RECLASSIFICATION',
    'LMS_0557_UNEXPECTED_ARCHIVE_BACKFILL',
  ]) assert.ok(workflow.includes(fragment), `Missing preflight/postcondition: ${fragment}`);
  const pre = workflow.indexOf('Verify reviewed LMS 0557 preflight');
  const recovery = workflow.indexOf('Capture verified staging D1 Time Travel recovery point');
  const apply = workflow.indexOf('Apply exact reviewed bundle to pinned staging D1');
  const post = workflow.indexOf('Verify exact 0557 ledger');
  assert.ok(0 < pre && pre < recovery && recovery < apply && apply < post);
});

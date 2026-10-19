import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
test('0554 staging apply is explicitly restricted and checks physical evidence', () => {
  for (const requirement of [
    'simulator-individual-check-evidence-0554',
    'bcbdcf8bd78c3a3d6393624e62ae70e691190e3ae2d35c0951c0bc56470b4bf5',
    '47b79c542348749d865425a5487f72689444f30553187778f51366b89bbcd0b6',
    'SIMULATOR_SOURCE_TABLES_MISSING','SIMULATOR_INDIVIDUAL_TABLE_ALREADY_PRESENT',
    'SIMULATOR_INDIVIDUAL_TRIGGERS_POSTCONDITION_FAILED',
    'SIMULATOR_INDIVIDUAL_SYNTHETIC_EVIDENCE_REJECTED',
    'SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED',
    'STAGING_RECOVERY_BOOKMARK_VERIFIED=PASS',
    '--env staging --timestamp="$timestamp" --json',
    'airtrust-staging-mutations-and-scorm-qa',
    'verify-release-gates.mjs', 'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'PRODUCTION_TARGET_REJECTED',
  ]) assert.ok(workflow.includes(requirement), requirement);
});
test('preexisting FRMS 0552 workflow remains governed', () => {
  for (const requirement of [
    'frms-sleep-opportunity-0552', '0552_frms_sleep_opportunity.sql',
    'FRMS_SLEEP_OPPORTUNITY_COLUMN_POSTCONDITION_FAILED', 'FRMS_CHECKIN_TABLE_MISSING',
  ]) assert.ok(workflow.includes(requirement), requirement);
});

test('0560 has separate governed stage authorization and preserves evidence', () => {
  for (const guard of [
    'simulator-individual-check-delete-guard-0560',
    '0560_simulator_individual_check_delete_guard.sql',
    '5fe67c81dda03681d9a73eec4cc51989bd92270e4eca6b41b1eb1028b58b9e56',
    'b00948f0821692fb322cd18dc795769d8f03b057db7af9c9b729747d9d2b1463',
    'SIMULATOR_0554_DEPENDENCY_LEDGER_MISMATCH',
    'SIMULATOR_0560_DELETE_TRIGGER_ALREADY_PRESENT',
    'SIMULATOR_0560_TRIGGERS_POSTCONDITION_FAILED',
    'trg_checks_individuais_confirmed_immutable',
    'trg_checks_individuais_delete_guard',
    'SIMULATOR_0560_EVIDENCE_COUNT_CHANGED',
    'steps.preflight.outputs.evidence_count',
  ]) assert.ok(workflow.includes(guard), guard);
});

test('0560 postcheck keeps preflight evidence count and Cloudflare credentials in one env mapping', () => {
  const step = workflow.split('      - name: Verify physical column and exact ledger provenance\n')[1];
  assert.ok(step, 'postcheck step must exist');
  const header = step.split('        run: |')[0];
  assert.equal((header.match(/^        env:$/gm) || []).length, 1,
    'duplicate env mappings can drop the preservation witness');
  for (const key of ['EVIDENCE_COUNT_BEFORE:', 'CLOUDFLARE_API_TOKEN:', 'CLOUDFLARE_ACCOUNT_ID:']) {
    assert.ok(header.includes(key), key + ' must be in the same step environment');
  }
  assert.ok(step.includes('== "$EVIDENCE_COUNT_BEFORE"'),
    '0560 must compare row counts before and after the apply');
});

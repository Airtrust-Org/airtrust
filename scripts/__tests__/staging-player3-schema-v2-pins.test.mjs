import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/staging-player3-schema-v2.yml'), 'utf8');

test('staging Player 3 accepts ONLY Schema V2 0558 followed by 0559', () => {
  const choices = [...workflow.matchAll(/^\s+- (lms-(?:native-v1-evidence|player3-module-attempts)-\d{4})$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(choices, [
    'lms-native-v1-evidence-0558',
    'lms-player3-module-attempts-0559',
  ]);
  assert.doesNotMatch(workflow, /lms-native-v1-evidence-0553|lms-player3-module-attempts-0554/);
  assert.match(workflow, /PLAYER3_NATIVE_0558_REQUIRED_FIRST/);
  assert.match(workflow, /change_id='lms-native-v1-evidence-0558'/);
  assert.match(workflow, /file_hash='b0f5b51f26f2428d23468751f575fdfb03ce1583635ef980c33d9ae27b204f57'/);
});

test('staging pins reviewed 0558 and 0559 SQL, plan and manifest', () => {
  const pinned = [
    ['0558_lms_native_v1_evidence.sql',
      'b0f5b51f26f2428d23468751f575fdfb03ce1583635ef980c33d9ae27b204f57',
      '639bbc2abfb4d7a8aea388697c52bfdf16082fed09a5d5863a5db6a79a53fdf4'],
    ['0559_lms_player3_module_attempts.sql',
      'a8c56c0bce48476f48e20bd5d5d33befe6c0becc98d2af309c4fc78d5d18d775',
      '8b2c0be03e82a39edd06191b570e6ff21e7f56d6125eeac30ba329d13611b9b2'],
  ];
  for (const [file, sqlHash, planHash] of pinned) {
    assert.ok(workflow.includes('worker-airtrust/schema-v2/changes/' + file), file);
    assert.ok(workflow.includes(sqlHash), sqlHash);
    assert.ok(workflow.includes(planHash), planHash);
  }
  assert.match(workflow, /PLAYER3_PINNED_MANIFEST_SCOPE_MISMATCH/);
  assert.match(workflow, /schema SQL hash mismatch|build-reviewed-schema-apply\.mjs/);
});

test('staging workflow preserves trusted PR, SHA, tenant-independent staging target and recovery controls', () => {
  for (const fragment of [
    "refs/heads/main",
    'REVIEWED_PR_HEAD_OR_ORIGIN_MISMATCH',
    'WORKFLOW_ACTOR_NOT_AUTHORIZED',
    'Verify eight required GitHub release gates for exact SHA',
    'RELEASE_SHA_DRIFT',
    'STAGING_D1_PIN_MISMATCH',
    'STAGING_SCHEMA_V2_BASELINE_NOT_ACTIVE',
    'CHANGE_ALREADY_APPLIED_OR_LEDGER_DRIFT',
    'Capture verified staging D1 Time Travel recovery point',
    'SCHEMA_V2_EXACT_LEDGER_POSTCONDITION_FAILED',
    'airtrust-staging-mutations-and-scorm-qa',
    'AIRTRUST_STAGING_SCHEMA_V2',
    'CLOUDFLARE_D1_MIGRATION_API_TOKEN',
  ]) assert.ok(workflow.includes(fragment), fragment);
  assert.match(workflow, /STAGING_DB_NAME: airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /STAGING_DB_ID: bf9963f4-eb12-439b-a830-20bbf577ac22/);
  assert.match(workflow, /PRODUCTION_TARGET_REJECTED/);
  assert.match(workflow, /if \[\[ "\$CHANGE_ID" == 'lms-native-v1-evidence-0558' \]\]/);
  assert.match(workflow, /PLAYER3_0559_POLICY_TABLE_NOT_EMPTY/);
});

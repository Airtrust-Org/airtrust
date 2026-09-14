import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('scripts/staging/audit-simulator-matrix-baseline.mjs', 'utf8');

test('staging audit is hard-locked and read-only', () => {
  assert.match(source, /airtrust-db-staging-baseline-20260701/);
  assert.match(source, /STAGING_TARGET_REFUSED/);
  assert.match(source, /SELECT\|WITH\|PRAGMA/);
  assert.match(source, /READ_ONLY_SQL_REQUIRED/);
  assert.doesNotMatch(source, /--file/);
});

test('staging audit asserts tenant identity instead of production matrix parity', () => {
  assert.match(source, /edb_pilot_smoke/);
  assert.match(source, /qa_examiner_training/);
  assert.match(source, /STAGING_TENANT_IDENTITY_ISOLATED/);
  assert.match(source, /safe_for_production_tenant_0490: false/);
});

test('staging audit requires 0490 to remain unapplied there', () => {
  assert.match(source, /0490_simulator_planning_curriculum_metadata\.sql/);
  assert.match(source, /production_tenant_0490_not_ledgered/);
  assert.match(source, /DEPLOY_REVIEWED_STAGING_SHA_THEN_RUN_STAGING_SIMULATOR_PLANNING_PERSISTENCE_QA/);
});

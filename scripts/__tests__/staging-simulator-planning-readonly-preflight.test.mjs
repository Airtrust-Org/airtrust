// source_reference: staging simulator-planning QA governance (#648)
// operational_decision: static contract test only; no remote access.
// dry_run_required: not applicable; no writes.
// rollback_plan_required: not applicable; no writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  '.github/workflows/staging-simulator-planning-readonly-preflight.yml',
  'utf8',
);

test('simulator planning readiness workflow is staging-only and read-only', () => {
  assert.match(workflow, /name: Staging Simulator Planning Read-Only Preflight/);
  assert.match(workflow, /AIRTRUST_STAGING_SIMULATOR_PLANNING_READONLY/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /bf9963f4-eb12-439b-a830-20bbf577ac22/);
  assert.match(workflow, /7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /audit-simulator-matrix-baseline\.mjs/);
  assert.doesNotMatch(workflow, /--apply/);
  assert.doesNotMatch(workflow, /seed-qa-simulator-planning\.mjs/);
  assert.doesNotMatch(workflow, /wrangler\s+d1\s+execute[\s\S]*--file/);
});

test('simulator planning readiness pins and verifies deployed provenance', () => {
  assert.match(workflow, /expected_deployed_sha/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /\/api\/version/);
  assert.match(workflow, /assertLiveFrontendShaFromOrigin/);
});

test('simulator planning readiness fails closed on tenant or schema drift', () => {
  assert.match(workflow, /STAGING_TENANT_IDENTITY_ISOLATED/);
  assert.match(workflow, /PRODUCTION_0490_PRESENT_IN_STAGING/);
  assert.match(workflow, /QA_BASE_FIXTURE_MISSING/);
  assert.match(workflow, /operation: SELECT\/PRAGMA only/);
  assert.match(workflow, /staging mutation performed: no/);
  assert.doesNotMatch(workflow, /Publish sanitized readiness summary[\s\S]*<<'NODE'/);
});


test('read-only preflight checks simulator fixture schema compatibility', () => {
  const workflow = readFileSync('.github/workflows/staging-simulator-planning-readonly-preflight.yml', 'utf8');
  assert.match(workflow, /Require simulator-planning fixture schema compatibility \(read-only\)[\s\S]*CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN \}\}[\s\S]*CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}[\s\S]*preflight-simulator-planning-schema\.mjs/);
  const preflight = readFileSync('scripts/staging/preflight-simulator-planning-schema.mjs', 'utf8');
  assert.match(preflight, /READ_ONLY_SCHEMA_PREFLIGHT/);
  assert.match(preflight, /fixture_schema_compatible/);
});

test('read-only preflight checks semantic simulator fixture ownership', () => {
  const workflow = readFileSync('.github/workflows/staging-simulator-planning-readonly-preflight.yml', 'utf8');
  assert.match(workflow, /preflight-simulator-planning-fixture\.mjs/);
  assert.match(workflow, /Require simulator-planning fixture ownership preconditions \(read-only\)/);
});

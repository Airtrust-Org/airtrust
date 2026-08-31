import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const WORKFLOW = '.github/workflows/edb-staging-full-lifecycle.yml';
const SEED = 'scripts/staging/seed-qa-edb-full-lifecycle.mjs';
const SMOKE = 'scripts/staging/smoke-edb-full-lifecycle.mjs';
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('full lifecycle uses trusted main orchestration, shared staging lock and an exact reviewed candidate', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /AIRTRUST_EDB_STAGING_FULL_LIFECYCLE/);
  assert.match(workflow, /pr_number:/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /STAGING_API_BASE_URL: https:\/\/airtrust-api-staging\.airtrust\.workers\.dev/);
  assert.match(workflow, /STAGING_D1_NAME: airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /concurrency:[\s\S]*?group: deploy-airtrust-staging/);
  assert.doesNotMatch(workflow, /group: airtrust-edb-staging-full-lifecycle/);
  assert.match(workflow, /PR_FROM_FORK_REJECTED/);
  assert.match(workflow, /OPEN_PR_HEAD_MISMATCH/);
  assert.match(workflow, /MERGED_PR_SHA_MISMATCH/);
  assert.match(workflow, /EDB_STAGING_CANDIDATE_RELEASE_PASS/);
  assert.match(workflow, /node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /SOURCE_RELEASE_SHA_MISMATCH/);
  assert.doesNotMatch(workflow, /ref:\s*\$\{\{\s*inputs\.expected_release_sha\s*\}\}/);
  assert.doesNotMatch(workflow, /--env\s+production|airtrust-db-production|api\.airtrust\.online|wrangler\s+deploy/i);
});

test('candidate and remote provenance are verified before any D1 lifecycle access or write', () => {
  const workflow = read(WORKFLOW);
  const candidateGuard = workflow.indexOf('EDB_STAGING_CANDIDATE_RELEASE_PASS');
  const officialGates = workflow.indexOf('verify-release-gates.mjs');
  const releaseCheck = workflow.indexOf('EDB_STAGING_RELEASE_PROVENANCE_PASS');
  const preflight = workflow.indexOf('seed-qa-edb-full-lifecycle.mjs --preflight');
  const identityApply = workflow.indexOf('seed-qa-edb-pilot.mjs --apply');
  const fixtureApply = workflow.indexOf('seed-qa-edb-full-lifecycle.mjs --apply');
  assert.ok(candidateGuard >= 0, 'candidate PR/head binding is required');
  assert.ok(officialGates > candidateGuard, 'official release gates must follow candidate binding');
  assert.ok(releaseCheck > officialGates, 'remote release provenance must be checked after candidate release gates');
  assert.ok(preflight > releaseCheck, 'tenant preflight must happen after exact deployed release provenance');
  assert.ok(identityApply > preflight, 'identity write must happen after release and strict tenant preflights');
  assert.ok(fixtureApply > identityApply, 'canonical fixture write must happen after identity provisioning');
  assert.match(workflow, /\/api\/version/);
  assert.match(workflow, /EDB_STAGING_RELEASE_SHA_MISMATCH/);
  assert.match(workflow, /candidate code is not checked out into the secret-bearing lifecycle job/);
  assert.match(workflow, /QA scripts execute from the trusted workflow SHA on `main`/);
});

test('cleanup is mandatory, exact-order and covers partial identity-apply failures without bypassing immutable eDB evidence', () => {
  const workflow = read(WORKFLOW);
  const canonicalRollback = workflow.indexOf('seed-qa-edb-full-lifecycle.mjs --apply --rollback');
  const identityRollback = workflow.indexOf('seed-qa-edb-pilot.mjs --apply --rollback');
  assert.ok(canonicalRollback >= 0, 'canonical fixture rollback missing');
  assert.ok(identityRollback > canonicalRollback, 'identity rollback must run after canonical fixture rollback');
  assert.match(
    workflow,
    /Roll back exact mutable canonical fixture[\s\S]*?if: \$\{\{ always\(\) && steps\.identity_apply\.outcome == 'success' \}\}/,
  );
  assert.match(
    workflow,
    /Deactivate exact synthetic identity fixtures[\s\S]*?if: \$\{\{ always\(\) && steps\.identity_apply\.outcome != 'skipped' \}\}/,
  );

  const seed = read(SEED);
  assert.match(seed, /softDeleteIfPresent/);
  assert.match(seed, /EDB_FULL_CANONICAL_ROLLBACK_PASS/);
  assert.doesNotMatch(seed, /DELETE\s+FROM\s+edb_/i);
  assert.doesNotMatch(seed, /DROP\s+(?:TABLE|TRIGGER)\s+.*edb_/i);
});

test('seed fails closed unless tenant 6 is absent or exactly the reserved synthetic tenant', () => {
  const seed = read(SEED);
  assert.match(seed, /PILOT_TENANT_ID = 6/);
  assert.match(seed, /PILOT_TENANT_CODE = 'edb_pilot_smoke'/);
  assert.match(seed, /EDB_FULL_TENANT_6_IS_NOT_SYNTHETIC/);
  assert.match(seed, /EDB_FULL_SYNTHETIC_CODE_COLLISION/);
  assert.match(seed, /airtrust-db-staging-baseline-20260701/);
  assert.match(seed, /CONFIRM_STAGING_EDB_FULL_LIFECYCLE/);
  assert.match(seed, /AIRTRUST_STAGING_EDB_FULL_LIFECYCLE/);
  assert.doesNotMatch(seed, /airtrust-db-production|--env\s+production/i);
});

test('schema-adaptive fixture fails rather than guessing required columns', () => {
  const seed = read(SEED);
  assert.match(seed, /PRAGMA table_info/);
  assert.match(seed, /QA_SCHEMA_UNSUPPORTED:/);
  assert.match(seed, /QA_CLEANUP_SOFT_DELETE_UNSUPPORTED:/);
  assert.match(seed, /cv_voos/);
  assert.match(seed, /cv_voo_etapas/);
  assert.match(seed, /cv_voo_tripulantes/);
  assert.match(seed, /cv_rdv_operacional/);
});

test('remote smoke exercises required eDB lifecycle and stops at OPERATOR_SIGNED', () => {
  const smoke = read(SMOKE);
  const requiredPaths = [
    '/api/edb/diaries',
    '/volumes',
    '/regulatory',
    '/function',
    '/preflight/snapshot',
    '/preflight/signing-payload',
    '/preflight/ack',
    '/revisions',
    '/signatures',
    '/corrections',
    '/discrepancies',
    '/deferred-actions',
    '/corrective-actions',
    '/rts',
    '/audit',
    '/incidents',
    '/police',
    '/regulator-notification-evidence',
    '/reconstituted',
    '/close',
  ];
  for (const endpoint of requiredPaths) assert.ok(smoke.includes(endpoint), `missing lifecycle endpoint ${endpoint}`);
  assert.match(smoke, /OPERATOR_SIGNED/);
  assert.match(smoke, /ANAC_TRANSMISSION=none/);
  assert.match(smoke, /PRODUCTION_ACTION=none/);
  assert.doesNotMatch(smoke, /\/api\/edb\/.*anac.*(?:queue|send|sync)|api\.airtrust\.online/i);
});

test('governed lifecycle scripts parse under Node', () => {
  execFileSync('node', ['--check', path.join(ROOT, SEED)], { stdio: 'pipe' });
  execFileSync('node', ['--check', path.join(ROOT, SMOKE)], { stdio: 'pipe' });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const WORKFLOW = readFileSync(path.join(ROOT, '.github/workflows/edb-staging-full-lifecycle.yml'), 'utf8');

function indexOfOrFail(text, needle, message) {
  const index = text.indexOf(needle);
  assert.ok(index >= 0, message ?? `missing ${needle}`);
  return index;
}

test('dispatch guard binds the candidate to trusted main and an exact release SHA', () => {
  assert.match(WORKFLOW, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(WORKFLOW, /AIRTRUST_EDB_STAGING_FULL_LIFECYCLE/);
  assert.match(WORKFLOW, /\[\[ "\$PR_NUMBER" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/);
  assert.match(WORKFLOW, /\[\[ "\$EXPECTED_EDB_RELEASE_SHA" =~ \^\[0-9a-fA-F\]\{40\}\$ \]\]/);
  assert.match(WORKFLOW, /pr\.base\?\.ref !== 'main'/);
  assert.match(WORKFLOW, /pr\.head\?\.repo\?\.full_name !== repo \|\| pr\.head\?\.repo\?\.fork/);
  assert.match(WORKFLOW, /OPEN_PR_HEAD_MISMATCH/);
  assert.match(WORKFLOW, /MERGED_PR_SHA_MISMATCH/);
  assert.match(WORKFLOW, /RELEASE_SHA_NOT_CURRENT_MAIN/);
});

test('official release gates run against the candidate SHA while orchestration checkout stays trusted', () => {
  assert.match(
    WORKFLOW,
    /Checkout trusted orchestration source[\s\S]*?uses: actions\/checkout@v4[\s\S]*?ref: \$\{\{ github\.sha \}\}/,
  );
  assert.match(
    WORKFLOW,
    /Verify official release gates for candidate[\s\S]*?RELEASE_SHA: \$\{\{ inputs\.expected_release_sha \}\}[\s\S]*?node scripts\/ci\/verify-release-gates\.mjs/,
  );

  const lifecycleJob = WORKFLOW.slice(indexOfOrFail(WORKFLOW, '  d1-full-lifecycle:'));
  assert.match(
    lifecycleJob,
    /Checkout trusted QA source[\s\S]*?uses: actions\/checkout@v4[\s\S]*?ref: \$\{\{ github\.sha \}\}/,
  );
  assert.doesNotMatch(lifecycleJob, /ref:\s*\$\{\{ inputs\.expected_release_sha \}\}/);
});

test('live staging provenance is verified before any lifecycle D1 access or fixture mutation', () => {
  const provenance = indexOfOrFail(WORKFLOW, 'Verify exact deployed candidate release before D1 access');
  const tenantPreflight = indexOfOrFail(WORKFLOW, 'Fail closed unless tenant 6 is absent or exactly reserved synthetic tenant');
  const identityApply = indexOfOrFail(WORKFLOW, 'Provision exact tenant-6 synthetic identity');
  const fixtureApply = indexOfOrFail(WORKFLOW, 'Provision canonical synthetic flight/RDV fixture');
  const lifecycleSmoke = indexOfOrFail(WORKFLOW, 'Exercise complete eDB lifecycle through staging API');

  assert.ok(provenance < tenantPreflight, 'release provenance must precede tenant/D1 preflight');
  assert.ok(provenance < identityApply, 'release provenance must precede identity mutation');
  assert.ok(provenance < fixtureApply, 'release provenance must precede canonical fixture mutation');
  assert.ok(provenance < lifecycleSmoke, 'release provenance must precede lifecycle execution');

  assert.match(WORKFLOW, /baseUrl !== 'https:\/\/airtrust-api-staging\.airtrust\.workers\.dev'/);
  assert.match(WORKFLOW, /payload\?\.data\?\.environment !== 'staging'/);
  assert.match(WORKFLOW, /const actualSha = String\(payload\?\.data\?\.sourceSha \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(WORKFLOW, /if \(actualSha !== expectedSha\)/);
  assert.match(WORKFLOW, /EDB_STAGING_RELEASE_SHA_MISMATCH/);
});

test('secret-bearing lifecycle remains serialized, staging-pinned, and ANAC-free', () => {
  assert.match(WORKFLOW, /group:\s*deploy-airtrust-staging/);
  assert.match(WORKFLOW, /STAGING_D1_NAME:\s*airtrust-db-staging-baseline-20260701/);
  assert.match(WORKFLOW, /environment:\s*staging/);
  assert.match(WORKFLOW, /final signed state: `OPERATOR_SIGNED`; no ANAC queue\/transmission is invoked/);
  assert.doesNotMatch(WORKFLOW, /wrangler\s+d1[^\n]*--env\s+production/i);
  assert.doesNotMatch(WORKFLOW, /https:\/\/api\.airtrust\.online/i);
});

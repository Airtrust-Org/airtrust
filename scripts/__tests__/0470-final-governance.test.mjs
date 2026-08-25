import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('standalone staging verification is read-only, staging-only and masks the real hash', () => {
  const workflow = read('.github/workflows/verify-0470-staging.yml');
  const script = read('scripts/staging/verify-0470-completion.sh');
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /RELEASE_SHA_MISMATCH/);
  assert.match(script, /airtrust-db-staging-baseline-20260701/);
  assert.match(script, /BLOCKED_PRODUCTION_DB_ID/);
  assert.match(script, /validate-0470-postconditions\.sh/);
  assert.match(script, /::add-mask::\$valid_hash/);
  assert.match(script, /NOT-A-HASH/);
  assert.doesNotMatch(script, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
});

test('production backfill is reachable only through production environment and exact confirmation', () => {
  const workflow = read('.github/workflows/backfill-validacao-hash.yml');
  const wrapper = read('scripts/production/backfill-validacao-hash-with-recovery-point.sh');
  const adapter = read('worker-airtrust/scripts/backfill-certificado-validacao-hash-production-remote.mjs');
  assert.match(workflow, /if: \$\{\{ inputs\.target == 'production' \}\}/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /CONFIRM_PRODUCTION_BACKFILL_VALIDACAO_HASH/);
  assert.match(workflow, /RELEASE_SHA_MISMATCH|release_sha não corresponde/);
  assert.match(workflow, /validate-0470-production-postconditions\.sh/);
  assert.match(wrapper, /RECOVERY_POINT_CAPTURED=true/);
  assert.match(wrapper, /BLOCKED_STAGING_DB_ID/);
  assert.match(wrapper, /--env production/);
  assert.match(adapter, /targetName: 'production'/);
  assert.match(adapter, /'--env', 'production'/);
  assert.doesNotMatch(adapter, /targetName: 'staging'/);
});

test('production 0470 validator is read-only and refuses the staging database id', () => {
  const script = read('scripts/schema-v2/validate-0470-production-postconditions.sh');
  assert.match(script, /airtrust-db/);
  assert.match(script, /BLOCKED_STAGING_DB_ID/);
  assert.match(script, /--env production/);
  assert.match(script, /PRODUCTION_0470_POSTCONDITIONS_OK/);
  assert.doesNotMatch(script, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
});

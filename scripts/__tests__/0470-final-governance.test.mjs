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

test('production 0470 backfill remains hard-blocked and executors fail closed', () => {
  const workflow = read('.github/workflows/backfill-validacao-hash.yml');
  const wrapper = read('scripts/production/backfill-validacao-hash-with-recovery-point.sh');
  const adapter = read('worker-airtrust/scripts/backfill-certificado-validacao-hash-production-remote.mjs');
  const validator = read('scripts/schema-v2/validate-0470-production-postconditions.sh');

  assert.match(workflow, /if: \$\{\{ false && inputs\.target == 'production' \}\}/);
  assert.match(workflow, /Production Backfill \(NOT executed by this workflow revision\)/);
  assert.doesNotMatch(workflow, /scripts\/production\/backfill-validacao-hash-with-recovery-point\.sh/);

  for (const source of [wrapper, adapter, validator]) {
    assert.match(source, /PRODUCTION_0470_.*DISABLED/);
    assert.doesNotMatch(source, /wrangler|CLOUDFLARE|--env production|\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  }
});

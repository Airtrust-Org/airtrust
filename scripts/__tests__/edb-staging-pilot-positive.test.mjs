import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const SEED = 'scripts/staging/seed-qa-edb-pilot.mjs';
const SMOKE = 'scripts/staging/smoke-edb-pilot-positive.mjs';
const WORKFLOW = '.github/workflows/edb-staging-pilot-positive.yml';

test('eDB positive seed is synthetic, tenant-6 and staging-D1 only', () => {
  const seed = read(SEED);
  assert.match(seed, /PILOT_TENANT_ID = 6/);
  assert.match(seed, /qa-edb-pilot@staging\.airtrust\.invalid/);
  assert.match(seed, /QA-EDB-PILOT/);
  assert.match(seed, /airtrust-db-staging-baseline-20260701/);
  assert.match(seed, /AIRTRUST_STAGING_EDB_PILOT_IDENTITY/);
  assert.match(seed, /--rollback/);
  assert.doesNotMatch(seed, /airtrust-db-production/);
  assert.doesNotMatch(seed, /airtrust-db-prod/);
});

test('eDB positive smoke is read-only after authentication', () => {
  const smoke = read(SMOKE);
  assert.match(smoke, /EXPECTED_EDB_RELEASE_SHA/);
  assert.match(smoke, /PILOT_TENANT_ID = 6/);
  assert.match(smoke, /\/api\/edb\/capability/);
  assert.match(smoke, /active-diary/);
  assert.match(smoke, /NON_OFFICIAL_SHADOW_PILOT_CAPABILITY/);
  assert.match(smoke, /officialLogbook.*false/);
  assert.match(smoke, /replacesPaper.*false/);
  assert.doesNotMatch(smoke, /fetchJson\(`\$\{baseUrl\}\/api\/edb\/[^`]+`,\s*\{[^}]*method\s*:/s);
  assert.doesNotMatch(smoke, /\/api\/controle-voos\//);
});

test('workflow is governed staging-only and cannot deploy infrastructure', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /AIRTRUST_EDB_STAGING_PILOT_POSITIVE/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /environment:\s*staging/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /QA_EDB_PILOT_PASSWORD:\s*\$\{\{ secrets\.STAGING_SMOKE_PASSWORD \}\}/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_WORKER_API_TOKEN/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_PAGES_API_TOKEN/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const SCRIPT = 'scripts/staging/smoke-edb-shadow-readonly.mjs';
const WORKFLOW = '.github/workflows/edb-staging-readonly-smoke.yml';

test('eDB staging smoke verifies exact release provenance and fail-closed access', () => {
  const script = read(SCRIPT);
  assert.match(script, /\/api\/version/);
  assert.match(script, /EXPECTED_EDB_RELEASE_SHA/);
  assert.match(script, /\/api\/edb\/capability/);
  assert.match(script, /MISSING_TOKEN/);
  assert.match(script, /EDB_SHADOW_DISABLED/);
  assert.match(script, /CANONICAL_QA_TENANT = 999002/);
  assert.match(script, /EDB_PILOT_TENANT = 6/);
});

test('eDB staging smoke performs no operational mutation', () => {
  const script = read(SCRIPT);

  // Authentication is the only allowed POST. eDB and flight-domain calls in
  // this smoke must remain GET-only.
  assert.doesNotMatch(script, /fetchJson\(`\$\{baseUrl\}\/api\/edb\/[^`]+`,\s*\{[^}]*method\s*:/s);
  assert.doesNotMatch(script, /\/api\/controle-voos\//);
  assert.doesNotMatch(script, /method:\s*['"](?:PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(script, /\b(?:create|update|delete|persist|append)Edb[A-Z]/);
});

test('workflow is main-dispatched, staging-environment scoped and has no infrastructure write secrets', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /AIRTRUST_EDB_STAGING_READONLY/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /environment:\s*staging/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /STAGING_SMOKE_EMAIL/);
  assert.match(workflow, /STAGING_SMOKE_PASSWORD/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_(?:D1|WORKER|PAGES).*TOKEN/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|d1)/);
});

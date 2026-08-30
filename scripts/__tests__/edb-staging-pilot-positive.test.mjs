// source_reference: PR #110 eDB staging pilot QA fixture regression coverage.
// operational_decision: static tests only; validate staging-only synthetic fixture contracts without executing D1 writes.
// dry_run_required: this test file executes no operational SQL and performs no remote mutation.
// rollback_plan_required: no runtime mutation originates here; governed fixture rollback remains in seed-qa-edb-pilot.mjs.

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

test('eDB pilot QA employee is bound to an exact synthetic sector', () => {
  const seed = read(SEED);
  assert.match(seed, /PILOT_SECTOR_CODE = 'QA-EDB-PILOT'/);
  assert.match(seed, /PILOT_SECTOR_DOMAIN = 'OPERACOES'/);
  assert.match(seed, /function ensurePilotSector\(dbName\)/);
  assert.match(seed, /EDB_PILOT_SECTOR_CODE_COLLISION/);
  assert.match(seed, /exact_synthetic_count/);
  assert.match(seed, /SELECT 1 FROM setores s\s+WHERE s\.codigo = \$\{e\(PILOT_SECTOR_CODE\)\} AND s\.empresa_id = emp\.id\s+\);/s);
  assert.match(seed, /ensurePilotSector\(dbName\);/);
  assert.match(seed, /setor_id = \(\s*SELECT s\.id FROM setores s/s);
  assert.match(seed, /UPDATE setores\s+SET ativo = 0/s);
  assert.match(seed, /descricao = \$\{e\(PILOT_SECTOR_DESCRIPTION\)\}/);
  assert.match(seed, /responsavel = \$\{e\(PILOT_SECTOR_RESPONSIBLE\)\}/);
  assert.doesNotMatch(seed, /setor\s*=\s*'QA eDB',\s*setor_id\s*=\s*NULL/);
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

test('eDB positive smoke proves upstream ApiError 404 is preserved safely', () => {
  const smoke = read(SMOKE);
  assert.match(smoke, /IMPOSSIBLE_FLIGHT_ID = 2147483647/);
  assert.match(smoke, /\/api\/edb\/voos\/\$\{IMPOSSIBLE_FLIGHT_ID\}\/readiness/);
  assert.match(smoke, /missingFlightReadiness\.status === 404/);
  assert.match(smoke, /CONTROLE_VOOS_NOT_FOUND/);
  assert.match(smoke, /Operação eDB shadow rejeitada/);
  assert.match(smoke, /!JSON\.stringify\(missingFlightReadiness\.json \|\| \{\}\)\.includes\('Voo nao encontrado'\)/);
  assert.match(smoke, /EDB_STAGING_PILOT_APIERROR_404_PASS/);
  assert.doesNotMatch(smoke, /EDB_SHADOW_INTERNAL_ERROR.*===/);
});

test('workflow is governed staging-only and cannot deploy infrastructure', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /AIRTRUST_EDB_STAGING_PILOT_POSITIVE/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /environment:\s*\n\s*staging/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /QA_EDB_PILOT_PASSWORD:\s*\$\{\{ secrets\.STAGING_SMOKE_PASSWORD \}\}/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_WORKER_API_TOKEN/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_PAGES_API_TOKEN/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/production-release-readonly-preflight.yml';
const SCRIPT = 'scripts/production/release-readonly-preflight.mjs';

const PROD_DB_NAME = 'airtrust-db';
const PROD_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*[|>-]?\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() && lines[j].search(/\S/) <= indent) break;
      body.push(lines[j]);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

test('workflow is manual, exact-main-SHA and production-environment scoped', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /refs\/heads\/main/);
  assert.match(wf, /AIRTRUST_PRODUCTION_READONLY_PREFLIGHT/);
  assert.match(wf, /EXPECTED_SHA.*EVENT_SHA/s);
  assert.match(wf, /environment:\s*production/);
  assert.match(wf, /permissions:\s*\n\s*contents:\s*read/);
});

test('workflow uses production Environment D1 credential and never exposes SQL input', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN\s*\}\}/);
  assert.match(wf, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  const inputs = wf.slice(wf.indexOf('inputs:'), wf.indexOf('\npermissions:'));
  assert.doesNotMatch(inputs, /\b(sql|query|database|db_name|db_id|target)\b/i);
  for (const block of runBlocks(wf)) {
    assert.ok(!block.includes('${{ inputs.'), 'dispatch input interpolated directly into a run block');
  }
});

test('script hard-pins production D1 and blocks staging D1', () => {
  const s = read(SCRIPT);
  assert.match(s, new RegExp(`PRODUCTION_DB_NAME = '${PROD_DB_NAME}'`));
  assert.match(s, new RegExp(`PRODUCTION_DB_ID = '${PROD_DB_ID}'`));
  assert.match(s, new RegExp(`STAGING_DB_ID = '${STAGING_DB_ID}'`));
  assert.match(s, /PRODUCTION_TARGET_MISMATCH/);
  assert.match(s, /STAGING_TARGET_REJECTED/);
  assert.match(s, /WRANGLER_PRODUCTION_DB_ID_MISMATCH/);
});

test('remote SQL contract is fixed read-only SELECT/PRAGMA only', () => {
  const s = read(SCRIPT);
  assert.match(s, /assertReadOnlySql/);
  assert.match(s, /NON_READONLY_SQL_REJECTED/);
  assert.match(s, /MUTATING_SQL_REJECTED/);
  assert.match(s, /MULTI_STATEMENT_SQL_REJECTED/);
  assert.match(s, /normalized\.startsWith\('SELECT '\)/);
  assert.match(s, /table_info/);
  assert.doesNotMatch(s, /wrangler\s+d1\s+migrations\s+apply/i);
  assert.doesNotMatch(s, /['"]--file['"]/);
  assert.doesNotMatch(s, /`\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\s+/i);
});

test('governed FRMS catalogue is derived from reviewed 128-parameter baseline', () => {
  const s = read(SCRIPT);
  assert.match(s, /parseGovernedParameterKeys/);
  assert.match(s, /frms_helicopter_offshore_baseline_v1\.sql/);
  assert.match(s, /GOVERNED_PARAMETER_SEED_KEY_MISMATCH/);
  assert.match(s, /unique\.length !== 128/);

  const seed = read('scripts/frms-seeds/frms_helicopter_offshore_baseline_v1.sql');
  const revision = 'frms-helicopter-offshore-baseline-v1';
  const pattern = new RegExp(
    "\\('" + revision + "-([A-Z][A-Z0-9_]*)',\\s*'" + revision + "',\\s*'([A-Z][A-Z0-9_]*)',",
    'g',
  );
  const rows = [...seed.matchAll(pattern)];
  assert.equal(rows.length, 128);
  assert.ok(rows.every((row) => row[1] === row[2]));
  assert.equal(new Set(rows.map((row) => row[1])).size, 128);
});

test('FRMS production readiness checks assignment profile revision and all governed parameters', () => {
  const s = read(SCRIPT);
  assert.match(s, /FROM frms_profile_assignments/);
  assert.match(s, /FROM frms_regulatory_profiles/);
  assert.match(s, /FROM frms_config_revisions/);
  assert.match(s, /FROM frms_config_parameters/);
  assert.match(s, /REQUIRED_PARAMETERS_INCOMPLETE/);
  assert.match(s, /requiredGovernedParameterCount/);
  assert.match(s, /notReadyTenantCount/);
  assert.match(s, /missingAssignmentTenantIds/);
  assert.match(s, /missingAssignmentTenantIds\.push\(empresaId\)/);
  assert.match(s, /missingAssignmentDetails/);
  assert.match(s, /service_category/);
  assert.match(s, /profileDecisionProven/);
});

test('multi-profile auth authority is checked structurally and fail-closed', () => {
  const s = read(SCRIPT);
  assert.match(s, /usuarios_empresas_perfis/);
  assert.match(s, /uniqueConstraint/);
  assert.match(s, /backfillGaps/);
  assert.match(s, /orphanRows/);
  assert.match(s, /AUTH_MULTI_PROFILE_AUTHORITY_NOT_READY/);
});

test('0487 is classified read-only as pending, applied verified, or drift', () => {
  const s = read(SCRIPT);
  assert.match(s, /qualificacoes-renovacoes-0487/);
  assert.match(s, /qualificacoes_renovacoes/);
  assert.match(s, /APPLY_READY_PENDING/);
  assert.match(s, /APPLIED_VERIFIED/);
  assert.match(s, /QUALIFICACOES_RENOVACOES_0487_APPLY_REQUIRED/);
  assert.match(s, /QUALIFICACOES_RENOVACOES_0487_DRIFT/);
});

test('release readiness requires production version, exact staging provenance, schema, auth, FRMS and 0487', () => {
  const s = read(SCRIPT);
  assert.match(s, /productionVersionReady/);
  assert.match(s, /stagingMatchesRelease/);
  assert.match(s, /productionVersionReady\s*&&\s*stagingMatchesRelease\s*&&\s*schema\.ready\s*&&\s*authAuthority\.ready\s*&&\s*frms\.ready\s*&&\s*qualificationRenewals\.readyForRelease/s);
  assert.match(s, /PRODUCTION_VERSION_UNREADABLE_OR_WRONG_ENV/);
  assert.match(s, /STAGING_RELEASE_SHA_MISMATCH/);
});

test('workflow itself performs no production deploy, schema apply or migration', () => {
  const wf = read(WORKFLOW);
  assert.doesNotMatch(wf, /deploy-airtrust\.yml/);
  assert.doesNotMatch(wf, /apply-schema-change-v2\.yml/);
  assert.doesNotMatch(wf, /wrangler\s+deploy/);
  assert.doesNotMatch(wf, /pages\s+deploy/);
  assert.doesNotMatch(wf, /d1\s+migrations\s+apply/);
  assert.doesNotMatch(wf, /--file/);
});

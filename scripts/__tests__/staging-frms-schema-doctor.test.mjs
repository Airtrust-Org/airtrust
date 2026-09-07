import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/staging-frms-schema-doctor.yml';
const SCRIPT = 'scripts/staging/frms-schema-doctor-readonly.mjs';

const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';

function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*[|>-]?\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

// --- Workflow governance -----------------------------------------------------

test('workflow is main-only, staging-scoped, read-only permissioned and confirmation-gated', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /on:\s*\n\s*workflow_dispatch:/);
  assert.match(wf, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(wf, /refs\/heads\/main/);
  assert.match(wf, /AIRTRUST_STAGING_FRMS_SCHEMA_DOCTOR/);
  assert.match(wf, /environment:\s*staging/);
  // The D1 job must declare the staging environment.
  const doctorJob = wf.slice(wf.indexOf('  doctor:'));
  assert.match(doctorJob, /environment:\s*staging/);
});

test('workflow does NOT require expected_deployed_sha == github.sha, but DOES verify live staging provenance', () => {
  const wf = read(WORKFLOW);
  assert.doesNotMatch(wf, /EXPECTED_DEPLOYED_SHA["' ]*==["' ]*\$?\{?GITHUB_SHA/i);
  assert.doesNotMatch(wf, /\$EXPECTED_DEPLOYED_SHA["' ]*==["' ]*"\$EVENT_SHA"/);
  assert.match(wf, /\/api\/version/);
  assert.match(wf, /STAGING_WORKER_SHA_MISMATCH/);
  assert.match(wf, /STAGING_ENV_MISMATCH/);
  assert.match(wf, /EXPECTED_DEPLOYED_SHA.*=~.*\^\[0-9a-fA-F\]\{40\}\$/);
});

test('workflow pins the staging D1 target and blocks the production D1 id', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, new RegExp(`ALLOWED_STAGING_DB_NAME:\\s*${STAGING_DB_NAME}`));
  assert.match(wf, new RegExp(`ALLOWED_STAGING_DB_ID:\\s*${STAGING_DB_ID}`));
  assert.match(wf, new RegExp(`BLOCKED_PRODUCTION_DB_ID:\\s*${PRODUCTION_DB_ID}`));
  // The DB name/id must never be a workflow_dispatch input: inspect only the
  // inputs: block (between "inputs:" and the next top-level "concurrency:"/"env:").
  const inputsBlock = wf.slice(wf.indexOf('inputs:'), wf.search(/\nconcurrency:|\nenv:/));
  assert.doesNotMatch(inputsBlock, /(db_name|database_name|db_id|database_id|target_db)/i);
  // Exactly the two governed inputs.
  assert.match(inputsBlock, /confirmation:/);
  assert.match(inputsBlock, /expected_deployed_sha:/);
});

test('workflow never interpolates a workflow_dispatch input inside a run block', () => {
  const wf = read(WORKFLOW);
  for (const block of runBlocks(wf)) {
    assert.ok(!block.includes('${{ inputs.'), `run block interpolates inputs:\n${block}`);
    assert.ok(!block.includes('${{ github.event.inputs.'), `run block interpolates event inputs:\n${block}`);
  }
});

test('workflow consumes the D1 migration token from the staging Environment only and never deploys', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN\s*\}\}/);
  assert.match(wf, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  // No direct generic token, no worker/pages deploy verbs.
  assert.doesNotMatch(wf, /secrets\.CLOUDFLARE_API_TOKEN\b/);
  assert.doesNotMatch(wf, /wrangler\s+(?:deploy|pages\s+deploy)/);
  assert.doesNotMatch(wf, /wrangler\s+d1\s+migrations\s+apply/);
  assert.doesNotMatch(wf, /apply_migrations|approved_migrations/);
  // Never echo a secret variable.
  assert.doesNotMatch(wf, /\becho\b[^\n]*\$\{?CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(wf, /set\s+-x/);
});

// --- Read-only script contract --------------------------------------------

test('script hard-pins staging D1 and hard-blocks production/development ids', () => {
  const s = read(SCRIPT);
  assert.match(s, new RegExp(`ALLOWED_STAGING_DB_NAME\\s*=\\s*'${STAGING_DB_NAME}'`));
  assert.match(s, new RegExp(`ALLOWED_STAGING_DB_ID\\s*=\\s*'${STAGING_DB_ID}'`));
  assert.match(s, new RegExp(`'${PRODUCTION_DB_ID}'`));
  assert.match(s, /assertStagingTarget/);
  assert.match(s, /TARGET_IS_PRODUCTION_OR_DEV_BLOCKED/);
  assert.match(s, /TARGET_NOT_STAGING/);
});

test('script enforces a read-only SQL contract and never uses --file / migrations apply / DML / DDL', () => {
  const s = read(SCRIPT);
  assert.match(s, /assertReadOnlySql/);
  assert.match(s, /MUTATING_SQL\s*=/);
  assert.match(s, /NOT_READ_ONLY_SQL/);
  assert.match(s, /MUTATING_SQL_BLOCKED/);
  assert.match(s, /MULTI_STATEMENT_SQL_BLOCKED/);
  // wrangler is only ever called with --command (never --file), always --json, always --remote read.
  assert.match(s, /'d1',\s*'execute',\s*dbName,\s*'--remote',\s*'--json',\s*'--command'/);
  assert.doesNotMatch(s, /['"]--file['"]/); // never passes --file as a wrangler arg
  assert.doesNotMatch(s, /migrations['"\s,]+apply|d1 migrations apply/);
  // No mutating verbs are ever *issued* by the script (denylist string in the
  // guard regex is fine; an actual statement is not).
  assert.doesNotMatch(s, /`\s*(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|REPLACE\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i);
});

test('script derives required tables/columns from the real migrations and runtime source (no hardcoded guess list)', () => {
  const s = read(SCRIPT);
  assert.match(s, /readMigration\('0463_frms_iogp_schema_v2'\)/);
  assert.match(s, /readMigration\('0464_frms_parameter_governance_recalc'\)/);
  assert.match(s, /parseCreateTables/);
  assert.match(s, /parseCreateIndexes/);
  assert.match(s, /parseAddedColumns/);
  assert.match(s, /parseLimitesDefaultKeys/);
  assert.match(s, /'src',\s*'lib',\s*'frms',\s*'types\.ts'/);
  assert.match(s, /LIMITES_DEFAULT/);
});

test('script probes the three runtime resolution queries against parameter-governance.ts shape', () => {
  const s = read(SCRIPT);
  assert.match(s, /frms_profile_assignments a/);
  assert.match(s, /JOIN frms_regulatory_profiles p ON p\.id = a\.regulatory_profile_id/);
  assert.match(s, /FROM frms_config_revisions/);
  assert.match(s, /profile_code = 'LEGACY_GENERAL' AND status = 'ACTIVE'/);
  assert.match(s, /FROM frms_config_parameters WHERE revision_id = /);
  assert.match(s, /LIMIT 0/);
  assert.match(s, /runtimeQueryAssignment/);
  assert.match(s, /runtimeQueryRevision/);
  assert.match(s, /runtimeQueryParameters/);
});

test('script verifies the 0464 bootstrap revision + parameter coverage and treats schema as authority over ledger', () => {
  const s = read(SCRIPT);
  assert.match(s, /legacyActiveRevisionCount/);
  assert.match(s, /legacyParameterCount/);
  assert.match(s, /requiredKeysPresent/);
  assert.match(s, /bootstrapReady/);
  assert.match(s, /SCHEMA REAL > LEDGER|schema.*authority.*ledger/i);
  assert.match(s, /d1_migrations/);
  assert.match(s, /airtrust_schema_changes_v2/);
});

test('script emits a machine-readable verdict and fails closed', () => {
  const s = read(SCRIPT);
  assert.match(s, /stagingSchemaParity/);
  assert.match(s, /missingObjects/);
  assert.match(s, /missingColumns/);
  assert.match(s, /bootstrapMissing/);
  assert.match(s, /missingMigrationsCandidates/);
  assert.match(s, /FRMS_SCHEMA_DOCTOR_PASS/);
  assert.match(s, /FRMS_SCHEMA_DOCTOR_FAIL/);
  assert.match(s, /process\.exitCode = 1/);
});

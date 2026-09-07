import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/staging-frms-0464-bootstrap-repair.yml';
const SCRIPT = 'scripts/staging/frms-0464-bootstrap-repair.mjs';

const STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';

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

test('workflow is manual, main-only and staging-environment scoped', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /refs\/heads\/main/);
  assert.match(wf, /environment:\s*staging/);
  assert.match(wf, /permissions:\s*\n\s*contents:\s*read/);
});

test('workflow separates preflight and apply confirmations', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /AIRTRUST_STAGING_FRMS_0464_BOOTSTRAP_PREFLIGHT/);
  assert.match(wf, /AIRTRUST_STAGING_FRMS_0464_BOOTSTRAP_APPLY/);
  assert.match(wf, /mode:/);
  assert.match(wf, /- preflight/);
  assert.match(wf, /- apply/);
});

test('workflow pins staging target and blocks production target', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, new RegExp(`ALLOWED_STAGING_DB_NAME:\\s*${STAGING_DB_NAME}`));
  assert.match(wf, new RegExp(`ALLOWED_STAGING_DB_ID:\\s*${STAGING_DB_ID}`));
  assert.match(wf, new RegExp(`BLOCKED_PRODUCTION_DB_ID:\\s*${PRODUCTION_DB_ID}`));

  const inputsBlock = wf.slice(wf.indexOf('inputs:'), wf.indexOf('\nconcurrency:'));
  assert.doesNotMatch(inputsBlock, /(db_name|database_name|db_id|database_id|target_db|sql)/i);
});

test('workflow verifies the actually deployed staging SHA, not github.sha equality', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /\/api\/version/);
  assert.match(wf, /STAGING_WORKER_SHA_MISMATCH/);
  assert.match(wf, /STAGING_ENV_MISMATCH/);
  assert.doesNotMatch(wf, /EXPECTED_DEPLOYED_SHA["' ]*==["' ]*\$?\{?GITHUB_SHA/i);
});

test('workflow consumes Cloudflare credentials only from staging Environment', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN\s*\}\}/);
  assert.match(wf, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  assert.doesNotMatch(wf, /secrets\.CLOUDFLARE_API_TOKEN\b/);
  assert.doesNotMatch(wf, /set\s+-x/);
});

test('workflow never interpolates dispatch inputs directly inside run blocks', () => {
  const wf = read(WORKFLOW);
  for (const block of runBlocks(wf)) {
    assert.ok(!block.includes('${{ inputs.'), `run block interpolates an input:\n${block}`);
    assert.ok(!block.includes('${{ github.event.inputs.'), `run block interpolates an input:\n${block}`);
  }
});

test('script hard-pins staging D1 and blocks production/development ids', () => {
  const source = read(SCRIPT);
  assert.match(source, new RegExp(`STAGING_DB_NAME = '${STAGING_DB_NAME}'`));
  assert.match(source, new RegExp(`STAGING_DB_ID = '${STAGING_DB_ID}'`));
  assert.match(source, new RegExp(`PRODUCTION_DB_ID = '${PRODUCTION_DB_ID}'`));
  assert.match(source, /TARGET_NOT_CANONICAL_STAGING/);
  assert.match(source, /TARGET_IS_PRODUCTION_OR_DEVELOPMENT_BLOCKED/);
});

test('script derives required operational keys from canonical LIMITES_DEFAULT', () => {
  const source = read(SCRIPT);
  assert.match(source, /parseLimitesDefaultKeys/);
  assert.match(source, /worker-airtrust.*src.*lib.*frms.*types\.ts/s);
  assert.match(source, /LIMITES_DEFAULT/);
  assert.doesNotMatch(source, /const\s+REQUIRED_KEYS\s*=\s*\[/);
});

test('preflight is read-only and validates source completeness', () => {
  const source = read(SCRIPT);
  assert.match(source, /assertReadOnlySql/);
  assert.match(source, /NOT_READ_ONLY_SQL/);
  assert.match(source, /MUTATING_SQL_BLOCKED/);
  assert.match(source, /PRAGMA table_info/);
  assert.match(source, /FROM frms_configuracao_limites/);
  assert.match(source, /invalid_value_count/);
  assert.match(source, /invalid_unit_count/);
  assert.match(source, /duplicateKeys/);
  assert.match(source, /missingKeys/);
});

test('prepared apply is one allowlisted idempotent insert into frms_config_parameters', () => {
  const source = read(SCRIPT);
  assert.match(source, /INSERT INTO frms_config_parameters/);
  assert.match(source, /FROM frms_configuracao_limites s/);
  assert.match(source, /NOT EXISTS \(SELECT 1 FROM frms_config_parameters t/);
  assert.match(source, /frms-legacy-global-v2/);
  assert.match(source, /'frms-legacy-limit-' \|\| s\.nome/);
  assert.match(source, /'LEGACY_LIMIT'/);
  assert.match(source, /assertApplySql/);
  assert.match(source, /APPLY_SQL_TARGET_REJECTED/);
  assert.match(source, /APPLY_SQL_NOT_IDEMPOTENT/);
});

test('script contains no update/delete/ddl repair path or migration replay', () => {
  const source = read(SCRIPT);
  // These verbs may appear in denylist regexes or explanatory marker strings,
  // but there must be no executable SQL template beginning with them.
  assert.doesNotMatch(source, /`\s*UPDATE\s+/i);
  assert.doesNotMatch(source, /`\s*DELETE\s+FROM\s+/i);
  assert.doesNotMatch(source, /`\s*(CREATE|ALTER|DROP)\s+/i);
  assert.doesNotMatch(source, /wrangler\s+d1\s+migrations\s+apply/i);
  assert.doesNotMatch(source, /['"]--file['"]/);
  assert.match(source, /replays0464:\s*false/);
  assert.match(source, /touchesLedger:\s*false/);
});

test('apply cannot run unless the complete source and exact target revision pass preflight', () => {
  const source = read(SCRIPT);
  assert.match(source, /source\.ready/);
  assert.match(source, /target\.revisionCount === 1/);
  assert.match(source, /target\.fixedRevisionIsOnlyActive/);
  assert.match(source, /target\.requiredDuplicateKeys\.length === 0/);
  assert.match(source, /target\.idCollisions\.length === 0/);
  assert.match(source, /APPLY_NOT_READY_PREFLIGHT_FAILED/);
});

test('apply postcondition requires all derived keys present and no duplicates', () => {
  const source = read(SCRIPT);
  assert.match(source, /targetAfter\.requiredPresentCount === requiredKeys\.length/);
  assert.match(source, /targetAfter\.requiredMissingCount === 0/);
  assert.match(source, /targetAfter\.requiredDuplicateKeys\.length === 0/);
  assert.match(source, /APPLY_POSTCONDITION_FAILED/);
});

test('operational SQL provenance markers are present for DML guard', () => {
  const source = read(SCRIPT);
  for (const marker of [
    'source_reference',
    'operational_decision',
    'dry_run_required',
    'rollback_plan_required',
  ]) {
    assert.ok(source.includes(marker), `missing governance marker: ${marker}`);
  }
});

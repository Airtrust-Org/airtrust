import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/frms-production-assignment-readonly-inventory.yml';
const SCRIPT = 'scripts/production/frms-assignment-readonly-inventory.mjs';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

function runBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(\s*)run:\s*[|>-]?\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    for (let c = i + 1; c < lines.length; c += 1) {
      if (lines[c].trim() && lines[c].search(/\S/) <= indent) break;
      body.push(lines[c]);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

test('workflow is main-only, confirmation-gated, expected_sha == github.sha, read-only permissioned', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /on:\s*\n\s*workflow_dispatch:/);
  assert.match(wf, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(wf, /refs\/heads\/main/);
  assert.match(wf, /AIRTRUST_FRMS_PRODUCTION_ASSIGNMENT_INVENTORY/);
  assert.match(wf, /EXPECTED_SHA["' ]*==["' ]*"\$EVENT_SHA"/);
  assert.match(wf, /EXPECTED_SHA_MISMATCH/);
});

test('workflow inventory job runs in the production Environment with the D1 read credential', () => {
  const wf = read(WORKFLOW);
  const invJob = wf.slice(wf.indexOf("  d1-readonly-inventory:"));
  assert.match(invJob, /environment:\s*production/);
  assert.match(invJob, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN\s*\}\}/);
  assert.match(invJob, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  assert.doesNotMatch(wf, /secrets\.CLOUDFLARE_API_TOKEN\b/);
});

test('workflow hard-pins production D1 and hard-blocks the staging D1 id; no free DB input', () => {
  const wf = read(WORKFLOW);
  assert.match(wf, new RegExp(`PRODUCTION_D1_NAME:\\s*airtrust-db`));
  assert.match(wf, new RegExp(`PRODUCTION_D1_ID:\\s*${PRODUCTION_DB_ID}`));
  assert.match(wf, new RegExp(`BLOCKED_STAGING_D1_ID:\\s*${STAGING_DB_ID}`));
  const inputsBlock = wf.slice(wf.indexOf('inputs:'), wf.search(/\nconcurrency:/));
  assert.doesNotMatch(inputsBlock, /(db_name|database_name|db_id|database_id|target_db|empresa_id|tenant)/i);
});

test('workflow never deploys, never applies migrations/schema, never interpolates inputs into run', () => {
  const wf = read(WORKFLOW);
  assert.doesNotMatch(wf, /wrangler\s+(?:deploy|pages\s+deploy)/);
  assert.doesNotMatch(wf, /d1\s+migrations\s+apply|apply-schema-change-v2|schema-v2/i);
  assert.doesNotMatch(wf, /apply_migrations|approved_migrations|deploy_worker|deploy_frontend/);
  for (const block of runBlocks(wf)) {
    assert.ok(!block.includes('${{ inputs.'), `run block interpolates inputs:\n${block}`);
  }
  assert.doesNotMatch(wf, /\becho\b[^\n]*\$\{?CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(wf, /set\s+-x/);
});

test('script enforces a read-only SQL contract, hard-pins production, blocks non-production ids', () => {
  const s = read(SCRIPT);
  assert.match(s, new RegExp(`PRODUCTION_DB_ID\\s*=\\s*'${PRODUCTION_DB_ID}'`));
  assert.match(s, new RegExp(`BLOCKED_STAGING_DB_ID\\s*=\\s*'${STAGING_DB_ID}'`));
  assert.match(s, /assertProductionTarget/);
  assert.match(s, /TARGET_IS_NON_PRODUCTION_BLOCKED/);
  assert.match(s, /TARGET_NOT_PRODUCTION/);
  assert.match(s, /MUTATING_SQL\s*=/);
  assert.match(s, /assertReadOnlySql/);
  assert.match(s, /NOT_READ_ONLY_SQL/);
  assert.match(s, /MUTATING_SQL_BLOCKED/);
  assert.match(s, /READ_ONLY_PREFIX\s*=\s*\/\^\\s\*\(SELECT\|PRAGMA\\s\+table_info\)/);
  // Uses the Cloudflare D1 REST API directly (like release-readonly-preflight.mjs),
  // never wrangler / wrangler.toml — so it cannot be diverted by config or --file.
  assert.match(s, /api\.cloudflare\.com\/client\/v4\/accounts\/[^/]*\/d1\/database\/\$\{PRODUCTION_DB_ID\}\/query/);
  assert.doesNotMatch(s, /\bwrangler\b/);
  assert.doesNotMatch(s, /['"]--file['"]/);
  assert.doesNotMatch(s, /`\s*(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|REPLACE\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)/i);
});

test('script never selects PII columns; only empresa_id + technical FRMS governance fields', () => {
  const s = read(SCRIPT);
  // No name/email/document/cpf/token columns anywhere in the SQL.
  assert.doesNotMatch(s, /SELECT[\s\S]*?\b(nome|email|e-mail|cpf|rg|passaporte|documento|token|senha|password)\b/i);
  assert.match(s, /empresa_id/);
  assert.match(s, /frms_profile_assignments/);
  assert.match(s, /frms_regulatory_profiles/);
  assert.match(s, /frms_config_revisions/);
  assert.match(s, /frms_config_parameters/);
});

test('script proves the profile decision only from the tenant own single active profile, never by inference', () => {
  const s = read(SCRIPT);
  assert.match(s, /NO_APPLICABLE_REGULATORY_PROFILE_FOR_TENANT/);
  assert.match(s, /MULTIPLE_APPLICABLE_REGULATORY_PROFILES_FOR_TENANT/);
  assert.match(s, /AMBIGUOUS_ACTIVE_GOVERNED_REVISION/);
  assert.match(s, /activeRegulatoryProfiles\.length === 1/);
  assert.match(s, /activeRegulatoryProfileCount > 1/);
  assert.match(s, /FRMS_PROFILE_DECISION_REQUIRES_EXPLICIT_BUSINESS_AUTHORIZATION/);
  // Must NOT hardcode a default profile.
  assert.doesNotMatch(s, /profileCode\s*=\s*['"](LEGACY_GENERAL|HELICOPTER_OFFSHORE)['"]/);
  assert.doesNotMatch(s, /\|\|\s*['"](LEGACY_GENERAL|HELICOPTER_OFFSHORE)['"]/);
  assert.match(s, /writes:\s*0/);
  assert.match(s, /readOnly:\s*true/);
});

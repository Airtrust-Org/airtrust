import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL(
  '../../.github/workflows/staging-player3-synthetic-d1-readonly.yml',
  import.meta.url,
), 'utf8');

test('Player 3 inventory runs only on trusted main and fixed staging D1', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /AIRTRUST_PLAYER3_STAGING_READONLY/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /bf9963f4-eb12-439b-a830-20bbf577ac22/);
  assert.match(workflow, /7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae/);
  assert.match(workflow, /PRODUCTION_TARGET_REJECTED/);
  assert.match(workflow, /STAGING_WRANGLER_D1_PIN_MISMATCH/);
  assert.match(workflow, /STAGING_WRANGLER_D1_BINDING_VERIFIED/);
  assert.match(workflow, /secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
});

test('Read-only SQL is a single SELECT restricted to the synthetic QA company', () => {
  const match = workflow.match(/cat > "\$QUERY_FILE" <<'SQL'\n([\s\S]*?)\n\s+SQL/);
  assert.ok(match, 'fixed query heredoc');
  const sql = match[1];
  assert.match(sql, /^\s+SELECT\b/i);
  assert.equal((sql.match(/\bSELECT\b/gi) || []).length > 0, true);
  assert.equal((sql.match(/;/g) || []).length, 1, 'exactly one SQL statement');
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/i);
  assert.match(sql, /qa_examiner_training/);
  assert.match(sql, /QA-PARTICIPANTE-ALFA/);
  assert.match(sql, /QA-PARTICIPANTE-BRAVO/);
  assert.match(sql, /qa-player3-chromium@staging\.airtrust\.invalid/);
  assert.match(sql, /qa-player3-webkit@staging\.airtrust\.invalid/);
  assert.match(sql, /COUNT\(DISTINCT f\.id\)/);
  assert.match(sql, /JOIN lms_native_catalog_activation a ON a\.curso_id=ed\.curso_id/);
  assert.doesNotMatch(sql, /empresa_id\s*=\s*6\b/i);
  assert.match(workflow, /wrangler d1 execute "\$EXPECTED_STAGING_DB" --env staging --remote --json --file "\$QUERY_FILE"/);
});

test('Diagnostic never declares acceptance nor makes a mutation from its outcome', () => {
  assert.match(workflow, /No data was changed\. This is not a six-journey E2E acceptance/);
  assert.match(workflow, /PLAYER3_PENDING_GATE_NAMES/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /\b(?:workflow_call|schedule):/);
  assert.doesNotMatch(workflow, /wrangler d1 (?:migrations|time-travel|import)/i);
  assert.doesNotMatch(workflow, /wrangler r2 object put/i);
});

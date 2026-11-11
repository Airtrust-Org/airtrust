// source_reference: reviewed ANAC 1167/2026 private manifest, tenant 6 (2026-10-08).
// operational_decision: only seven owner-authorized future solo classes via authenticated API; never D1 SQL mutation.
// dry_run_required: same-SHA read-only preflight and candidate fingerprint before apply.
// rollback_plan_required: GitHub Actions captures D1 Time Travel recovery point; API readback checks full integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateManifest } from '../anac1167-training-plan-import.mjs';

const script = readFileSync(new URL('../anac1167-training-plan-import.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../../.github/workflows/production-anac1167-seven-planned-training.yml', import.meta.url), 'utf8');

test('private roster is never committed; unauthorized contents fail SHA pin', () => {
  assert.throws(() => validateManifest('{}'), /MANIFEST_DIGEST_MISMATCH/);
  assert.match(script, /PRIVATE_SHA='[0-9a-f]{64}'/);
  assert.match(workflow, /AIRTRUST_ANAC1167_PLAN_B64/);
  assert.doesNotMatch(workflow, /Diego Bichara|Gabriel Ferreira|Adriana Brasil|Carlos Jose/);
});

test('dry-run is strictly read-only and apply uses authorized authenticated route', () => {
  assert.match(script, /if\(MODE==='dry-run'\)\{output\(result\);return;\}/);
  assert.match(script, /API\+'\/api\/treinamentos\/planejados'/);
  assert.match(script, /for\(const c of m\.candidates\)await create\(token,c\.payload\)/);
  assert.match(script, /D1_READONLY_ONLY/);
  assert.doesNotMatch(script, /POST.*convocacoes/);
  assert.doesNotMatch(script, /wrangler.*(?:INSERT INTO|UPDATE .* SET|DELETE FROM)/);
});

test('production apply is tied to reviewed same-SHA dry-run and recovery point', () => {
  assert.match(workflow, /REVIEWED_RUN_INVALID/);
  assert.match(workflow, /ANAC1167_REVIEWED_STATE_HASH/);
  assert.match(workflow, /D1_RECOVERY_TIMESTAMP_UTC/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /status.*PLANEJADO|ANAC1167_APPLY_SEVEN_TURMAS_TENANT6_NO_EMAIL/);
});

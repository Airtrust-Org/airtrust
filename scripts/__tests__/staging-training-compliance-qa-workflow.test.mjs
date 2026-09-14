import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-training-compliance-qa.yml', 'utf8');
const seed = readFileSync('scripts/staging/seed-qa-training-compliance.mjs', 'utf8');
const spec = readFileSync('e2e/frontend-pr-ui-qa/training-compliance.spec.ts', 'utf8');

test('compliance staging QA is main-only, staging-only and exact-SHA guarded', () => {
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /expected_deployed_sha/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /airtrust-api-staging\.airtrust\.workers\.dev/);
  assert.doesNotMatch(workflow, /api\.airtrust\.online/);
});

test('synthetic fixture is isolated, confirmed and always cleaned', () => {
  assert.match(seed, /qa_examiner_training/);
  assert.match(seed, /AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA_SEED/);
  assert.match(seed, /QA-COMP-/);
  assert.match(workflow, /if: always\(\) && needs\.d1_fixture\.result != 'skipped'/);
  assert.match(workflow, /--rollback --apply/);
  execFileSync('node', ['--check', 'scripts/staging/seed-qa-training-compliance.mjs']);
});

test('browser QA stays read-only and proves never-realized compliance', () => {
  assert.match(spec, /installReadOnlyGuard/);
  assert.match(spec, /nao_realizados/);
  assert.match(spec, /toBe\(0\)/);
  assert.match(spec, /guard\.assertClean\(\)/);
  assert.doesNotMatch(spec, /request\.(post|put|patch|delete)/i);
});

test('organizational and enrollment reconciliation schemas are validated before browser QA', () => {
  assert.match(workflow, /validate-0491-postconditions\.sh/);
  assert.match(workflow, /validate-0492-postconditions\.sh/);
  assert.match(workflow, /validate-0494-postconditions\.sh/);
  assert.match(spec, /matriz-organizacao/);
  assert.match(spec, /reconciliacao/);
});

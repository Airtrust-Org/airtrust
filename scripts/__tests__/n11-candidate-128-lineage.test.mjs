import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCRIPT = 'scripts/validation/n11-candidate-128-lineage.mjs';
const WORKFLOW = '.github/workflows/n11-production-candidate-128-lineage.yml';

test('candidate 128 lineage workflow is manual, SHA-pinned and read-only', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_READONLY_N11_128_LINEAGE/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_WORKER_API_TOKEN/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|pages deploy)/);
});

test('candidate 128 lineage script never mutates or emits direct identity fields', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.match(script, /TARGET_FUNCIONARIO_ID = 128/);
  assert.match(script, /EMPRESA_ID = 6/);
  assert.match(script, /assertReadOnlySql/);
  assert.match(script, /NON_READONLY_SQL_REJECTED/);
  assert.match(script, /MUTATING_SQL_REJECTED/);
  assert.doesNotMatch(script, /nome\s*,/i);
  assert.doesNotMatch(script, /email\s*,/i);
  assert.doesNotMatch(script, /cpf\s*,/i);
  assert.doesNotMatch(script, /matricula\s*,/i);
  assert.match(script, /writes: 0/);
  assert.match(script, /pii_emitted: false/);
});

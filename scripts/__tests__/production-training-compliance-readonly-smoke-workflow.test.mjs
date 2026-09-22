import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(
  '.github/workflows/production-training-compliance-readonly-smoke.yml',
  'utf8',
);
const spec = fs.readFileSync('e2e/production-training-compliance/readonly.spec.ts', 'utf8');
const guard = fs.readFileSync('e2e/lib/production-read-only-network-guard.mjs', 'utf8');

test('production compliance smoke is explicit, exact-SHA and production-environment scoped', () => {
  assert.match(workflow, /AIRTRUST_PRODUCTION_TRAINING_COMPLIANCE_READONLY/);
  assert.match(workflow, /expected_production_sha/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /PRODUCTION_WORKER_SHA_MISMATCH/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /production-training-compliance\.config\.ts/);
});

test('production compliance browser coverage is read-only and exercises canonical surfaces', () => {
  assert.match(spec, /\/treinamentos\/compliance/);
  assert.match(spec, /\/api\/compliance-treinamentos\/capabilities/);
  assert.match(spec, /\/api\/compliance-treinamentos\/resumo/);
  assert.match(spec, /Central de pendências/);
  assert.match(spec, /\/api\/compliance-treinamentos\/pendencias/);
  assert.match(spec, /\/api\/compliance-treinamentos\/tendencias/);
  assert.match(spec, /\/api\/compliance-treinamentos\/comunicacoes/);
  assert.match(spec, /Administração/);
  assert.match(spec, /Régua automática de cobrança/);
  assert.match(spec, /guard\.assertClean\(\)/);
  assert.match(guard, /operational-post/);
  assert.match(guard, /mutation-method/);
  assert.doesNotMatch(spec, /request\.(post|put|patch|delete)\(/i);
});

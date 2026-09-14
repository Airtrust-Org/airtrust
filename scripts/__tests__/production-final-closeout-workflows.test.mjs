import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const RDV = '.github/workflows/production-rdv-readonly-smoke.yml';
const FOLGA = '.github/workflows/production-simulator-folga.yml';
const FOLGA_FUNCTIONAL = '.github/workflows/production-simulator-folga-functional-readonly-once.yml';

test('production RDV smoke is manual, main/SHA pinned, production scoped and read-only', () => {
  const workflow = readFileSync(RDV, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_READONLY_RDV/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /EXPECTED_TENANT_ID: '6'/);
  assert.match(workflow, /\/api\/controle-voos\/rdv\/fila\?limit=1/);
  assert.match(workflow, /writes: 0/);
  assert.doesNotMatch(workflow, /method:\s*'PUT'/);
  assert.doesNotMatch(workflow, /method:\s*'DELETE'/);
});

test('production FOLGA executor requires distinct apply confirmation and exact tenant', () => {
  const workflow = readFileSync(FOLGA, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_VERIFY_FOLGA/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_APPLY_FOLGA/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /EXPECTED_TENANT_ID: '6'/);
  assert.match(workflow, /\['administrador', 'gestor'\]/);
  assert.match(workflow, /rawRole === 'admin' \? 'administrador'/);
  assert.match(workflow, /rawRole === 'manager' \? 'gestor'/);
  assert.match(workflow, /JSON\.stringify\(\{ roster_policy: 'FOLGA' \}\)/);
  assert.match(workflow, /roster_policy_readback/);
});


test('production simulator functional proof is manually dispatchable, SHA-pinned and read-only', () => {
  const workflow = readFileSync(FOLGA_FUNCTIONAL, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_SIMULATOR_FOLGA_READONLY/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /production-simulator-folga-readonly\.mjs/);
  assert.match(workflow, /FULL_FIXED_SCALE_FOLGA/);
  assert.match(workflow, /FIXED_SCALE_PROPOSAL_NO_PAIR_AVAILABLE/);
  assert.match(workflow, /MONTHLY_ROSTER_DEPENDENCY_NOT_REMOVED/);
  assert.match(workflow, /writes: 0/);
  assert.doesNotMatch(workflow, /method:\s*'PUT'/);
  assert.doesNotMatch(workflow, /method:\s*'DELETE'/);
});

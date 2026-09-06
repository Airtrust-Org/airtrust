import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const RDV = '.github/workflows/production-rdv-readonly-smoke.yml';
const FOLGA = '.github/workflows/production-simulator-folga.yml';

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
  assert.match(workflow, /\['admin', 'manager'\]/);
  assert.match(workflow, /JSON\.stringify\(\{ roster_policy: 'FOLGA' \}\)/);
  assert.match(workflow, /roster_policy_readback/);
});

// source_reference: regression contract for A-02 / 0489 staging functional validation cleanup.
// operational_decision: keep the A-02 workflow on the schema-safe V2 synthetic cleanup path that matches the legacy auditoria table shape.
// dry_run_required: not applicable; this static test performs no remote execution or database writes.
// rollback_plan_required: not applicable; this test has no external side effects.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-a02-0489-functional-validation.yml', 'utf8');
const cleanupV2 = readFileSync('scripts/staging/cleanup-controle-voos-e2e-fixtures-v2.mjs', 'utf8');

test('A-02 0489 workflow uses the schema-safe V2 cleanup path', () => {
  assert.match(workflow, /cleanup-controle-voos-e2e-fixtures-v2\.mjs/);
  assert.doesNotMatch(workflow, /node scripts\/staging\/cleanup-controle-voos-e2e-fixtures\.mjs/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /validate-0489-postconditions\.sh/);
  assert.match(workflow, /a02-0489-staging-functional-evidence/);
});

test('V2 cleanup matches the real legacy auditoria schema and remains fail closed', () => {
  assert.match(cleanupV2, /DELETE FROM auditoria WHERE usuario_id IN/);
  assert.doesNotMatch(cleanupV2, /DELETE FROM auditoria WHERE[^;]*empresa_id/s);
  assert.match(cleanupV2, /DELETE FROM domain_events WHERE empresa_id IN/);
  assert.match(cleanupV2, /DELETE FROM refresh_tokens WHERE user_id IN/);
  assert.match(cleanupV2, /CLEANUP_POSTCONDITION_FAILED/);
  assert.doesNotMatch(cleanupV2, /AVISO: comando falhou \(continuando cleanup\)/);
});

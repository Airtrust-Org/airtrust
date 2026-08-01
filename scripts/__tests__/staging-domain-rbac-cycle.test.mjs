import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { planQaSectorClassifications } from '../staging/qa-sector-domain-plan.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/staging-domain-certificate-rbac-cycle.yml', import.meta.url),
  'utf8',
);

test('maps only the canonical synthetic QA sectors to expected domains', () => {
  assert.deepEqual(
    planQaSectorClassifications([
      { id: 1, nome: 'Setor QA Examinador' },
      { id: 2, nome: 'AIRTRUST-QA-FINAL-29770346428 Operações' },
      { id: 3, nome: 'AIRTRUST-QA-FINAL-29770346428 Manutenção' },
    ]),
    [
      { id: 1, name: 'Setor QA Examinador', domain: 'OPERACOES' },
      { id: 2, name: 'AIRTRUST-QA-FINAL-29770346428 Operações', domain: 'OPERACOES' },
      { id: 3, name: 'AIRTRUST-QA-FINAL-29770346428 Manutenção', domain: 'MANUTENCAO' },
    ],
  );
});

test('fails closed for an unknown unclassified sector', () => {
  assert.throws(
    () => planQaSectorClassifications([{ id: 10, nome: 'Setor não previsto' }]),
    /setor não reconhecido no bootstrap QA/,
  );
});

test('fails closed for duplicate sector identifiers', () => {
  assert.throws(
    () =>
      planQaSectorClassifications([
        { id: 1, nome: 'Setor QA Examinador' },
        { id: 1, nome: 'AIRTRUST-QA-FINAL-29770346428 Operações' },
      ]),
    /setor QA duplicado/,
  );
});

test('always verifies D1 restoration after the smoke step fails', () => {
  assert.match(
    workflow,
    /- name: Run temporary RBAC cycle and certificate smoke[\s\S]*?id: smoke[\s\S]*?continue-on-error: true/,
  );
  assert.match(
    workflow,
    /- name: Verify restored state and persisted certificate evidence read-only\n\s+if: always\(\)/,
  );
  assert.match(workflow, /SMOKE_STEP_OUTCOME: \$\{\{ steps\.smoke\.outcome \}\}/);
  assert.match(workflow, /SMOKE_REPORT_NOT_SUCCESSFUL/);
  assert.match(workflow, /CLASSIFICATION_ROLLBACK_FAILED/);
  assert.match(workflow, /worker-airtrust\/src\/routes\/admin-operational-domain-rbac\.ts/);
});

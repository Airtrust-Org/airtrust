import assert from 'node:assert/strict';
import test from 'node:test';

import { planQaSectorClassifications } from '../staging/qa-sector-domain-plan.mjs';

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

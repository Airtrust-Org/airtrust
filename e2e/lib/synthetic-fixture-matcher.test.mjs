import assert from 'node:assert/strict';
import test from 'node:test';

import { isSyntheticQaFixtureLabel } from './synthetic-fixture-matcher.mjs';

const PASS_CASES = [
  '[QA] Funcionário Teste',
  'QA_FIXTURE_FUNCIONARIO',
  'QA-FIXTURE Documento.pdf',
  'QA_SYNTHETIC Employee',
  'QA_SINTETICO Documento',
  'QA-SINTÉTICO Documento',
  '  [QA] leading whitespace tolerated',
];

const FAIL_CASES = [
  'João Fixture Silva',
  'Funcionário Synthetic',
  'Documento sintético',
  'Maria QA Silva',
  'teste fixture',
  'produção synthetic',
  '',
  '   ',
  null,
  undefined,
  'fixture',
  'synthetic',
  'sintético',
  'QAX_FIXTURE', // QA not immediately followed by the required separator
  'Nome contém QA_FIXTURE no meio', // prefix not at the START of the label
];

test('PASS: explicit QA-prefixed labels are recognized as synthetic fixtures', () => {
  for (const label of PASS_CASES) {
    assert.equal(isSyntheticQaFixtureLabel(label), true, `expected PASS for ${JSON.stringify(label)}`);
  }
});

test('FAIL: generic fixture/synthetic wording without an explicit QA prefix is rejected', () => {
  for (const label of FAIL_CASES) {
    assert.equal(
      isSyntheticQaFixtureLabel(label),
      false,
      `expected FAIL for ${JSON.stringify(label)}`,
    );
  }
});

test('a real name that merely contains the word "fixture" mid-string is never treated as synthetic', () => {
  assert.equal(isSyntheticQaFixtureLabel('João Fixture Silva'), false);
});

test('a bare generic word alone is never sufficient', () => {
  for (const word of ['fixture', 'synthetic', 'sintético', 'sintetico']) {
    assert.equal(isSyntheticQaFixtureLabel(word), false);
  }
});

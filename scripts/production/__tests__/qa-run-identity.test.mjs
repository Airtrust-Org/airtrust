import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQaRunScope, qaRunEmail, qaRunLearners } from '../qa-run-identity.mjs';
import { generateValidTestCpf } from '../provision-synthetic-qa-learner.mjs';

test('requires numeric GitHub run ID and attempt before allocating any synthetic identity', () => {
  for (const values of [['', '1'], ['123', '1'], ['12345678900','0'], ['12345678900',''], ['12345678900', 'abc']]) {
    assert.throws(() => assertQaRunScope(...values), /QA_RUN_SCOPE_REQUIRED/);
  }
});

test('one run has browser-specific employees, CPFs, email and enrollment scopes', () => {
  const first = qaRunLearners('43012345678', '1', generateValidTestCpf);
  const retry = qaRunLearners('43012345678', '2', generateValidTestCpf);
  const next = qaRunLearners('43012345679', '1', generateValidTestCpf);
  assert.equal(first.chromium.email, qaRunEmail('43012345678','1','chromium'));
  assert.notEqual(first.chromium.email, first.webkit.email);
  assert.notEqual(first.chromium.matricula, first.webkit.matricula);
  assert.notEqual(first.chromium.cpf, first.webkit.cpf);
  assert.notEqual(first.chromium.email, retry.chromium.email);
  assert.notEqual(first.chromium.email, next.chromium.email);
  assert.notEqual(first.chromium.cpf, retry.chromium.cpf);
  assert.equal(first.chromium.cpf.length, 11);
  assert.equal(first.webkit.perfil, 'ALUNO');
  assert.ok(Object.isFrozen(first.chromium));
});

test('rejects unexpected browser name; never falls back to shared production QA user', () => {
  assert.throws(() => qaRunEmail('43012345678','1','safari'), /QA_BROWSER_NOT_ALLOWLISTED/);
});

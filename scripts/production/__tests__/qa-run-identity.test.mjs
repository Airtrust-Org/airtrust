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

test('adversarial: an existing QA user linked to another employee cannot be reused', async () => {
  const { provisionLearner } = await import('../provision-synthetic-qa-learner.mjs');
  const originalFetch = globalThis.fetch;
  const learner = qaRunLearners('43012345678','1',generateValidTestCpf).chromium;
  let attempts = 0;
  try {
    globalThis.fetch = async (url) => {
      attempts += 1;
      let data;
      if (String(url).includes('/api/funcionarios?')) {
        data = [{ id: 301, matricula: learner.matricula, email: learner.email }];
      } else if (String(url).includes('/api/admin/usuarios')) {
        data = [{ id: 802, email: learner.email, perfil: 'ALUNO',
          funcionario_id: 999, empresa_id: 6 }];
      } else {
        throw new Error('UNEXPECTED_NETWORK_REQUEST');
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
    await assert.rejects(provisionLearner({
      mode: 'inspect', learnerDef: learner, adminToken: 'synthetic-admin-token',
    }), /QA_USER_EMPLOYEE_LINK_MISMATCH/);
    assert.equal(attempts, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('provisioning error diagnostics cannot print invitation tokens or request headers', async () => {
  const { safeProvisionErrorCode } = await import('../provision-synthetic-qa-learner.mjs');
  const sample = new Error('POST failed\nAuthorization: Bearer synthetic-secret-jwt\nCookie: QA_LOGIN=private');
  assert.equal(safeProvisionErrorCode(sample), 'QA_PROVISION_UNEXPECTED_ERROR');
  assert.equal(safeProvisionErrorCode(new Error('QA_USER_EMPLOYEE_LINK_MISMATCH')), 'QA_USER_EMPLOYEE_LINK_MISMATCH');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQaRunScope, qaRunEmail, qaRunLearners, qaRunCpfCandidate } from '../qa-run-identity.mjs';
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
        data = [{ id: 301, matricula: learner.matricula, email: learner.email, status: 'ATIVO' }];
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


test('CPF collision between two real run scopes chooses deterministic alternative without employee reuse', async () => {
  const { resolveAvailableQaCpf } = await import('../provision-synthetic-qa-learner.mjs');
  const existing = qaRunLearners('43012348474', '1', generateValidTestCpf).webkit;
  const incoming = qaRunLearners('43012349465', '1', generateValidTestCpf).chromium;
  assert.equal(existing.cpf, incoming.cpf);
  const second = qaRunCpfCandidate('43012349465', '1', 'chromium', generateValidTestCpf, 1);
  assert.notEqual(second, existing.cpf);
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), method: String(options.method || 'GET') });
      const cpf = new URL(String(url)).searchParams.get('search');
      const data = cpf === existing.cpf
        ? [{ id: 111, cpf: existing.cpf, matricula: existing.matricula, email: existing.email }]
        : [];
      return new Response(JSON.stringify({ success: true, data, pagination: { total: data.length } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
    const resolved = await resolveAvailableQaCpf('synthetic-admin', incoming, '43012349465', '1');
    assert.equal(resolved, second);
    assert.deepEqual(requests.map((q) => q.method), ['GET', 'GET']);
    assert.ok(requests.every((q) => q.url.includes('/api/funcionarios?') && q.url.includes('status=todos')));
  } finally { globalThis.fetch = originalFetch; }
});

test('CPF availability denied or truncated fails before any staff creation', async () => {
  const { resolveAvailableQaCpf } = await import('../provision-synthetic-qa-learner.mjs');
  const learner = qaRunLearners('43012349465', '1', generateValidTestCpf).chromium;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++;
      return new Response(JSON.stringify({ success: false }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    };
    await assert.rejects(resolveAvailableQaCpf('synthetic-admin', learner, '43012349465', '1'), /QA_CPF_AVAILABILITY_UNVERIFIED/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ success: true, data: [], pagination: { total: 101 } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
    await assert.rejects(resolveAvailableQaCpf('synthetic-admin', learner, '43012349465', '1'), /QA_CPF_AVAILABILITY_TRUNCATED/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});


test('inactive QA employee with same registration cannot be silently reused or duplicated', async () => {
  const { provisionLearner } = await import('../provision-synthetic-qa-learner.mjs');
  const learner = qaRunLearners('43012349465', '1', generateValidTestCpf).chromium;
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      assert.ok(String(url).includes('status=todos'));
      return new Response(JSON.stringify({ success: true, data: [{
        id: 75, matricula: learner.matricula, email: learner.email, status: 'INATIVO',
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await assert.rejects(provisionLearner({mode:'apply', learnerPassword:'synthetic-unit-password', learnerDef:learner, adminToken:'fake-admin'}),
      /QA_EMPLOYEE_INACTIVE_OR_UNVERIFIED/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
  } finally { globalThis.fetch = originalFetch; }
});

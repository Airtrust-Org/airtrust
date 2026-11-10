import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHomologationVerdict,
  runHomologation,
  setupAuthenticatedContext,
} from '../lms-learner-e2e-homologation.mjs';

test('lms-learner-e2e-homologation exports runHomologation and evaluateHomologationVerdict', () => {
  assert.equal(typeof runHomologation, 'function');
  assert.equal(typeof evaluateHomologationVerdict, 'function');
  assert.equal(typeof setupAuthenticatedContext, 'function');
});

test('evaluateHomologationVerdict yields PASS when all mandatory criteria pass', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 101, status: 'CONCLUIDA' },
    cert: { id: 55, validPdf: true, sha256: 'abc', sizeBytes: 1024 },
  });
  assert.equal(result.pass, true);
  assert.equal(result.reason, null);
});

test('evaluateHomologationVerdict rejects PASS when resume verification fails', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: false,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'RESUME_CHECKPOINT_FAILED');
});

test('evaluateHomologationVerdict rejects PASS when certificate PDF is invalid', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 101, status: 'CONCLUIDA' },
    cert: { id: 55, validPdf: false, sha256: 'xyz', sizeBytes: 50 },
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'INVALID_CERTIFICATE_PDF');
});

test('evaluateHomologationVerdict rejects PASS when expected qualification is missing', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'EXPECTED_QUALIFICATION_NOT_GENERATED');
});

test('evaluateHomologationVerdict rejects PASS when reopen has progress downgrade', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: false,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'STATUS_OR_PROGRESS_DOWNGRADE_ON_REOPEN');
});

test('evaluateHomologationVerdict rejects PASS when progress is below 100', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: false,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'PROGRESS_BELOW_100');
});

test('evaluateHomologationVerdict rejects PASS when completion status is not reached', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: false,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'COMPLETION_NOT_REACHED');
});

test('setupAuthenticatedContext adds access cookies and requests scoped asset session', async () => {
  const addedCookies = [];
  let requestedEndpoint = null;
  let requestedOptions = null;

  const mockContext = {
    async addCookies(cookies) {
      addedCookies.push(...cookies);
    },
    request: {
      async post(url, options) {
        requestedEndpoint = url;
        requestedOptions = options;
        return {
          ok: () => true,
          status: () => 200,
        };
      },
    },
  };

  await setupAuthenticatedContext(mockContext, 'mock-jwt-token-123', 42);

  assert.equal(addedCookies.length >= 1, true);
  assert.equal(addedCookies[0].name, 'airtrust_access_token');
  assert.equal(addedCookies[0].value, 'mock-jwt-token-123');
  assert.equal(requestedEndpoint?.endsWith('/api/lms/assets/session'), true);
  assert.equal(requestedOptions?.data?.curso_id, 42);
  assert.equal(requestedOptions?.data?.preview, false);
});

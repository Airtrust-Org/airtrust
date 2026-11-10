import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHomologationVerdict,
  runHomologation,
} from '../lms-learner-e2e-homologation.mjs';

test('lms-learner-e2e-homologation exports runHomologation and evaluateHomologationVerdict', () => {
  assert.equal(typeof runHomologation, 'function');
  assert.equal(typeof evaluateHomologationVerdict, 'function');
});

test('evaluateHomologationVerdict yields PASS when all mandatory criteria pass', () => {
  const result = evaluateHomologationVerdict({
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 101, status: 'CONCLUIDA' },
    cert: { id: 55, validPdf: true, sha256: 'abc' },
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
    qualExpected: false,
    qual: null,
    cert: { id: 55, validPdf: false, sha256: 'xyz' },
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

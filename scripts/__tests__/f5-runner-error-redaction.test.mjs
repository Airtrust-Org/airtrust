import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { safeF5RunnerErrorCode } from '../staging/run-f5-inactive-candidate.mjs';

test('F5 runner exposes only reviewed, fixed error identifiers', () => {
  assert.equal(
    safeF5RunnerErrorCode(new Error('F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH')),
    'F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH'
  );
  assert.equal(
    safeF5RunnerErrorCode(new Error('F5_F0_ADAPTER_SCORM_RESUME_STATE_MISMATCH')),
    'F5_F0_ADAPTER_SCORM_RESUME_STATE_MISMATCH'
  );
  for (const code of ['F5_F0_ADAPTER_AUTHORED_STATE_NOT_OBSERVED',
    'F5_F0_ADAPTER_SCORM_INCOMPLETE_READBACK_MISMATCH']) {
    assert.equal(safeF5RunnerErrorCode(new Error(code)), code);
  }
  assert.equal(safeF5RunnerErrorCode(new Error('F5_WORKER_ADAPTER_WORKER_HTTP_500')),
    'F5_WORKER_ADAPTER_WORKER_HTTP_500');
  assert.equal(safeF5RunnerErrorCode(new Error('F5_WORKER_ADAPTER_WORKER_HTTP_500:secret')),
    'F5_RUNNER_OPERATION_FAILED');
  for (const value of [
    new Error('Bearer private-access-token'),
    new Error('F5_RUNNER_PRIVATE_ACCESS_TOKEN_123456'),
    new Error('F5_EXECUTOR_UNREVIEWED_ERROR'),
    { message: 'F5_RUNNER_OPERATION_FAILED; token=private' },
    null,
  ]) {
    assert.equal(safeF5RunnerErrorCode(value), 'F5_RUNNER_OPERATION_FAILED');
  }
});

test('F5 executor recovery failures remain actionable without leaking compensation details', () => {
  const error = new Error('F5_EXECUTOR_RECOVERY_REQUIRED');
  error.cause = new Error('Bearer PRIVATE_TOKEN learnerId=8101');
  assert.equal(safeF5RunnerErrorCode(error), 'F5_EXECUTOR_RECOVERY_REQUIRED');
  assert.equal(
    safeF5RunnerErrorCode(new Error('F5_EXECUTOR_RECOVERY_REQUIRED: Bearer PRIVATE_TOKEN')),
    'F5_RUNNER_OPERATION_FAILED'
  );
});

test('F5 runner never traverses exception causes or untrusted getters', () => {
  const error = {
    message: 'F5_RUNNER_F0_ADAPTER_LOAD_FAILED',
    get cause() { throw new Error('PRIVATE_LEARNER_AND_TOKEN'); },
  };
  assert.equal(safeF5RunnerErrorCode(error), 'F5_RUNNER_F0_ADAPTER_LOAD_FAILED');
  assert.equal(safeF5RunnerErrorCode({
    get message() { throw new Error('PRIVATE_RUNNER_PATH'); },
  }), 'F5_RUNNER_OPERATION_FAILED');
});

test('F5 runner CLI does not print raw import errors or nested exception objects', async () => {
  const source = await readFile(new URL('../staging/run-f5-inactive-candidate.mjs', import.meta.url), 'utf8');
  for (const unsafe of [
    '[F0_ADAPTER_LOAD_ERROR]', '[F5_RUNNER_ERROR_DETAILS]',
    '[F5_RUNNER_CAUSE]', '[F5_SUB_ERROR]',
  ]) assert.ok(!source.includes(unsafe), unsafe);
  assert.match(source, /process\.stderr\.write\(`\$\{safeF5RunnerErrorCode\(error\)\}/);
});

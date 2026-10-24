import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discardF5EvidenceOutput, reserveF5EvidenceOutput, safeF5RunnerErrorCode } from '../staging/run-f5-inactive-candidate.mjs';

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
    'F5_F0_ADAPTER_SCORM_INCOMPLETE_READBACK_MISMATCH',
    'F5_F0_ADAPTER_COMMIT_RECEIPT_INVALID',
    'F5_F0_ADAPTER_COMMIT_READBACK_SESSION_MISMATCH',
    'F5_F0_ADAPTER_BROWSER_PAIR_READBACK_REGRESSION',
    'F5_F0_ADAPTER_VISUAL_RESUME_WITNESS_INVALID',
    'F5_F0_ADAPTER_VISUAL_NAVIGATION_UNAVAILABLE']) {
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

test('F5 evidence is reserved exclusively with private permissions before any Worker write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'f5-evidence-preflight-'));
  const output = join(dir, 'candidate-evidence.json');
  try {
    await assert.rejects(reserveF5EvidenceOutput(''), /F5_RUNNER_EVIDENCE_OUTPUT_PATH_REQUIRED/);
    await assert.rejects(reserveF5EvidenceOutput(join(dir, 'missing', 'evidence.json')),
      /F5_RUNNER_EVIDENCE_OUTPUT_UNAVAILABLE/);
    const handle = await reserveF5EvidenceOutput(output);
    try {
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      await assert.rejects(reserveF5EvidenceOutput(output),
        /F5_RUNNER_EVIDENCE_OUTPUT_UNAVAILABLE/);
      await handle.writeFile('{"private":true}\n');
    } finally {
      await handle.close();
    }
    assert.equal(await readFile(output, 'utf8'), '{"private":true}\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('F5 runner reserves evidence before loading adapters or invoking remote intake', async () => {
  const source = await readFile(new URL('../staging/run-f5-inactive-candidate.mjs', import.meta.url), 'utf8');
  const reserveAt = source.indexOf('await reserveF5EvidenceOutput(outputPath)');
  const importAt = source.indexOf('await import(pathToFileURL');
  const remoteAt = source.indexOf('await executeF5InactiveCandidate({');
  assert.ok(reserveAt > 0 && importAt > reserveAt && remoteAt > importAt);
  assert.match(source, /await evidenceHandle\.sync\(\)/);
  const sourceCloseAt = source.indexOf('await source.close();');
  const evidenceWriteAt = source.indexOf('await evidenceHandle.writeFile(');
  const evidenceCloseAt = source.indexOf('await evidenceHandle.close();');
  const successAt = source.indexOf('evidenceComplete = true;');
  assert.ok(sourceCloseAt > remoteAt && evidenceWriteAt > sourceCloseAt,
    'source teardown must precede successful QA evidence');
  assert.ok(evidenceCloseAt > evidenceWriteAt && successAt > evidenceCloseAt,
    'evidence close must succeed before QA success');
  assert.match(source, /if \(!evidenceComplete\)/);
  assert.match(source, /await discardF5EvidenceOutput\(evidenceHandle, outputPath\)/);
  assert.equal(safeF5RunnerErrorCode(new Error('F5_RUNNER_EVIDENCE_OUTPUT_UNAVAILABLE')),
    'F5_RUNNER_EVIDENCE_OUTPUT_UNAVAILABLE');
});

test('F5 partial evidence is removed even when closing the reserved handle fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'f5-evidence-teardown-'));
  const output = join(dir, 'partial-evidence.json');
  try {
    const handle = await reserveF5EvidenceOutput(output);
    await handle.writeFile('{"status":"PASS"}\n');
    await discardF5EvidenceOutput({
      async close() {
        await handle.close();
        throw new Error('private teardown detail must not be logged');
      },
    }, output);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

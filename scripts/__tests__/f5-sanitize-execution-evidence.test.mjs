import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { sanitizeF5Evidence } from '../staging/f5-sanitize-execution-evidence.mjs';

const packageSha256 = 'd'.repeat(64), releaseSha = 'a'.repeat(40);
const env = Object.freeze({
  GITHUB_REPOSITORY: 'Airtrust-Org/airtrust',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ID: '12345678', GITHUB_SHA: 'b'.repeat(40),
  F5_RELEASE_SHA: releaseSha, F5_PACKAGE_SHA256: packageSha256,
  F5_ZIP_BYTES: '40644', F5_OPERATION_ID: '123e4567-e89b-12d3-a456-426614174000',
});
const evidence = Object.freeze({
  source: 'F5_INACTIVE_CANDIDATE_EXECUTOR_V1',
  status: 'INACTIVE_CANDIDATE_VERIFIED', runtimeSha: releaseSha,
  operationId: env.F5_OPERATION_ID, candidate: {
    tenantId: 9201, courseId: 7301, packageId: '223e4567-e89b-12d3-a456-426614174000',
    packageSha256, status: 'VALIDATED', active: false,
  },
  r2Readback: { source: 'WORKER_R2_STREAMED_ZIP_READBACK',
    zipSha256: packageSha256, zipBytes: 40644, launchAssetSha256: 'e'.repeat(64) },
  r2CandidateAssetSha256: 'e'.repeat(64),
  d1ReadbackSource: 'WORKER_D1_CANDIDATE_READBACK',
  execution: { servedPackageSha256: packageSha256, committedPackageSha256: packageSha256,
    cmiSha256: 'c'.repeat(64), suspendSha256: 'f'.repeat(64), sessionCount: 1,
    browserEngines: ['chromium', 'webkit'] },
  cleanupReceiptSha256: '9'.repeat(64), activationAuthorized: false,
  assessmentApproved: false, certificationIssued: false, certificateIssued: false,
  syntheticEnrollmentId: 8101, privateCredential: 'secret-must-never-appear',
});
const rawHash = createHash('sha256').update('private-evidence').digest('hex');
test('emits a narrowly scoped audit artifact with no credential or synthetic participant IDs', () => {
  const actual = sanitizeF5Evidence(evidence, env, rawHash);
  assert.equal(actual.packageSha256, packageSha256);
  assert.equal(actual.privateEvidenceSha256, rawHash);
  assert.equal(actual.candidateActive, false);
  assert.equal(actual.certificateIssued, false);
  assert.deepEqual(actual.browserEngines, ['chromium', 'webkit']);
  const text = JSON.stringify(actual);
  for (const forbidden of ['secret-must-never-appear', 'privateCredential',
    'syntheticEnrollmentId', '8101', '9201', '7301', 'cmiSha256', 'suspendSha256']) {
    assert.ok(!text.includes(forbidden), forbidden);
  }
});
test('rejects failed, incomplete, activated or certifying outcomes without publishing', () => {
  for (const changed of [
    { status: 'FAIL' }, { activationAuthorized: true }, { certificateIssued: true },
    { candidate: { ...evidence.candidate, active: true } },
    { r2Readback: { ...evidence.r2Readback, zipBytes: 1 } },
    { execution: { ...evidence.execution, committedPackageSha256: 'f'.repeat(64) } },
    { cleanupReceiptSha256: null },
    { execution: { ...evidence.execution, browserEngines: ['chromium'] } },
    { execution: { ...evidence.execution, browserEngines: ['chromium', 'webkit', 'firefox'] } },
  ]) {
    assert.throws(() => sanitizeF5Evidence({ ...evidence, ...changed }, env, rawHash),
      /F5_SANITIZED_EVIDENCE_INVALID/);
  }
});
test('rejects a different release, package, operation or untrusted GitHub run context', () => {
  for (const changed of [
    { F5_RELEASE_SHA: 'c'.repeat(40) }, { F5_PACKAGE_SHA256: 'f'.repeat(64) },
    { F5_OPERATION_ID: '923e4567-e89b-12d3-a456-426614174000' },
    { GITHUB_REF: 'refs/heads/other' }, { GITHUB_RUN_ID: '' },
  ]) {
    assert.throws(() => sanitizeF5Evidence(evidence, { ...env, ...changed }, rawHash),
      /F5_SANITIZED_EVIDENCE_INVALID/);
  }
});

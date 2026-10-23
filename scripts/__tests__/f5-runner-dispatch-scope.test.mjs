import assert from 'node:assert/strict';
import test from 'node:test';
import { assertF5RunnerDispatchScope } from '../staging/f5-runner-dispatch-scope.mjs';

const candidate = Object.freeze({
  environment: 'staging', tenantId: 9201, courseId: 7301,
  packageSha256: 'd'.repeat(64), zipBytes: 40644,
  operationId: '123e4567-e89b-12d3-a456-426614174000',
});
const plan = Object.freeze({
  schemaVersion: 1, scope: 'ONE_INACTIVE_CANDIDATE', mutex: 'airtrust-staging-mutations-and-scorm-qa',
  releaseSha: 'a'.repeat(40), harnessSha: 'b'.repeat(40), candidate,
  syntheticFixture: {
    enrollmentId: 8101, cycleId: 8201,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    approvalReceiptSha256: 'c'.repeat(64),
    provisioningReceiptSha256: 'd'.repeat(64),
    recoveryReceiptSha256: 'e'.repeat(64),
    cleanupContractSha256: 'f'.repeat(64),
  },
});
const env = Object.freeze({
  GITHUB_REPOSITORY: 'Airtrust-Org/airtrust',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  F5_CONFIRMATION: 'AIRTRUST_F5_STAGING_CANDIDATE',
  F5_RELEASE_SHA: plan.releaseSha,
  GITHUB_SHA: plan.harnessSha,
  F5_TENANT_ID: String(candidate.tenantId),
  F5_COURSE_ID: String(candidate.courseId),
  F5_PACKAGE_SHA256: candidate.packageSha256,
  F5_ZIP_BYTES: String(candidate.zipBytes),
  F5_OPERATION_ID: candidate.operationId,
});
test('accepts only an exact F5 staging plan bound to trusted dispatch inputs', () => {
  assert.equal(assertF5RunnerDispatchScope(plan, env), true);
});
test('rejects an incomplete or untrusted workflow context before loading private adapters', () => {
  for (const [key, value] of [
    ['GITHUB_REPOSITORY', 'another/repo'],
    ['GITHUB_REF', 'refs/heads/feature'],
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['F5_CONFIRMATION', ''],
  ]) {
    assert.throws(() => assertF5RunnerDispatchScope(plan, { ...env, [key]: value }),
      /F5_RUNNER_TRUSTED_DISPATCH_CONTEXT_REQUIRED/);
  }
  assert.throws(() => assertF5RunnerDispatchScope(plan, { ...env, GITHUB_REF: undefined }),
    /F5_RUNNER_TRUSTED_DISPATCH_CONTEXT_REQUIRED/);
});
test('fails closed on every dispatch/plan identity mismatch, including release and harness SHA', () => {
  for (const key of [
    'F5_RELEASE_SHA', 'GITHUB_SHA', 'F5_TENANT_ID', 'F5_COURSE_ID',
    'F5_PACKAGE_SHA256', 'F5_ZIP_BYTES', 'F5_OPERATION_ID',
  ]) {
    assert.throws(() => assertF5RunnerDispatchScope(plan, { ...env, [key]: 'invalid' }),
      /F5_RUNNER_PLAN_DISPATCH_SCOPE_MISMATCH/, key);
    const { [key]: _omitted, ...missing } = env;
    assert.throws(() => assertF5RunnerDispatchScope(plan, missing),
      /F5_RUNNER_PLAN_DISPATCH_SCOPE_MISMATCH/, key);
  }
});
test('rejects an invalid synthetic receipt plan independently of dispatch equality', () => {
  assert.throws(() => assertF5RunnerDispatchScope({
    ...plan, syntheticFixture: { ...plan.syntheticFixture, cleanupContractSha256: 'unverified' },
  }, env), /F5_EXECUTOR_PLAN_OR_F0_RECEIPT_INVALID/);
});

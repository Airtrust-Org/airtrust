import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createF0Adapters, runF5BrowserPair } from '../staging/f5-f0-adapters.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};

function planFor() {
  const plan = {
    releaseSha: 'a'.repeat(40),
    candidate: { tenantId: 9201, courseId: 15, packageSha256: 'b'.repeat(64) },
    syntheticFixture: {
      enrollmentId: 8101, cycleId: 8201,
      runId: '123e4567-e89b-12d3-a456-426614174001',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  };
  const scope = {
    tenantId: plan.candidate.tenantId, courseId: plan.candidate.courseId,
    enrollmentId: plan.syntheticFixture.enrollmentId, cycleId: plan.syntheticFixture.cycleId,
    runId: plan.syntheticFixture.runId, releaseSha: plan.releaseSha,
    expiresAt: plan.syntheticFixture.expiresAt,
    packageSha256: plan.candidate.packageSha256,
  };
  const docs = {
    approval: { ...scope, activation: false, assessmentApproval: false, certification: false },
    provisioning: { ...scope, synthetic: true },
    recovery: { ...scope, action: 'RESTORE_SYNTHETIC_PREIMAGE' },
    cleanupContract: { ...scope, deleteRealLearnerData: false },
  };
  plan.syntheticFixture.receiptDocuments = docs;
  for (const [name, doc] of Object.entries(docs)) {
    const field = name === 'cleanupContract' ? 'cleanupContractSha256' : `${name}ReceiptSha256`;
    plan.syntheticFixture[field] = digest(canonical(doc));
  }
  return plan;
}

test('verifies the four scoped F0 receipt documents by canonical digest', async () => {
  const plan = planFor();
  const adapters = await createF0Adapters({ plan, env: {} });
  assert.equal(await adapters.verifyF0Receipts(plan), true);
  plan.syntheticFixture.receiptDocuments.recovery.runId = '123e4567-e89b-12d3-a456-426614174099';
  await assert.rejects(adapters.verifyF0Receipts(plan), /RECOVERY_RECEIPT_MISMATCH/);
});

test('rejects plan substitution and policy-changing F0 receipts', async () => {
  const plan = planFor();
  const adapters = await createF0Adapters({ plan, env: {} });
  await assert.rejects(adapters.verifyF0Receipts({ ...plan }), /PLAN_IDENTITY_CHANGED/);
  plan.syntheticFixture.receiptDocuments.approval.activation = true;
  plan.syntheticFixture.approvalReceiptSha256 = digest(canonical(plan.syntheticFixture.receiptDocuments.approval));
  await assert.rejects(adapters.verifyF0Receipts(plan), /RECEIPT_POLICY_INVALID/);
});

test('F5 physical candidate QA requires Chromium and WebKit with the same scope and D1 state', async () => {
  const engines = [];
  const expected = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001', suspendSha256: 'b'.repeat(64),
    runtimeVersion: '1.2', resumeVerified: true, locationPersisted: true,
    suspendDataPersisted: true,
  };
  const result = await runF5BrowserPair(async ({ engine, browserType }) => {
    assert.equal(typeof browserType.launch, 'function');
    engines.push(engine);
    return { ...expected, sessionCount: engines.length };
  });
  assert.deepEqual(engines, ['chromium', 'webkit']);
  assert.deepEqual(result.browserEngines, ['chromium', 'webkit']);
  assert.equal(result.sessionCount, 2);
});

test('F5 candidate QA fails closed if WebKit fails or diverges from Chromium readback', async () => {
  const baseline = {
    source: 'WORKER_CANDIDATE_QA_EXECUTION', candidateId: 'candidate-1',
    packageSha256: 'a'.repeat(64), servedPackageSha256: 'a'.repeat(64),
    committedPackageSha256: 'a'.repeat(64), enrollmentId: 17, cycleId: 19,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    suspendSha256: 'b'.repeat(64), runtimeVersion: '1.2',
    resumeVerified: true, locationPersisted: true, suspendDataPersisted: true,
    sessionCount: 1,
  };
  await assert.rejects(runF5BrowserPair(async ({ engine }) => {
    if (engine === 'webkit') throw Error('WEBKIT_LAUNCH_FAILED');
    return baseline;
  }), /WEBKIT_LAUNCH_FAILED/);
  await assert.rejects(runF5BrowserPair(async ({ engine }) => ({
    ...baseline, packageSha256: engine === 'webkit' ? 'c'.repeat(64) : 'a'.repeat(64),
    sessionCount: engine === 'webkit' ? 2 : 1,
  })), /BROWSER_PAIR_SCOPE_MISMATCH/);
  await assert.rejects(runF5BrowserPair(async ({ engine }) => ({
    ...baseline, sessionCount: engine === 'webkit' ? 0 : 1,
  })), /BROWSER_PAIR_READBACK_REGRESSION/);
});

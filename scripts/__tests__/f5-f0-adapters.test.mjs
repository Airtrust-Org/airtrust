import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createF0Adapters } from '../staging/f5-f0-adapters.mjs';

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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyF5ProvisionedExecution } from '../staging/f5-provisioned-execution-preflight.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'airtrust-f5-preflight-'));
  const module = join(dir, 'f0.mjs');
  const planPath = join(dir, 'plan.json');
  const moduleBytes = Buffer.from('export const createF0Adapters = async () => ({});\n');
  const sha = createHash('sha256').update(moduleBytes).digest('hex');
  const releaseSha = 'a'.repeat(40);
  const packageSha = 'b'.repeat(64);
  const operationId = 'abcdefab-1234-1234-1234-abcdefabcdef';
  const plan = {
    schemaVersion: 1, scope: 'ONE_INACTIVE_CANDIDATE',
    releaseSha, harnessSha: releaseSha,
    mutex: 'airtrust-staging-mutations-and-scorm-qa',
    candidate: { environment: 'staging', tenantId: 12, courseId: 15,
      packageSha256: packageSha, zipBytes: 40644, operationId },
    syntheticFixture: { enrollmentId: 100, cycleId: 200,
      runId: '12345678-1234-1234-1234-123456789abc',
      approvalReceiptSha256: 'c'.repeat(64),
      provisioningReceiptSha256: 'd'.repeat(64),
      recoveryReceiptSha256: 'e'.repeat(64),
      cleanupContractSha256: 'f'.repeat(64),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
  };
  await writeFile(module, moduleBytes, { mode: 0o600 });
  await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
  const env = { RUNNER_TEMP: dir, GITHUB_REPOSITORY: 'Airtrust-Org/airtrust',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: releaseSha, F5_CONFIRMATION: 'AIRTRUST_F5_STAGING_CANDIDATE',
    F5_RELEASE_SHA: releaseSha, F5_TENANT_ID: '12', F5_COURSE_ID: '15',
    F5_PACKAGE_SHA256: packageSha, F5_ZIP_BYTES: '40644',
    F5_OPERATION_ID: operationId, F5_EXECUTOR_PLAN_PATH: planPath,
    F5_F0_ADAPTER_MODULE: module, F5_F0_ADAPTER_SHA256: sha,
    SCORM_QA_ACCESS_TOKEN: 't'.repeat(48),
    SCORM_QA_READBACK_SECRET: 's'.repeat(40) };
  return { env, planPath, module, plan };
}

test('validates pinned F0 plan and adapter read-only before private source', async () => {
  const { env } = await fixture();
  const result = await verifyF5ProvisionedExecution(env);
  assert.equal(result.status, 'READY');
  assert.equal(result.remoteWritesExecuted, false);
  assert.equal(result.sourceSha256, 'b'.repeat(64));
  assert.equal(result.adapterSha256, env.F5_F0_ADAPTER_SHA256);
});

test('fails closed without adapter secrets, on bad SHA or changed dispatch tenant', async () => {
  const { env } = await fixture();
  for (const [patch, error] of [
    [{ SCORM_QA_ACCESS_TOKEN: '' }, /CREDENTIALS_MISSING/],
    [{ SCORM_QA_READBACK_SECRET: '' }, /CREDENTIALS_MISSING/],
    [{ F5_F0_ADAPTER_SHA256: '0'.repeat(64) }, /SHA_MISMATCH/],
    [{ F5_TENANT_ID: '13' }, /PLAN_DISPATCH_SCOPE_MISMATCH/],
    [{ GITHUB_REF: 'refs/heads/main-malicious' }, /TRUSTED_STAGING_DISPATCH_REQUIRED/],
    [{ F5_EXECUTOR_PLAN_PATH: '/etc/passwd' }, /PRIVATE_RUNNER_SCOPE_REQUIRED/],
  ]) await assert.rejects(verifyF5ProvisionedExecution({ ...env, ...patch }), error);
});

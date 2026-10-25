import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { F5_EXECUTOR_LIMITS, executeF5InactiveCandidate } from '../staging/f5-inactive-candidate-executor.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const receipt = char => char.repeat(64);
const planFor = bytes => ({
  schemaVersion: 1,
  scope: 'ONE_INACTIVE_CANDIDATE',
  releaseSha: 'a'.repeat(40),
  harnessSha: 'b'.repeat(40),
  mutex: F5_EXECUTOR_LIMITS.mutex,
  candidate: {
    environment: 'staging', tenantId: 9201, courseId: 7301,
    packageSha256: sha(bytes), zipBytes: bytes.length,
    operationId: '123e4567-e89b-12d3-a456-426614174000',
  },
  syntheticFixture: {
    enrollmentId: 8101, cycleId: 8201,
    runId: '123e4567-e89b-12d3-a456-426614174001',
    approvalReceiptSha256: receipt('c'),
    provisioningReceiptSha256: receipt('d'),
    recoveryReceiptSha256: receipt('e'),
    cleanupContractSha256: receipt('f'),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
});

function sourceFor(bytes, maxRead = F5_EXECUTOR_LIMITS.partBytes) {
  const lengths = [];
  return {
    size: bytes.length,
    lengths,
    async read(offset, length) {
      assert.ok(length <= maxRead);
      lengths.push(length);
      return bytes.subarray(offset, offset + length);
    },
  };
}

function qaRow(plan, phase, packageId = plan.candidate.operationId) {
  const c = plan.candidate, f = plan.syntheticFixture;
  const active = phase === 'AFTER';
  return {
    source: 'WORKER_D1_STAGING_READBACK',
    tenantId: c.tenantId, courseId: c.courseId,
    packageId, packageSha256: c.packageSha256,
    runtimeSha: plan.releaseSha, synthetic: true,
    enrollmentId: f.enrollmentId, cycleId: f.cycleId, runId: f.runId,
    approvalReceiptSha256: f.approvalReceiptSha256,
    servedPackageSha256: active ? c.packageSha256 : null,
    committedPackageSha256: active ? c.packageSha256 : null,
    cmiSha256: active ? receipt('1') : null,
    suspendSha256: active ? receipt('2') : null,
    sessionCount: active ? 1 : 0,
    qualificationHistoryCount: 0,
    completionStatus: active ? 'EM_ANDAMENTO' : 'NAO_INICIADO',
    scormScoreRaw: null,
    certificateDocument: null,
    assessmentEvidence: {
      source: 'WORKER_D1_F0_ASSESSMENT_READBACK_V1',
      tenantId: c.tenantId, courseId: c.courseId,
      enrollmentId: f.enrollmentId, cycleId: f.cycleId, runId: f.runId,
      packageId, packageSha256: c.packageSha256, runtimeSha: plan.releaseSha,
      observedAt: new Date().toISOString(),
      assessmentAttemptCount: 0, assessmentApprovedCount: 0,
      externalAssessmentApprovedCount: 0, certificateIssuedCount: 0,
    },
  };
}

function adaptersFor(plan, overrides = {}) {
  const calls = [];
  const candidate = {
    // Worker package ID is generated independently from the intake operation ID.
    packageId: '223e4567-e89b-12d3-a456-426614174000',
    packageSha256: plan.candidate.packageSha256,
    scormVersion: '1.2',
    status: 'VALIDATED', createdByOperation: true, alreadyExisted: false,
    active: false, completionWritten: false, certificateIssued: false,
    zipBytes: plan.candidate.zipBytes,
    structural: { status: 'PASS' }, completionManifest: { status: 'PASS' },
    diagnostics: { status: 'PASS' },
    r2Prefix: `lms/scorm/${plan.candidate.tenantId}/${plan.candidate.courseId}/_candidates/223e4567-e89b-12d3-a456-426614174000/`,
    launchFile: 'index.html',
    r2Readback: {
      source: 'WORKER_R2_STREAMED_ZIP_READBACK',
      zipSha256: plan.candidate.packageSha256,
      zipBytes: plan.candidate.zipBytes,
      rangeRequests: 4, etagStable: true, memberIntegrityVerified: true,
      launchAssetSha256: receipt('9'),
    },
  };
  const adapters = {
    async verifyAuthorization() { calls.push('authorize'); return true; },
    async readRuntimeProvenance() {
      calls.push('runtime'); return { workerSha: plan.releaseSha, pagesSha: plan.releaseSha.slice(0, 7), harnessSha: plan.harnessSha };
    },
    async verifyF0Receipts() { calls.push('receipts'); return true; },
    async beginIntake() { calls.push('begin'); },
    async putIntakePart(params) { calls.push(`part:${params.partNumber}`); },
    async completeIntake() { calls.push('complete'); return candidate; },
    async abortIntake() { calls.push('abort'); return { operationId: plan.candidate.operationId, aborted: true }; },
    async resolveAmbiguousIntake() {
      calls.push('resolve-intake'); return { verified: true, state: 'INTAKE_PRESENT' };
    },
    async readCandidateD1() {
      calls.push('d1-candidate'); return {
        source: 'WORKER_D1_CANDIDATE_READBACK',
        tenantId: plan.candidate.tenantId, courseId: plan.candidate.courseId,
        packageId: candidate.packageId, packageSha256: candidate.packageSha256,
        status: 'VALIDATED', active: false,
        scormVersion: candidate.scormVersion,
        r2Prefix: candidate.r2Prefix, launchFile: candidate.launchFile,
      };
    },
    async readCandidateR2() {
      calls.push('r2-candidate'); return {
        source: 'WORKER_R2_CANDIDATE_ASSET_READBACK',
        packageId: candidate.packageId, packageSha256: candidate.packageSha256,
        assetSha256: candidate.r2Readback.launchAssetSha256, active: false,
      };
    },
    async readQaEvidence({ phase }) { calls.push(`readback:${phase}`); return qaRow(plan, phase, candidate.packageId); },
    async runSyntheticCandidate() {
      calls.push('execute'); return {
        source: 'WORKER_CANDIDATE_QA_EXECUTION',
        candidateId: candidate.packageId, packageSha256: plan.candidate.packageSha256,
        runtimeVersion: candidate.scormVersion, locationPersisted: true,
        suspendDataPersisted: true, resumeVerified: true,
        browserEngines: ['chromium', 'webkit'],
        enrollmentId: plan.syntheticFixture.enrollmentId, cycleId: plan.syntheticFixture.cycleId,
        runId: plan.syntheticFixture.runId,
        servedPackageSha256: plan.candidate.packageSha256,
        committedPackageSha256: plan.candidate.packageSha256,
        cmiSha256: receipt('1'), suspendSha256: receipt('2'), sessionCount: 1,
        completionStatus: 'EM_ANDAMENTO', qualificationHistoryCount: 0,
        certificateDocument: null,
      };
    },
    async recoverSyntheticCandidate() { calls.push('recover'); return {
      verified: true, syntheticFixtureRecovered: true, receiptSha256: receipt('a') };
    },
    async cleanupSyntheticCandidate() {
      calls.push('cleanup'); return { verified: true, syntheticFixtureCleaned: true,
        candidatePreservedInactive: true, receiptSha256: receipt('b') };
    },
    async removeFailedCandidate() { calls.push('remove-candidate'); return {
      verified: true, candidateRemoved: true, receiptSha256: receipt('c') };
    },
  };
  return { calls, candidate, adapters: { ...adapters, ...overrides } };
}

test('completes one isolated candidate intake, R2/D1 readbacks, synthetic execution and cleanup', async () => {
  const bytes = Buffer.from('synthetic ZIP bytes for mocked F5 orchestration');
  const plan = planFor(bytes);
  const source = sourceFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  const result = await executeF5InactiveCandidate({ plan, source, adapters });

  assert.equal(result.status, 'INACTIVE_CANDIDATE_VERIFIED');
  assert.equal(result.candidate.active, false);
  assert.equal(result.candidate.packageSha256, sha(bytes));
  assert.equal(result.activationAuthorized, false);
  assert.equal(result.assessmentApproved, false);
  assert.equal(result.certificationIssued, false);
  assert.equal(result.certificateIssued, false);
  assert.ok(calls.indexOf('authorize') < calls.indexOf('begin'));
  assert.ok(calls.indexOf('runtime') < calls.indexOf('begin'));
  assert.ok(calls.indexOf('receipts') < calls.indexOf('begin'));
  assert.ok(calls.includes('r2-candidate'));
  assert.ok(calls.includes('d1-candidate'));
  assert.ok(calls.includes('readback:BEFORE'));
  assert.ok(calls.includes('execute'));
  assert.ok(calls.includes('readback:AFTER'));
  assert.ok(calls.includes('cleanup'));
  assert.deepEqual(calls.slice(-2), ['cleanup', 'd1-candidate']);
  assert.ok(source.lengths.every(length => length <= F5_EXECUTOR_LIMITS.partBytes));
});

test('blocks synthetic binding if Worker or Pages SHA changes after private intake', async () => {
  const bytes = Buffer.from('synthetic ZIP bytes for runtime drift probe');
  const plan = planFor(bytes);
  for (const changed of ['worker', 'pages']) {
    const { calls, adapters } = adaptersFor(plan);
    const original = adapters.readRuntimeProvenance;
    let checks = 0;
    adapters.readRuntimeProvenance = async () => {
      const provenance = await original();
      if (++checks === 2) {
        if (changed === 'worker') provenance.workerSha = 'f'.repeat(40);
        else provenance.pagesSha = 'f'.repeat(7);
      }
      return provenance;
    };
    await assert.rejects(
      executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
      /F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH/,
    );
    assert.equal(checks, 2, 'must recheck live runtime after private intake');
    assert.ok(calls.includes('r2-candidate'));
    assert.ok(!calls.includes('readback:BEFORE'), 'no synthetic fixture binding after drift');
    assert.ok(!calls.includes('execute'), 'no browser QA after drift');
    assert.ok(calls.includes('remove-candidate'), 'owned inactive candidate must be compensated');
  }
});

test('staging runtime drift during BEFORE readback blocks browser QA and recovers synthetic fixture', async () => {
  const bytes = Buffer.from('synthetic ZIP with runtime drift during BEFORE readback');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  let drifted = false;
  const originalReadback = adapters.readQaEvidence;
  adapters.readQaEvidence = async params => {
    const evidence = await originalReadback(params);
    if (params.phase === 'BEFORE') drifted = true;
    return evidence;
  };
  const originalRuntime = adapters.readRuntimeProvenance;
  adapters.readRuntimeProvenance = async () => {
    const runtime = await originalRuntime();
    if (drifted) runtime.pagesSha = 'f'.repeat(7);
    return runtime;
  };
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH/,
  );
  assert.equal(calls.filter(call => call === 'runtime').length, 3);
  assert.ok(calls.includes('readback:BEFORE'));
  assert.ok(!calls.includes('execute'), 'browser must not run on a changed staging release');
  assert.ok(calls.includes('recover'), 'synthetic fixture must be recovered');
  assert.ok(calls.includes('remove-candidate'), 'owned inactive candidate must be compensated');
});

test('staging runtime drift during browser QA invalidates evidence and recovers fixture', async () => {
  const bytes = Buffer.from('synthetic ZIP with runtime drift during browser QA');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  let drifted = false;
  const originalExecute = adapters.runSyntheticCandidate;
  adapters.runSyntheticCandidate = async params => {
    const evidence = await originalExecute(params);
    drifted = true;
    return evidence;
  };
  const originalRuntime = adapters.readRuntimeProvenance;
  adapters.readRuntimeProvenance = async () => {
    const runtime = await originalRuntime();
    if (drifted) runtime.workerSha = 'f'.repeat(40);
    return runtime;
  };
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH/,
  );
  assert.equal(calls.filter(call => call === 'runtime').length, 4);
  assert.ok(calls.includes('execute'), 'drift occurs during the execution itself');
  assert.ok(!calls.includes('readback:AFTER'), 'do not accept QA readback from a changed runtime');
  assert.ok(calls.includes('recover'), 'synthetic fixture must be recovered');
  assert.ok(calls.includes('remove-candidate'), 'owned inactive candidate must be compensated');
});

test('fixture lease expiring during pre-begin grant verification prevents all Worker writes', async () => {
  const bytes = Buffer.from('synthetic ZIP with fixture lease expiring during authorization');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  let checks = 0;
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    if (++checks === 2) {
      // Model the wall clock crossing the lease deadline while GitHub responds.
      plan.syntheticFixture.expiresAt = new Date(Date.now() - 1_000).toISOString();
    }
    return true;
  };
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.equal(checks, 2);
  assert.ok(!calls.includes('begin'), 'expired fixture must never reach beginIntake');
  assert.ok(!calls.includes('abort'), 'no intake was started');
});

test('fixture lease expiring during post-binding grant verification blocks browser QA', async () => {
  const bytes = Buffer.from('synthetic ZIP with fixture lease expiring before browser QA');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    if (calls.includes('readback:BEFORE')) {
      plan.syntheticFixture.expiresAt = new Date(Date.now() - 1_000).toISOString();
    }
    return true;
  };
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.ok(calls.includes('readback:BEFORE'));
  assert.ok(!calls.includes('execute'), 'expired fixture must never run browser QA');
  assert.ok(calls.includes('recover'), 'synthetic fixture recovery remains mandatory');
  assert.ok(calls.includes('remove-candidate'), 'only owned inactive candidate may be compensated');
});

test('revoked F0 grant during private source hashing blocks the first Worker write', async () => {
  const bytes = Buffer.from('synthetic ZIP with authorization revoked during hashing');
  const plan = planFor(bytes);
  const source = sourceFor(bytes);
  const originalRead = source.read.bind(source);
  let valid = true;
  source.read = async (...args) => {
    const part = await originalRead(...args);
    valid = false;
    return part;
  };
  const { calls, adapters } = adaptersFor(plan, {
    async verifyAuthorization() { calls.push('authorize'); return valid; },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source, adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.equal(calls.filter(x => x === 'authorize').length, 2);
  assert.ok(!calls.includes('begin'), 'no Worker mutation after grant revocation');
});

test('revoked F0 grant after intake compensates owned candidate before binding', async () => {
  const bytes = Buffer.from('synthetic ZIP with F0 grant revoked after intake');
  const plan = planFor(bytes);
  let valid = true;
  const { calls, adapters } = adaptersFor(plan);
  const originalRead = adapters.readCandidateR2;
  adapters.readCandidateR2 = async (...args) => {
    const result = await originalRead(...args);
    valid = false;
    return result;
  };
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    return valid;
  };
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.ok(calls.includes('remove-candidate'), 'owned inactive candidate compensated');
  assert.ok(!calls.includes('readback:BEFORE'), 'no synthetic binding after grant revocation');
  assert.ok(!calls.includes('execute'));
});

test('revoked F0 grant during synthetic binding blocks browser execution and recovers fixture', async () => {
  const bytes = Buffer.from('synthetic ZIP with F0 grant revoked during binding');
  const plan = planFor(bytes);
  let valid = true;
  const { calls, adapters } = adaptersFor(plan);
  const originalRead = adapters.readQaEvidence;
  adapters.readQaEvidence = async (...args) => {
    const result = await originalRead(...args);
    if (args[0].phase === 'BEFORE') valid = false;
    return result;
  };
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    return valid;
  };
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.ok(calls.includes('recover'), 'binding requires synthetic fixture recovery');
  assert.ok(calls.includes('remove-candidate'), 'compensate only after recovery');
  assert.ok(!calls.includes('execute'), 'browser QA must not run after grant revocation');
});


test('revoked F0 grant during begin aborts intake before the first part', async () => {
  const bytes = Buffer.from('synthetic ZIP revoked during begin');
  const plan = planFor(bytes);
  let valid = true;
  const { calls, adapters } = adaptersFor(plan);
  const originalBegin = adapters.beginIntake;
  adapters.beginIntake = async (...args) => {
    await originalBegin(...args);
    valid = false;
  };
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    return valid;
  };
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.ok(calls.includes('begin'));
  assert.ok(!calls.includes('part:1'), 'no part upload after revocation');
  assert.ok(!calls.includes('complete'));
  assert.ok(calls.includes('abort'), 'operation-scoped multipart teardown');
});

test('revoked F0 grant after first multipart part blocks the second part', async () => {
  const bytes = Buffer.alloc(F5_EXECUTOR_LIMITS.partBytes + 17, 7);
  const plan = planFor(bytes);
  let valid = true;
  const { calls, adapters } = adaptersFor(plan);
  const originalPut = adapters.putIntakePart;
  adapters.putIntakePart = async params => {
    await originalPut(params);
    if (params.partNumber === 1) valid = false;
  };
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    return valid;
  };
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.ok(calls.includes('part:1'));
  assert.ok(!calls.includes('part:2'), 'no further multipart write after revocation');
  assert.ok(!calls.includes('complete'));
  assert.ok(calls.includes('abort'), 'partial intake must be aborted');
});

test('revoked F0 grant after final multipart part blocks completion', async () => {
  const bytes = Buffer.from('synthetic ZIP revoked after final part');
  const plan = planFor(bytes);
  let valid = true;
  const { calls, adapters } = adaptersFor(plan);
  const originalPut = adapters.putIntakePart;
  adapters.putIntakePart = async params => {
    await originalPut(params);
    valid = false;
  };
  adapters.verifyAuthorization = async () => {
    calls.push('authorize');
    return valid;
  };
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED/);
  assert.ok(calls.includes('part:1'));
  assert.ok(!calls.includes('complete'), 'no intake finalization after revocation');
  assert.ok(calls.includes('abort'), 'last part must still be compensated');
});

test('streams an archive over multiple bounded multipart requests', async () => {
  const bytes = Buffer.alloc(F5_EXECUTOR_LIMITS.partBytes + 17, 7);
  const plan = planFor(bytes);
  const source = sourceFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  const result = await executeF5InactiveCandidate({ plan, source, adapters });
  assert.equal(result.status, 'INACTIVE_CANDIDATE_VERIFIED');
  assert.deepEqual(calls.filter(call => call.startsWith('part:')), ['part:1', 'part:2']);
  assert.deepEqual(source.lengths.slice(-2), [F5_EXECUTOR_LIMITS.partBytes, 17]);
});

test('keeps the first Worker write behind authorization, runtime, receipts and original SHA checks', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  for (const failure of [
    { override: { verifyAuthorization: async () => false }, error: /F0_AUTHORIZATION_NOT_VERIFIED/ },
    { override: { readRuntimeProvenance: async () => ({ workerSha: 'f'.repeat(40), pagesSha: 'f'.repeat(7), harnessSha: plan.harnessSha }) }, error: /STAGING_RUNTIME_SHA_MISMATCH/ },
    { override: { verifyF0Receipts: async () => false }, error: /F0_RECEIPTS_NOT_VERIFIED/ },
  ]) {
    const { calls, adapters } = adaptersFor(plan, failure.override);
    await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }), failure.error);
    assert.ok(!calls.includes('begin'));
  }
  const { calls, adapters } = adaptersFor(plan);
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(Buffer.from('different package bytes')), adapters }),
    /ORIGINAL_ZIP_SHA_MISMATCH/);
  assert.ok(!calls.includes('begin'));
});

test('rejects incomplete F0 receipts before starting the intake', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  delete plan.syntheticFixture.recoveryReceiptSha256;
  const { calls, adapters } = adaptersFor(plan);
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/);
  assert.deepEqual(calls, []);
});

test('aborts a partially uploaded operation when a multipart request fails', async () => {
  const bytes = Buffer.alloc(F5_EXECUTOR_LIMITS.partBytes + 17, 3);
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async putIntakePart({ partNumber }) {
      calls.push(`part:${partNumber}`);
      if (partNumber === 2) throw new Error('simulated-part-failure');
    },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /simulated-part-failure/);
  assert.ok(calls.includes('abort'));
  assert.ok(!calls.includes('complete'));
});

test('attempts idempotent intake abort when begin may have committed before losing its response', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async beginIntake() { calls.push('begin'); throw new Error('simulated-begin-response-lost'); },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /simulated-begin-response-lost/);
  assert.ok(calls.includes('abort'));
  assert.ok(!calls.includes('part:1'));
});

test('requires a scoped confirmed abort receipt after a lost begin response', async () => {
  const bytes = Buffer.from('synthetic package bytes for abort recovery');
  const plan = planFor(bytes);
  for (const bad of [
    { operationId: plan.candidate.operationId, aborted: false },
    { operationId: '223e4567-e89b-12d3-a456-426614174000', aborted: true },
    null,
  ]) {
    const { calls, adapters } = adaptersFor(plan, {
      async beginIntake() { calls.push('begin'); throw new Error('begin-response-lost'); },
      async abortIntake() { calls.push('abort'); return bad; },
    });
    await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
      /F5_EXECUTOR_RECOVERY_REQUIRED/);
    assert.ok(calls.includes('abort'));
  }
});

test('re-hashes uploaded parts and aborts if the private source changes after preflight', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const source = sourceFor(bytes);
  const read = source.read.bind(source);
  let count = 0;
  source.read = async (offset, length) => {
    count++;
    return count === 1 ? read(offset, length) : Buffer.alloc(length, 8);
  };
  const { calls, adapters } = adaptersFor(plan);
  await assert.rejects(executeF5InactiveCandidate({ plan, source, adapters }),
    /PRIVATE_SOURCE_CHANGED_DURING_UPLOAD/);
  assert.ok(calls.includes('abort'));
  assert.ok(!calls.includes('complete'));
});

test('resolves a lost complete response before deciding whether to abort or remove a candidate', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const candidate = adaptersFor(plan).candidate;
  const { calls, adapters } = adaptersFor(plan, {
    async completeIntake() { calls.push('complete'); throw new Error('simulated-response-lost'); },
    async resolveAmbiguousIntake() {
      calls.push('resolve-intake'); return { verified: true, state: 'CANDIDATE_PRESENT', candidate };
    },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /simulated-response-lost/);
  assert.ok(calls.includes('resolve-intake'));
  assert.ok(calls.includes('remove-candidate'));
  assert.ok(!calls.includes('abort'));
});

test('resolves an HTTP 200 completion with incomplete candidate receipt before teardown', async () => {
  const bytes = Buffer.from('synthetic package bytes for incomplete 200 receipt');
  const plan = planFor(bytes);
  const owned = adaptersFor(plan).candidate;
  const { calls, adapters } = adaptersFor(plan, {
    async completeIntake() { calls.push('complete'); return { status: 'VALIDATED' }; },
    async resolveAmbiguousIntake() {
      calls.push('resolve-intake');
      return { verified: true, state: 'CANDIDATE_PRESENT', candidate: owned };
    },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /CANDIDATE_NOT_VALIDATED_INACTIVE/);
  assert.ok(calls.includes('resolve-intake'), 'HTTP 200 is not proof of candidate ownership');
  assert.ok(calls.includes('remove-candidate'), 'owned candidate must be removed');
  assert.ok(!calls.includes('abort'), 'candidate already materialized');
});

test('never deletes an unverified HTTP 200 candidate if operation resolution is not CANDIDATE_PRESENT', async () => {
  const bytes = Buffer.from('synthetic private ZIP HTTP 200 untrusted ownership');
  const plan = planFor(bytes);
  const fake = { ...adaptersFor(plan).candidate, status: 'REJECTED' };
  for (const state of ['CLEAN', 'INTAKE_PRESENT', 'THROW', 'FOREIGN']) {
    const { calls, adapters } = adaptersFor(plan, {
      async completeIntake() { calls.push('complete'); return fake; },
      async resolveAmbiguousIntake() {
        calls.push('resolve-intake');
        if (state === 'THROW') throw Error('resolver-unavailable');
        if (state === 'FOREIGN') return { verified: true, state: 'CANDIDATE_PRESENT',
          candidate: { ...fake, createdByOperation: false } };
        return { verified: true, state };
      },
    });
    await assert.rejects(executeF5InactiveCandidate({
      plan, source: sourceFor(bytes), adapters,
    }), state === 'THROW' || state === 'FOREIGN'
      ? /F5_EXECUTOR_RECOVERY_REQUIRED/ : /CANDIDATE_NOT_VALIDATED_INACTIVE/);
    assert.ok(calls.includes('resolve-intake'), state);
    assert.ok(!calls.includes('remove-candidate'),
      'untrusted completion receipt must never authorize deletion: ' + state);
    if (state === 'INTAKE_PRESENT' || state === 'THROW')
      assert.ok(calls.includes('abort'), 'unresolved multipart intake needs abort: ' + state);
    else assert.ok(!calls.includes('abort'), 'CLEAN or foreign-owned candidate must not be aborted');
  }
});

test('refuses to clean up a candidate with unproven operation ownership after lost completion', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const candidate = { ...adaptersFor(plan).candidate, packageSha256: receipt('8') };
  const { calls, adapters } = adaptersFor(plan, {
    async completeIntake() { calls.push('complete'); throw new Error('simulated-response-lost'); },
    async resolveAmbiguousIntake() {
      calls.push('resolve-intake'); return { verified: true, state: 'CANDIDATE_PRESENT', candidate };
    },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_RECOVERY_REQUIRED/);
  assert.ok(!calls.includes('remove-candidate'));
});

test('recovers the synthetic fixture and removes only an operation-owned candidate after failed evidence', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async runSyntheticCandidate() { calls.push('execute'); return { source: 'untrusted' }; },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /CANDIDATE_EXECUTION_EVIDENCE_INVALID/);
  assert.ok(calls.includes('recover'));
  assert.ok(calls.includes('remove-candidate'));
});

test('reports recovery as required if cleanup compensation cannot be verified', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async runSyntheticCandidate() { calls.push('execute'); return { source: 'untrusted' }; },
    async recoverSyntheticCandidate() { calls.push('recover'); throw new Error('simulated-recovery-failure'); },
  });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_RECOVERY_REQUIRED/);
  assert.ok(!calls.includes('remove-candidate'),
    'unrecovered synthetic fixture must retain its candidate for manual reconciliation');
});


test('refuses destructive compensation when ambiguous operation readback is active', async () => {
  const bytes = Buffer.from('synthetic ambiguous active candidate response');
  const plan = planFor(bytes);
  const owned = adaptersFor(plan).candidate;
  for (const active of [true, null, undefined]) {
    const { calls, adapters } = adaptersFor(plan, {
      async completeIntake() { calls.push('complete'); throw Error('HTTP 500 lost completion'); },
      async resolveAmbiguousIntake() {
        calls.push('resolve-intake');
        return { verified: true, state: 'CANDIDATE_PRESENT',
          candidate: { ...owned, active } };
      },
    });
    await assert.rejects(
      executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
      /F5_EXECUTOR_RECOVERY_REQUIRED/,
    );
    assert.ok(calls.includes('resolve-intake'));
    assert.ok(!calls.includes('remove-candidate'),
      'active/unknown candidate must never be deleted after HTTP 500');
  }
});

test('does not delete candidate when synthetic recovery receipt is unverified', async () => {
  const bytes = Buffer.from('synthetic incomplete recovery receipt');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async runSyntheticCandidate() { calls.push('execute'); return { source: 'untrusted' }; },
    async recoverSyntheticCandidate() {
      calls.push('recover');
      return { verified: false, syntheticFixtureRecovered: true,
        receiptSha256: receipt('a') };
    },
  });
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /F5_EXECUTOR_RECOVERY_REQUIRED/,
  );
  assert.ok(calls.includes('recover'));
  assert.ok(!calls.includes('remove-candidate'),
    'failed synthetic recovery must not trigger destructive package cleanup');
});

test('does not delete an existing idempotent candidate returned for a duplicate ZIP', async () => {
  const bytes = Buffer.from('synthetic package bytes');
  const plan = planFor(bytes);
  const existing = { ...adaptersFor(plan).candidate,
    packageId: '223e4567-e89b-12d3-a456-426614174000', createdByOperation: false,
    alreadyExisted: true };
  const { calls, adapters } = adaptersFor(plan, { async completeIntake() { calls.push('complete'); return existing; } });
  await assert.rejects(executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /CANDIDATE_NOT_VALIDATED_INACTIVE/);
  assert.ok(!calls.includes('remove-candidate'));
});

test('rejects NOT_APPLICABLE, absent or failing F5 static gates before D1/R2 QA', async () => {
  const bytes = Buffer.from('valid-synthetic-fixture-source');
  const plan = planFor(bytes);
  const fields = ['structural', 'completionManifest', 'diagnostics'];
  const base = adaptersFor(plan).candidate;
  for (const field of fields) {
    for (const status of ['NOT_APPLICABLE', 'FAIL', undefined]) {
      const changedSection = status === undefined ? undefined : { status };
      const candidate = { ...base, [field]: changedSection };
      const { calls, adapters } = adaptersFor(plan, {
        async completeIntake() { calls.push('complete'); return candidate; },
        async resolveAmbiguousIntake() {
          calls.push('resolve-intake');
          return { verified: true, state: 'CANDIDATE_PRESENT', candidate: base };
        },
      });
      await assert.rejects(executeF5InactiveCandidate({
        plan, source: sourceFor(bytes), adapters,
      }), /QUALITY_GATE_EVIDENCE_INCOMPLETE/, `${field}=${status}`);
      assert.equal(calls.includes('d1-candidate'), false);
      assert.equal(calls.includes('r2-candidate'), false);
      assert.equal(calls.includes('execute'), false);
      assert.equal(calls.includes('remove-candidate'), true);
    }
  }
});

test('F5 rejects non-incomplete Worker D1 status before and after synthetic QA', async () => {
  const bytes = Buffer.from('synthetic package bytes for status gate');
  const plan = planFor(bytes);
  for (const phase of ['BEFORE', 'AFTER']) {
    for (const status of ['APROVADO', 'CANCELADO', undefined]) {
      const { calls, adapters } = adaptersFor(plan);
      const original = adapters.readQaEvidence;
      adapters.readQaEvidence = async params => {
        const row = await original(params);
        if (params.phase === phase) row.completionStatus = status;
        return row;
      };
      await assert.rejects(
        executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
        new RegExp(phase + '_SYNTHETIC_D1_READBACK_MISMATCH'),
        phase + ' ' + String(status),
      );
      assert.ok(calls.includes('remove-candidate'), 'candidate cleanup required');
    }
  }
});

test('F5 rejects non-incomplete synthetic browser status despite valid digests', async () => {
  const bytes = Buffer.from('synthetic package bytes for execution status');
  const plan = planFor(bytes);
  for (const status of ['APROVADO', 'CANCELADO', undefined]) {
    const { calls, adapters } = adaptersFor(plan);
    const original = adapters.runSyntheticCandidate;
    adapters.runSyntheticCandidate = async params => ({
      ...(await original(params)), completionStatus: status,
    });
    await assert.rejects(
      executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
      /CANDIDATE_EXECUTION_EVIDENCE_INVALID/, String(status),
    );
    assert.ok(calls.includes('recover'), 'synthetic recovery required');
    assert.ok(calls.includes('remove-candidate'), 'candidate cleanup required');
  }
});

test('rejects stale final D1 readback when Chromium and WebKit receipts advanced further', async () => {
  const bytes = Buffer.from('synthetic F5 candidate with two browser commits');
  const plan = planFor(bytes);
  const { adapters } = adaptersFor(plan);
  const run = adapters.runSyntheticCandidate;
  adapters.runSyntheticCandidate = async (...args) => ({
    ...(await run(...args)), sessionCount: 2,
  });
  // Existing AFTER mock is sessionCount=1 with the same CMI digest. A
  // digest-only match must not masquerade as WebKit's persisted readback.
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /D1_EXECUTION_EVIDENCE_NOT_PERSISTED/,
  );
});

test('accepts D1 readback only after both browser receipts are observable', async () => {
  const bytes = Buffer.from('synthetic F5 candidate with verified browser readback');
  const plan = planFor(bytes);
  const { adapters } = adaptersFor(plan);
  const run = adapters.runSyntheticCandidate;
  const read = adapters.readQaEvidence;
  adapters.runSyntheticCandidate = async (...args) => ({
    ...(await run(...args)), sessionCount: 2,
  });
  adapters.readQaEvidence = async (args) => ({
    ...(await read(args)),
    sessionCount: args.phase === 'AFTER' ? 2 : 0,
  });
  const result = await executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters });
  assert.equal(result.status, 'INACTIVE_CANDIDATE_VERIFIED');
  assert.equal(result.execution.sessionCount, 2);
});

test('rejects R2 candidate readback without an explicit inactive boolean', async () => {
  const bytes = Buffer.from('synthetic inactive candidate with ambiguous R2 flag');
  const plan = planFor(bytes);
  for (const active of [undefined, null, 0, 'false', 1, true]) {
    const { adapters } = adaptersFor(plan);
    const read = adapters.readCandidateR2;
    adapters.readCandidateR2 = async (...args) => ({
      ...(await read(...args)), active,
    });
    await assert.rejects(
      executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
      /R2_CANDIDATE_ASSET_READBACK_MISMATCH/,
    );
  }
});


test('stops further multipart writes if fixture lease expires after intake begins', async () => {
  const bytes = Buffer.from('synthetic package whose lease expires after begin');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async beginIntake() {
      calls.push('begin');
      plan.syntheticFixture.expiresAt = new Date(Date.now() - 60_000).toISOString();
    },
  });
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.ok(calls.includes('abort'));
  assert.ok(!calls.includes('part:1'));
  assert.ok(!calls.includes('complete'));
});

test('does not complete multipart intake after lease expires during last part', async () => {
  const bytes = Buffer.from('synthetic package whose lease expires during part');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan, {
    async putIntakePart({ partNumber }) {
      calls.push(`part:${partNumber}`);
      plan.syntheticFixture.expiresAt = new Date(Date.now() - 60_000).toISOString();
    },
  });
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.ok(calls.includes('abort'));
  assert.ok(!calls.includes('complete'));
});

test('does not launch browser QA after F0 binding outlives synthetic lease', async () => {
  const bytes = Buffer.from('synthetic package with expired binding before browser');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  const read = adapters.readQaEvidence;
  adapters.readQaEvidence = async params => {
    const row = await read(params);
    if (params.phase === 'BEFORE') {
      plan.syntheticFixture.expiresAt = new Date(Date.now() - 60_000).toISOString();
    }
    return row;
  };
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.ok(calls.includes('readback:BEFORE'));
  assert.ok(!calls.includes('execute'));
  assert.ok(calls.includes('recover'));
});

test('rejects expired synthetic fixture before any staging mutation', async () => {
  const bytes = Buffer.from('synthetic F5 expired fixture');
  const plan = planFor(bytes);
  plan.syntheticFixture.expiresAt = new Date(Date.now() - 60_000).toISOString();
  const { calls, adapters } = adaptersFor(plan);
  await assert.rejects(
    executeF5InactiveCandidate({ plan, source: sourceFor(bytes), adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/,
  );
  assert.deepEqual(calls, []);
});

test('rechecks fixture expiry after private ZIP hashing and before first Worker write', async () => {
  const bytes = Buffer.from('synthetic F5 fixture that expires during source hashing');
  const plan = planFor(bytes);
  const source = sourceFor(bytes);
  const read = source.read.bind(source);
  source.read = async (...args) => {
    const chunk = await read(...args);
    plan.syntheticFixture.expiresAt = new Date(Date.now() - 60_000).toISOString();
    return chunk;
  };
  const { calls, adapters } = adaptersFor(plan);
  await assert.rejects(executeF5InactiveCandidate({ plan, source, adapters }),
    /PLAN_OR_F0_RECEIPT_INVALID/);
  assert.ok(!calls.includes('begin'));
});

test('F5 refuses missing, cross-scope or nonzero physical F0 assessment readback before browser QA', async () => {
  const bytes = Buffer.from('synthetic ZIP for F0 assessment provenance guard');
  const mutations = [
    ['missing', row => { delete row.assessmentEvidence; }, 'UNPROVEN'],
    ['wrong tenant', row => { row.assessmentEvidence.tenantId++; }, 'UNPROVEN'],
    ['wrong cycle', row => { row.assessmentEvidence.cycleId++; }, 'UNPROVEN'],
    ['wrong package id', row => { row.assessmentEvidence.packageId = 'different'; }, 'UNPROVEN'],
    ['wrong edition sha', row => { row.assessmentEvidence.packageSha256 = 'f'.repeat(64); }, 'UNPROVEN'],
    ['missing edition sha', row => { delete row.assessmentEvidence.packageSha256; }, 'UNPROVEN'],
    ['wrong runtime sha', row => { row.assessmentEvidence.runtimeSha = 'f'.repeat(40); }, 'UNPROVEN'],
    ['stale', row => { row.assessmentEvidence.observedAt = '2020-01-01T00:00:00Z'; }, 'UNPROVEN'],
    ['attempted', row => { row.assessmentEvidence.assessmentAttemptCount = 1; }, 'NOT_EMPTY'],
    ['approved', row => { row.assessmentEvidence.assessmentApprovedCount = 1; }, 'NOT_EMPTY'],
    ['external approved', row => { row.assessmentEvidence.externalAssessmentApprovedCount = 1; }, 'NOT_EMPTY'],
    ['certificate issued', row => { row.assessmentEvidence.certificateIssuedCount = 1; }, 'NOT_EMPTY'],
  ];
  for (const [label, mutate, code] of mutations) {
    const plan = planFor(bytes);
    const { calls, adapters } = adaptersFor(plan);
    const original = adapters.readQaEvidence;
    adapters.readQaEvidence = async params => {
      const row = await original(params);
      if (params.phase === 'BEFORE') mutate(row);
      return row;
    };
    await assert.rejects(executeF5InactiveCandidate({
      plan, source: sourceFor(bytes), adapters,
    }), new RegExp('F5_EXECUTOR_ASSESSMENT_READBACK_' + code), label);
    assert.ok(!calls.includes('execute'), label + ': no browser QA without F0 proof');
    assert.ok(calls.includes('recover'), label + ': recover synthetic fixture');
    assert.ok(calls.includes('remove-candidate'), label + ': compensate inactive candidate');
  }
});

test('F5 refuses a missing AFTER assessment witness despite successful browser commits', async () => {
  const bytes = Buffer.from('synthetic ZIP for post-browser F0 assessment provenance');
  const plan = planFor(bytes);
  const { calls, adapters } = adaptersFor(plan);
  const original = adapters.readQaEvidence;
  adapters.readQaEvidence = async params => {
    const row = await original(params);
    if (params.phase === 'AFTER') delete row.assessmentEvidence;
    return row;
  };
  await assert.rejects(executeF5InactiveCandidate({
    plan, source: sourceFor(bytes), adapters,
  }), /F5_EXECUTOR_ASSESSMENT_READBACK_UNPROVEN/);
  assert.ok(calls.includes('execute'), 'browser commit alone does not certify F0 absence');
  assert.ok(calls.includes('recover'), 'failed postcondition must recover synthetics');
  assert.ok(calls.includes('remove-candidate'), 'failed candidate must be compensated');
});

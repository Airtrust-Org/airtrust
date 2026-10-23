#!/usr/bin/env node
/**
 * Governed one-candidate SCORM staging state machine.
 *
 * All I/O is injected so contract tests can run without credentials or remote
 * writes. Production adapters must use the authenticated Worker API and F0
 * receipts; this module never talks to D1/R2 directly and has no activation,
 * assessment-approval, certification, or certificate code path.
 */
import { createHash } from 'node:crypto';

export const F5_EXECUTOR_LIMITS = Object.freeze({
  zipBytes: 80 * 1024 * 1024,
  partBytes: 8 * 1024 * 1024,
  maxParts: 10,
  mutex: 'airtrust-staging-mutations-and-scorm-qa',
});

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const positive = value => Number.isSafeInteger(value) && value > 0;
const fail = code => { throw new Error(`F5_EXECUTOR_${code}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateF5ExecutionPlan(plan) {
  const c = plan?.candidate;
  const fixture = plan?.syntheticFixture;
  if (plan?.schemaVersion !== 1 || plan?.scope !== 'ONE_INACTIVE_CANDIDATE' ||
      !HEX40.test(plan.releaseSha ?? '') || !HEX40.test(plan.harnessSha ?? '') ||
      plan?.mutex !== F5_EXECUTOR_LIMITS.mutex ||
      c?.environment !== 'staging' || !positive(c.tenantId) || !positive(c.courseId) ||
      !HEX64.test(c.packageSha256 ?? '') || !Number.isSafeInteger(c.zipBytes) ||
      c.zipBytes < 22 || c.zipBytes > F5_EXECUTOR_LIMITS.zipBytes ||
      !UUID.test(c.operationId ?? '') ||
      !positive(fixture?.enrollmentId) || !positive(fixture?.cycleId) ||
      !UUID.test(fixture?.runId ?? '') ||
      !HEX64.test(fixture?.approvalReceiptSha256 ?? '') ||
      !HEX64.test(fixture?.provisioningReceiptSha256 ?? '') ||
      !HEX64.test(fixture?.recoveryReceiptSha256 ?? '') ||
      !HEX64.test(fixture?.cleanupContractSha256 ?? '')) {
    fail('PLAN_OR_F0_RECEIPT_INVALID');
  }
  return plan;
}
async function hashSource(source, expectedBytes) {
  if (!source || typeof source.read !== 'function' || source.size !== expectedBytes) {
    fail('PRIVATE_SOURCE_MISSING_OR_SIZE_MISMATCH');
  }
  const hash = createHash('sha256');
  for (let offset = 0; offset < expectedBytes;) {
    const length = Math.min(F5_EXECUTOR_LIMITS.partBytes, expectedBytes - offset);
    const bytes = await source.read(offset, length);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) fail('PRIVATE_SOURCE_SHORT_READ');
    hash.update(bytes);
    offset += length;
  }
  const actual = hash.digest('hex');
  return { size: expectedBytes, sha256: actual };
}

function verifyInactiveQualityGate(candidate, plan) {
  if (!candidate || candidate.packageSha256 !== plan.candidate.packageSha256 ||
      !UUID.test(candidate.packageId ?? '') || candidate.status !== 'VALIDATED' ||
      candidate.createdByOperation !== true || candidate.alreadyExisted !== false ||
      candidate.active !== false || candidate.completionWritten !== false ||
      candidate.certificateIssued !== false || candidate.zipBytes !== plan.candidate.zipBytes) {
    fail('CANDIDATE_NOT_VALIDATED_INACTIVE');
  }
  // The canonical SCORM quality gate requires all three static sections to
  // pass. An optional/not-run diagnostic is not proof of an intact F5 package.
  if (candidate.structural?.status !== 'PASS' ||
      candidate.completionManifest?.status !== 'PASS' ||
      candidate.diagnostics?.status !== 'PASS') {
    fail('QUALITY_GATE_EVIDENCE_INCOMPLETE');
  }
  const r2 = candidate.r2Readback;
  if (r2?.source !== 'WORKER_R2_STREAMED_ZIP_READBACK' ||
      r2.zipSha256 !== plan.candidate.packageSha256 || r2.zipBytes !== plan.candidate.zipBytes ||
      !HEX64.test(r2.launchAssetSha256 ?? '') || r2.rangeRequests < 1 || r2.rangeRequests > 6 ||
      r2.etagStable !== true || r2.memberIntegrityVerified !== true) {
    fail('R2_ORIGINAL_ARCHIVE_READBACK_UNPROVEN');
  }
  return candidate;
}

function verifyCandidateRow(row, candidate, plan) {
  if (!row || row.source !== 'WORKER_D1_CANDIDATE_READBACK' ||
      row.tenantId !== plan.candidate.tenantId || row.courseId !== plan.candidate.courseId ||
      row.packageId !== candidate.packageId || row.packageSha256 !== candidate.packageSha256 ||
      row.status !== 'VALIDATED' || row.active !== false ||
      row.r2Prefix !== candidate.r2Prefix || row.launchFile !== candidate.launchFile) {
    fail('D1_CANDIDATE_READBACK_MISMATCH');
  }
}

function verifyQaEvidence(row, plan, candidate, phase) {
  const fixture = plan.syntheticFixture;
  if (!row || row.source !== 'WORKER_D1_STAGING_READBACK' ||
      row.tenantId !== plan.candidate.tenantId || row.courseId !== plan.candidate.courseId ||
      row.packageId !== candidate.packageId || row.packageSha256 !== plan.candidate.packageSha256 ||
      row.runtimeSha !== plan.releaseSha || row.synthetic !== true ||
      row.enrollmentId !== fixture.enrollmentId || row.cycleId !== fixture.cycleId ||
      row.runId !== fixture.runId || row.approvalReceiptSha256 !== fixture.approvalReceiptSha256 ||
      row.qualificationHistoryCount !== 0 || row.certificateDocument !== null ||
      row.completionStatus === 'CONCLUIDO' ||
      !Number.isSafeInteger(row.sessionCount) || row.sessionCount < 0 ||
      row.scormScoreRaw !== null ||
      (row.cmiSha256 !== null && !HEX64.test(row.cmiSha256 ?? '')) ||
      (row.suspendSha256 !== null && !HEX64.test(row.suspendSha256 ?? ''))) {
    fail(`${phase}_SYNTHETIC_D1_READBACK_MISMATCH`);
  }
  return row;
}

function verifyExecutionEvidence(evidence, plan, candidate) {
  const fixture = plan.syntheticFixture;
  if (!evidence || evidence.source !== 'WORKER_CANDIDATE_QA_EXECUTION' ||
      evidence.candidateId !== candidate.packageId ||
      evidence.packageSha256 !== plan.candidate.packageSha256 ||
      evidence.enrollmentId !== fixture.enrollmentId || evidence.cycleId !== fixture.cycleId ||
      evidence.runId !== fixture.runId || evidence.servedPackageSha256 !== plan.candidate.packageSha256 ||
      evidence.committedPackageSha256 !== plan.candidate.packageSha256 ||
      !HEX64.test(evidence.cmiSha256 ?? '') || !HEX64.test(evidence.suspendSha256 ?? '') ||
      !positive(evidence.sessionCount) || evidence.completionStatus === 'CONCLUIDO' ||
      evidence.qualificationHistoryCount !== 0 || evidence.certificateDocument !== null ||
      evidence.assessmentAttempted !== false || evidence.assessmentApproved !== false ||
      evidence.externalAssessmentApproved !== false || evidence.certificateIssued !== false) {
    fail('CANDIDATE_EXECUTION_EVIDENCE_INVALID');
  }
  return evidence;
}

/**
 * Runs one authorized, still-inactive candidate through Worker-backed intake,
 * candidate readbacks and an F0-provisioned synthetic execution adapter.
 * Callers must serialize the operation under the shared staging mutex.
 */
export async function executeF5InactiveCandidate({ plan, source, adapters }) {
  validateF5ExecutionPlan(plan);
  const c = plan.candidate;
  const f = plan.syntheticFixture;
  const required = ['verifyAuthorization', 'readRuntimeProvenance', 'verifyF0Receipts',
    'beginIntake', 'putIntakePart', 'completeIntake', 'abortIntake', 'resolveAmbiguousIntake',
    'readCandidateD1', 'readCandidateR2', 'readQaEvidence',
    'runSyntheticCandidate', 'recoverSyntheticCandidate', 'cleanupSyntheticCandidate',
    'removeFailedCandidate'];
  if (!adapters || required.some(name => typeof adapters[name] !== 'function')) fail('ADAPTERS_INCOMPLETE');

  // Every precondition is proven before the first Worker write.
  const authorized = await adapters.verifyAuthorization(plan);
  if (authorized !== true) fail('F0_AUTHORIZATION_NOT_VERIFIED');
  const runtime = await adapters.readRuntimeProvenance();
  if (runtime?.workerSha !== plan.releaseSha || runtime?.pagesSha !== plan.releaseSha.slice(0, 7) ||
      runtime?.harnessSha !== plan.harnessSha) {
    fail('STAGING_RUNTIME_SHA_MISMATCH');
  }
  if (await adapters.verifyF0Receipts(plan) !== true) fail('F0_RECEIPTS_NOT_VERIFIED');
  const sourceIdentity = await hashSource(source, c.zipBytes);
  if (sourceIdentity.sha256 !== c.packageSha256) fail('ORIGINAL_ZIP_SHA_MISMATCH');

  let intakeStarted = false;
  let completionAttempted = false;
  let candidate = null;
  let syntheticTouched = false;
  let primaryError = null;
  try {
    // Treat begin as potentially side-effecting even if its response is lost;
    // abortIntake must be idempotent for this operation ID.
    intakeStarted = true;
    await adapters.beginIntake({
      tenantId: c.tenantId, courseId: c.courseId, operationId: c.operationId,
      packageSha256: c.packageSha256, zipBytes: c.zipBytes,
    });
    const partCount = Math.ceil(c.zipBytes / F5_EXECUTOR_LIMITS.partBytes);
    if (partCount < 1 || partCount > F5_EXECUTOR_LIMITS.maxParts) fail('PART_COUNT_OUT_OF_RANGE');
    const uploadHash = createHash('sha256');
    for (let index = 0; index < partCount; index++) {
      const offset = index * F5_EXECUTOR_LIMITS.partBytes;
      const length = Math.min(F5_EXECUTOR_LIMITS.partBytes, c.zipBytes - offset);
      const bytes = await source.read(offset, length);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) fail('PRIVATE_SOURCE_SHORT_READ');
      uploadHash.update(bytes);
      await adapters.putIntakePart({
        tenantId: c.tenantId, courseId: c.courseId, operationId: c.operationId,
        partNumber: index + 1, contentLength: length, bytes,
      });
    }
    if (uploadHash.digest('hex') !== c.packageSha256) fail('PRIVATE_SOURCE_CHANGED_DURING_UPLOAD');
    completionAttempted = true;
    const uploaded = await adapters.completeIntake({
      tenantId: c.tenantId, courseId: c.courseId, operationId: c.operationId,
    });
    completionAttempted = false;
    intakeStarted = false;
    if (uploaded?.createdByOperation === true &&
        uploaded?.alreadyExisted === false) candidate = uploaded;
    candidate = verifyInactiveQualityGate(uploaded, plan);

    const d1Candidate = await adapters.readCandidateD1({ tenantId: c.tenantId,
      courseId: c.courseId, packageId: candidate.packageId, packageSha256: c.packageSha256 });
    verifyCandidateRow(d1Candidate, candidate, plan);
    const r2Candidate = await adapters.readCandidateR2({ tenantId: c.tenantId,
      courseId: c.courseId, packageId: candidate.packageId,
      packageSha256: candidate.packageSha256, launchFile: candidate.launchFile,
      expectedSha256: candidate.r2Readback.launchAssetSha256 });
    if (r2Candidate?.source !== 'WORKER_R2_CANDIDATE_ASSET_READBACK' ||
        r2Candidate.packageId !== candidate.packageId || r2Candidate.packageSha256 !== c.packageSha256 ||
        r2Candidate.assetSha256 !== candidate.r2Readback.launchAssetSha256 ||
        r2Candidate.active === true) fail('R2_CANDIDATE_ASSET_READBACK_MISMATCH');

    const before = verifyQaEvidence(await adapters.readQaEvidence({
      tenantId: c.tenantId, courseId: c.courseId, packageId: candidate.packageId,
      enrollmentId: f.enrollmentId, packageSha256: c.packageSha256, phase: 'BEFORE',
    }), plan, candidate, 'BEFORE');
    syntheticTouched = true;
    const execution = verifyExecutionEvidence(await adapters.runSyntheticCandidate({
      tenantId: c.tenantId, courseId: c.courseId, packageId: candidate.packageId,
      packageSha256: c.packageSha256, enrollmentId: f.enrollmentId,
      cycleId: f.cycleId, runId: f.runId,
    }), plan, candidate);
    const after = verifyQaEvidence(await adapters.readQaEvidence({
      tenantId: c.tenantId, courseId: c.courseId, packageId: candidate.packageId,
      enrollmentId: f.enrollmentId, packageSha256: c.packageSha256, phase: 'AFTER',
    }), plan, candidate, 'AFTER');
    if (after.cmiSha256 !== execution.cmiSha256 || after.suspendSha256 !== execution.suspendSha256 ||
        after.sessionCount < before.sessionCount + 1 || after.servedPackageSha256 !== c.packageSha256 ||
        after.committedPackageSha256 !== c.packageSha256) fail('D1_EXECUTION_EVIDENCE_NOT_PERSISTED');

    const cleanupReceipt = await adapters.cleanupSyntheticCandidate({
      tenantId: c.tenantId, courseId: c.courseId, packageId: candidate.packageId,
      enrollmentId: f.enrollmentId, cycleId: f.cycleId, runId: f.runId,
      preserveCandidateInactive: true,
    });
    if (cleanupReceipt?.verified !== true || cleanupReceipt?.syntheticFixtureCleaned !== true ||
        cleanupReceipt?.candidatePreservedInactive !== true ||
        !HEX64.test(cleanupReceipt?.receiptSha256 ?? '')) fail('SYNTHETIC_CLEANUP_RECEIPT_INVALID');
    syntheticTouched = false;
    const finalCandidate = await adapters.readCandidateD1({ tenantId: c.tenantId,
      courseId: c.courseId, packageId: candidate.packageId, packageSha256: c.packageSha256 });
    verifyCandidateRow(finalCandidate, candidate, plan);
    return {
      source: 'F5_INACTIVE_CANDIDATE_EXECUTOR_V1', status: 'INACTIVE_CANDIDATE_VERIFIED',
      candidate: { tenantId: c.tenantId, courseId: c.courseId,
        packageId: candidate.packageId, packageSha256: c.packageSha256,
        status: 'VALIDATED', active: false },
      runtimeSha: plan.releaseSha, operationId: c.operationId,
      r2Readback: candidate.r2Readback,
      r2CandidateAssetSha256: r2Candidate.assetSha256,
      d1ReadbackSource: d1Candidate.source,
      syntheticEnrollmentId: f.enrollmentId,
      execution: { cmiSha256: execution.cmiSha256, suspendSha256: execution.suspendSha256,
        sessionCount: after.sessionCount, servedPackageSha256: after.servedPackageSha256,
        committedPackageSha256: after.committedPackageSha256 },
      cleanupReceiptSha256: cleanupReceipt.receiptSha256,
      activationAuthorized: false, assessmentApproved: false,
      certificationIssued: false, certificateIssued: false,
    };
  } catch (error) {
    primaryError = error;
    const recoveryErrors = [];
    if (completionAttempted) {
      try {
        const resolution = await adapters.resolveAmbiguousIntake({
          tenantId: c.tenantId, courseId: c.courseId, operationId: c.operationId,
          packageSha256: c.packageSha256,
        });
        if (resolution?.verified !== true ||
            !['INTAKE_PRESENT', 'CANDIDATE_PRESENT', 'CLEAN'].includes(resolution.state)) {
          fail('AMBIGUOUS_INTAKE_STATE_UNRESOLVED');
        }
        intakeStarted = resolution.state === 'INTAKE_PRESENT';
        if (resolution.state === 'CANDIDATE_PRESENT') {
          if (!UUID.test(resolution.candidate?.packageId ?? '') ||
              resolution.candidate?.packageSha256 !== c.packageSha256 ||
              resolution.candidate?.createdByOperation !== true ||
              resolution.candidate?.alreadyExisted !== false) fail('AMBIGUOUS_CANDIDATE_OWNERSHIP_UNPROVEN');
          candidate = resolution.candidate;
        }
      } catch (recoveryError) { recoveryErrors.push(recoveryError); }
    }
    if (intakeStarted) {
      try { await adapters.abortIntake({ tenantId: c.tenantId, courseId: c.courseId, operationId: c.operationId }); }
      catch (recoveryError) { recoveryErrors.push(recoveryError); }
    }
    if (syntheticTouched) {
      try {
        const recovery = await adapters.recoverSyntheticCandidate({
          tenantId: c.tenantId, courseId: c.courseId, packageId: candidate?.packageId ?? c.operationId,
          enrollmentId: f.enrollmentId, cycleId: f.cycleId, runId: f.runId,
          recoveryReceiptSha256: f.recoveryReceiptSha256,
        });
        if (recovery?.verified !== true || recovery?.syntheticFixtureRecovered !== true ||
            !HEX64.test(recovery?.receiptSha256 ?? '')) {
          fail('RECOVERY_RECEIPT_INVALID');
        }
      } catch (recoveryError) { recoveryErrors.push(recoveryError); }
    }
    if (candidate?.createdByOperation === true && candidate?.alreadyExisted === false) {
      try {
        const cleanup = await adapters.removeFailedCandidate({
          tenantId: c.tenantId, courseId: c.courseId, packageId: candidate.packageId,
          packageSha256: c.packageSha256,
        });
        if (cleanup?.verified !== true || cleanup?.candidateRemoved !== true ||
            !HEX64.test(cleanup?.receiptSha256 ?? '')) {
          fail('FAILED_CANDIDATE_CLEANUP_RECEIPT_INVALID');
        }
      } catch (recoveryError) { recoveryErrors.push(recoveryError); }
    }
    if (recoveryErrors.length) {
      const wrapped = new Error('F5_EXECUTOR_RECOVERY_REQUIRED');
      wrapped.cause = new AggregateError([primaryError, ...recoveryErrors]);
      throw wrapped;
    }
    throw primaryError;
  }
}

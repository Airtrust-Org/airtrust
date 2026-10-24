#!/usr/bin/env node
/** Governed CLI binding private source and provisioned F0 callbacks to the core. */
import { createHash } from 'node:crypto';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { executeF5InactiveCandidate } from './f5-inactive-candidate-executor.mjs';
import { assertF5RunnerDispatchScope } from './f5-runner-dispatch-scope.mjs';
import { createF5WorkerAdapters, openF5PrivateZipSource } from './f5-worker-adapters.mjs';

const fail = code => { throw new Error(`F5_RUNNER_${code}`); };

/** Reserve the private evidence artifact before any Worker-side effects.
 * Exclusive creation prevents overwriting an existing audit artifact or
 * discovering a missing/unwritable output path after a successful intake.
 */
export async function reserveF5EvidenceOutput(outputPath) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) {
    fail('EVIDENCE_OUTPUT_PATH_REQUIRED');
  }
  try { return await open(outputPath, 'wx', 0o600); }
  catch { fail('EVIDENCE_OUTPUT_UNAVAILABLE'); }
}

/** Best-effort removal even if close itself rejects; never log private paths. */
export async function discardF5EvidenceOutput(evidenceHandle, outputPath) {
  await evidenceHandle.close().catch(() => {});
  await unlink(outputPath).catch(() => {});
}

export async function runF5InactiveCandidateFromEnvironment(env = process.env) {
  const planPath = env.F5_EXECUTOR_PLAN_PATH;
  const sourcePath = env.F5_PRIVATE_ZIP_PATH;
  const f0ModulePath = env.F5_F0_ADAPTER_MODULE;
  const f0ModuleSha256 = env.F5_F0_ADAPTER_SHA256;
  if (!planPath || !sourcePath || !f0ModulePath || !/^[a-f0-9]{64}$/.test(f0ModuleSha256 ?? '')) {
    fail('PRIVATE_PLAN_SOURCE_OR_PINNED_F0_ADAPTER_NOT_PROVISIONED');
  }
  let f0Bytes;
  try {
    const moduleStat = await stat(f0ModulePath);
    if (!moduleStat.isFile() || moduleStat.size > 2 * 1024 * 1024) fail('F0_ADAPTER_FILE_INVALID');
    f0Bytes = await readFile(f0ModulePath);
  } catch (error) {
    if (String(error?.message || error).startsWith('F5_RUNNER_')) throw error;
    fail('F0_ADAPTER_FILE_UNAVAILABLE');
  }
  const actualF0Sha = createHash('sha256').update(f0Bytes).digest('hex');
  if (actualF0Sha !== f0ModuleSha256) fail('F0_ADAPTER_SHA_MISMATCH');
  let plan;
  try {
    const planStat = await stat(planPath);
    if (!planStat.isFile() || planStat.size > 128 * 1024) fail('PLAN_FILE_INVALID');
    plan = JSON.parse(await readFile(planPath, 'utf8'));
  } catch (error) {
    if (String(error?.message || error).startsWith('F5_RUNNER_')) throw error;
    fail('PRIVATE_PLAN_UNAVAILABLE_OR_INVALID');
  }
  // Validate all workflow-dispatch IDs before importing any executable F0 module
  // or reading/uploading the private ZIP. The later GitHub grant check remains mandatory.
  assertF5RunnerDispatchScope(plan, env);
  const outputPath = env.F5_EVIDENCE_OUTPUT_PATH;
  const evidenceHandle = await reserveF5EvidenceOutput(outputPath);
  // Only publish a successful QA artifact after source teardown and evidence
  // close both succeed. A failed teardown must never leave a PASS-looking file.
  let evidenceComplete = false;
  try {
    let f0;
    try { f0 = await import(pathToFileURL(resolve(f0ModulePath)).href); }
    catch {
      // Imported adapter exceptions may contain protected runner paths or secrets.
      fail('F0_ADAPTER_LOAD_FAILED');
    }
    if (typeof f0.createF0Adapters !== 'function') fail('F0_ADAPTER_CONTRACT_MISSING');
    let source;
    try { source = await openF5PrivateZipSource(sourcePath); }
    catch { fail('PRIVATE_ZIP_SOURCE_UNAVAILABLE'); }
    let evidence;
    try {
      const f0Adapters = await f0.createF0Adapters({ plan, env });
      if (!f0Adapters || typeof f0Adapters !== 'object') fail('F0_ADAPTERS_MISSING');
      const adapters = createF5WorkerAdapters({ env, ...f0Adapters });
      evidence = await executeF5InactiveCandidate({ plan, source, adapters });
    } finally {
      // Closing the private source is part of successful teardown, not a
      // post-success best effort. Never publish evidence if teardown fails.
      await source.close();
    }
    try {
      await evidenceHandle.writeFile(`${JSON.stringify(evidence, null, 2)}\\n`);
      await evidenceHandle.sync();
      await evidenceHandle.close();
    } catch { fail('EVIDENCE_OUTPUT_FAILED'); }
    evidenceComplete = true;
    return evidence;
  } finally {
    if (!evidenceComplete) {
      // Closing can itself fail; still attempt removal of partial evidence.
      await discardF5EvidenceOutput(evidenceHandle, outputPath);
    }
  }
}

// Only these reviewed, fixed identifiers may appear in public Actions logs.
// Never stringify exceptions or print nested causes: they can carry tokens,
// learner state, request bodies, or runner-local private file paths.
const PUBLIC_RUNNER_FAILURE_CODES = new Set([
  'F5_RUNNER_PRIVATE_PLAN_SOURCE_OR_PINNED_F0_ADAPTER_NOT_PROVISIONED',
  'F5_RUNNER_F0_ADAPTER_FILE_UNAVAILABLE',
  'F5_RUNNER_F0_ADAPTER_SHA_MISMATCH',
  'F5_RUNNER_PLAN_FILE_INVALID',
  'F5_RUNNER_PRIVATE_PLAN_UNAVAILABLE_OR_INVALID',
  'F5_RUNNER_F0_ADAPTER_LOAD_FAILED',
  'F5_RUNNER_PRIVATE_ZIP_SOURCE_UNAVAILABLE',
  'F5_RUNNER_EVIDENCE_OUTPUT_FAILED',
  'F5_RUNNER_EVIDENCE_OUTPUT_PATH_REQUIRED',
  'F5_RUNNER_EVIDENCE_OUTPUT_UNAVAILABLE',
  'F5_EXECUTOR_F0_AUTHORIZATION_NOT_VERIFIED',
  'F5_EXECUTOR_STAGING_RUNTIME_SHA_MISMATCH',
  'F5_EXECUTOR_F0_RECEIPTS_NOT_VERIFIED',
  'F5_EXECUTOR_D1_EXECUTION_EVIDENCE_NOT_PERSISTED',
  'F5_EXECUTOR_SYNTHETIC_CLEANUP_RECEIPT_INVALID',
  // Recovery/compensation failure must remain visible without leaking nested causes.
  'F5_EXECUTOR_RECOVERY_REQUIRED',
  'F5_F0_ADAPTER_WORKER_COMMIT_HTTP_FAILED',
  'F5_F0_ADAPTER_WORKER_FINISH_COMMIT_HTTP_FAILED',
  'F5_F0_ADAPTER_SCORM_RESUME_STATE_MISMATCH',
  'F5_F0_ADAPTER_AUTHORED_STATE_NOT_OBSERVED',
  'F5_F0_ADAPTER_SCORM_INCOMPLETE_READBACK_MISMATCH',
  'F5_F0_ADAPTER_COMMIT_RECEIPT_INVALID',
  'F5_F0_ADAPTER_COMMIT_READBACK_SESSION_MISMATCH',
  'F5_F0_ADAPTER_BROWSER_PAIR_READBACK_REGRESSION',
  'F5_F0_ADAPTER_D1_READBACK_SCOPE_OR_STATE_INVALID',
  'F5_F0_ADAPTER_BROWSER_PAIR_SCOPE_MISMATCH',
]);

export function safeF5RunnerErrorCode(error) {
  try {
    const code = error?.message;
    if (PUBLIC_RUNNER_FAILURE_CODES.has(code)) return code;
    // Numeric status only: never echo untrusted Worker response bodies.
    if (typeof code === 'string' &&
        /^F5_WORKER_ADAPTER_WORKER_HTTP_[1-5][0-9]{2}$/.test(code)) return code;
  } catch {
    // Untrusted Error getters must not break fail-closed logging.
  }
  return 'F5_RUNNER_OPERATION_FAILED';
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const evidence = await runF5InactiveCandidateFromEnvironment();
    process.stdout.write(`${JSON.stringify({ status: evidence.status,
      packageSha256: evidence.candidate.packageSha256, active: evidence.candidate.active })}\n`);
  } catch (error) {
    process.stderr.write(`${safeF5RunnerErrorCode(error)}\n`);
    process.exitCode = 2;
  }
}

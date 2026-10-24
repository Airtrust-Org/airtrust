#!/usr/bin/env node
/** Publish only whitelisted, non-PII evidence from the governed F5 executor. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/i;
const positive = value => Number.isSafeInteger(value) && value > 0;
const fail = () => { throw Error('F5_SANITIZED_EVIDENCE_INVALID'); };

export function sanitizeF5Evidence(evidence, env, rawSha256) {
  const c = evidence?.candidate;
  const r2 = evidence?.r2Readback;
  const execution = evidence?.execution;
  const zipBytes = Number(env?.F5_ZIP_BYTES);
  if (env?.GITHUB_REPOSITORY !== 'Airtrust-Org/airtrust' ||
      env?.GITHUB_REF !== 'refs/heads/main' || env?.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !HEX40.test(env?.GITHUB_SHA ?? '') || !HEX40.test(env?.F5_RELEASE_SHA ?? '') ||
      !/^\d{1,18}$/.test(env?.GITHUB_RUN_ID ?? '') ||
      !HEX64.test(env?.F5_PACKAGE_SHA256 ?? '') || !positive(zipBytes) ||
      !UUID.test(env?.F5_OPERATION_ID ?? '') || !HEX64.test(rawSha256 ?? '') ||
      evidence?.source !== 'F5_INACTIVE_CANDIDATE_EXECUTOR_V1' ||
      evidence?.status !== 'INACTIVE_CANDIDATE_VERIFIED' ||
      evidence?.runtimeSha !== env.F5_RELEASE_SHA ||
      evidence?.operationId !== env.F5_OPERATION_ID ||
      c?.packageSha256 !== env.F5_PACKAGE_SHA256 || c?.status !== 'VALIDATED' ||
      c?.active !== false || !positive(c?.tenantId) || !positive(c?.courseId) ||
      !UUID.test(c?.packageId ?? '') ||
      r2?.source !== 'WORKER_R2_STREAMED_ZIP_READBACK' ||
      r2?.zipSha256 !== env.F5_PACKAGE_SHA256 || r2?.zipBytes !== zipBytes ||
      !HEX64.test(r2?.launchAssetSha256 ?? '') ||
      !HEX64.test(evidence?.r2CandidateAssetSha256 ?? '') ||
      r2.launchAssetSha256 !== evidence.r2CandidateAssetSha256 ||
      evidence?.d1ReadbackSource !== 'WORKER_D1_CANDIDATE_READBACK' ||
      execution?.servedPackageSha256 !== env.F5_PACKAGE_SHA256 ||
      execution?.committedPackageSha256 !== env.F5_PACKAGE_SHA256 ||
      !HEX64.test(execution?.cmiSha256 ?? '') ||
      !HEX64.test(execution?.suspendSha256 ?? '') ||
      !Array.isArray(execution?.browserEngines) ||
      execution.browserEngines.length !== 2 ||
      execution.browserEngines[0] !== 'chromium' ||
      execution.browserEngines[1] !== 'webkit' ||
      !positive(execution?.sessionCount) ||
      !HEX64.test(evidence?.cleanupReceiptSha256 ?? '') ||
      evidence?.activationAuthorized !== false ||
      evidence?.assessmentApproved !== false ||
      evidence?.certificationIssued !== false ||
      evidence?.certificateIssued !== false) fail();
  // Deliberately omit enrollment, cycle, run, tenant/course IDs, raw CMI,
  // credentials and arbitrary F0 fields. Hash binds to the private source file
  // without publishing it or its potentially sensitive details.
  return {
    schema: 'AIRTRUST_F5_INACTIVE_CANDIDATE_SANITIZED_V1',
    workflowRunId: env.GITHUB_RUN_ID,
    harnessSha: env.GITHUB_SHA,
    releaseSha: env.F5_RELEASE_SHA,
    operationId: env.F5_OPERATION_ID,
    packageSha256: env.F5_PACKAGE_SHA256,
    zipBytes,
    status: 'INACTIVE_CANDIDATE_VERIFIED',
    candidateActive: false,
    workerD1Readback: 'PASS',
    workerR2Readback: 'PASS',
    syntheticProgressCommitted: true,
    browserEngines: ['chromium', 'webkit'],
    cleanupReceiptSha256: evidence.cleanupReceiptSha256,
    activationAuthorized: false,
    assessmentApproved: false,
    certificationIssued: false,
    certificateIssued: false,
    privateEvidenceSha256: rawSha256,
  };
}

export async function writeSanitizedF5Evidence(env = process.env) {
  const input = env.F5_EVIDENCE_OUTPUT_PATH;
  const output = env.F5_SANITIZED_EVIDENCE_PATH;
  if (!input || !output || resolve(input) === resolve(output)) fail();
  const raw = await readFile(input);
  if (raw.byteLength < 10 || raw.byteLength > 128 * 1024) fail();
  const hash = createHash('sha256').update(raw).digest('hex');
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); } catch { fail(); }
  const summary = sanitizeF5Evidence(parsed, env, hash);
  await writeFile(output, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  writeSanitizedF5Evidence().then(() => {
    process.stdout.write('F5_SANITIZED_EVIDENCE_WRITTEN\n');
  }).catch(() => {
    process.stderr.write('F5_SANITIZED_EVIDENCE_FAILED_CLOSED\n');
    process.exitCode = 2;
  });
}

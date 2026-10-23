#!/usr/bin/env node
/** Governed CLI binding private source and provisioned F0 callbacks to the core. */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { executeF5InactiveCandidate } from './f5-inactive-candidate-executor.mjs';
import { createF5WorkerAdapters, openF5PrivateZipSource } from './f5-worker-adapters.mjs';

const fail = code => { throw new Error(`F5_RUNNER_${code}`); };

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
  let f0;
  try { f0 = await import(pathToFileURL(resolve(f0ModulePath)).href); }
  catch { fail('F0_ADAPTER_LOAD_FAILED'); }
  if (typeof f0.createF0Adapters !== 'function') fail('F0_ADAPTER_CONTRACT_MISSING');
  let plan;
  try {
    const planStat = await stat(planPath);
    if (!planStat.isFile() || planStat.size > 128 * 1024) fail('PLAN_FILE_INVALID');
    plan = JSON.parse(await readFile(planPath, 'utf8'));
  } catch (error) {
    if (String(error?.message || error).startsWith('F5_RUNNER_')) throw error;
    fail('PRIVATE_PLAN_UNAVAILABLE_OR_INVALID');
  }
  let source;
  try { source = await openF5PrivateZipSource(sourcePath); }
  catch { fail('PRIVATE_ZIP_SOURCE_UNAVAILABLE'); }
  try {
    const f0Adapters = await f0.createF0Adapters({ plan, env });
    if (!f0Adapters || typeof f0Adapters !== 'object') fail('F0_ADAPTERS_MISSING');
    const adapters = createF5WorkerAdapters({ env, ...f0Adapters });
    const evidence = await executeF5InactiveCandidate({ plan, source, adapters });
    const output = env.F5_EVIDENCE_OUTPUT_PATH;
    if (!output) fail('EVIDENCE_OUTPUT_PATH_REQUIRED');
    try { await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); }
    catch { fail('EVIDENCE_OUTPUT_FAILED'); }
    return evidence;
  } finally {
    await source.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const evidence = await runF5InactiveCandidateFromEnvironment();
    process.stdout.write(`${JSON.stringify({ status: evidence.status,
      packageSha256: evidence.candidate.packageSha256, active: evidence.candidate.active })}\n`);
  } catch (error) {
    const message = String(error?.message || error);
    const safeCode = /^F5_[A-Z0-9_]{1,180}$/.test(message) ? message : 'F5_RUNNER_OPERATION_FAILED';
    process.stderr.write(`${safeCode}\n`);
    process.exitCode = 2;
  }
}

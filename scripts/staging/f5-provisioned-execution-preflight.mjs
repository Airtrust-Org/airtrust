#!/usr/bin/env node
/**
 * F5 F0 preflight is strictly read-only: reject an unprovisioned or
 * improperly scoped runner before materializing any private ZIP bytes.
 * Never print secret values, private paths, or executable module source.
 */
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertF5RunnerDispatchScope } from './f5-runner-dispatch-scope.mjs';

const hex64 = /^[0-9a-f]{64}$/;
const fail = code => { throw new Error('F5_F0_PREFLIGHT_' + code); };

export async function verifyF5ProvisionedExecution(env, read = { lstat, readFile }) {
  if (env?.GITHUB_REPOSITORY !== 'Airtrust-Org/airtrust' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.F5_CONFIRMATION !== 'AIRTRUST_F5_STAGING_CANDIDATE') {
    fail('TRUSTED_STAGING_DISPATCH_REQUIRED');
  }
  if (!env.F5_EXECUTOR_PLAN_PATH || !env.F5_F0_ADAPTER_MODULE ||
      !hex64.test(env.F5_F0_ADAPTER_SHA256 ?? '') ||
      !env.SCORM_QA_ACCESS_TOKEN || env.SCORM_QA_ACCESS_TOKEN.length <= 40 ||
      !env.SCORM_QA_READBACK_SECRET || env.SCORM_QA_READBACK_SECRET.length < 32) {
    fail('REQUIRED_F0_PLAN_ADAPTER_OR_QA_CREDENTIALS_MISSING');
  }
  // A workflow input must never redirect a protected plan/module path to a
  // production, a repo file, or a symlink; runner-owned private mount only.
  const runnerTemp = resolve(env.RUNNER_TEMP || '/');
  if (runnerTemp === '/' || !resolve(env.F5_EXECUTOR_PLAN_PATH).startsWith(runnerTemp + '/') ||
      !resolve(env.F5_F0_ADAPTER_MODULE).startsWith(runnerTemp + '/')) {
    fail('PRIVATE_RUNNER_SCOPE_REQUIRED');
  }
  async function file(path, maxBytes) {
    let stat;
    try { stat = await read.lstat(path); }
    catch { fail('PROVISIONED_FILE_NOT_FOUND'); }
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes ||
        (stat.mode & 0o077) !== 0) fail('PROVISIONED_FILE_UNTRUSTED');
    try { return await read.readFile(path); }
    catch { fail('PROVISIONED_FILE_NOT_FOUND'); }
  }
  const moduleBytes = await file(env.F5_F0_ADAPTER_MODULE, 2 * 1024 * 1024);
  const digest = createHash('sha256').update(moduleBytes).digest('hex');
  if (digest !== env.F5_F0_ADAPTER_SHA256) fail('F0_ADAPTER_SHA_MISMATCH');
  const planBytes = await file(env.F5_EXECUTOR_PLAN_PATH, 128 * 1024);
  let plan;
  try { plan = JSON.parse(planBytes.toString('utf8')); }
  catch { fail('PRIVATE_PLAN_INVALID'); }
  // Run the existing exact one-candidate plan/dispatch contract before
  // importing any executable adapter or touching source ZIP bytes.
  assertF5RunnerDispatchScope(plan, env);
  return { status: 'READY', scope: 'ONE_INACTIVE_CANDIDATE',
    releaseSha: plan.releaseSha, sourceSha256: plan.candidate.packageSha256,
    adapterSha256: digest, remoteWritesExecuted: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyF5ProvisionedExecution(process.env).then(receipt => {
    process.stdout.write(JSON.stringify(receipt) + '\n');
  }).catch(error => {
    const message = String(error?.message || '');
    process.stderr.write(/^F5_(?:F0_PREFLIGHT|RUNNER|EXECUTOR)_[A-Z0-9_]+$/.test(message)
      ? message + '\n' : 'F5_F0_PREFLIGHT_FAILED_CLOSED\n');
    process.exitCode = 2;
  });
}

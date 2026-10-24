#!/usr/bin/env node
/**
 * Build runner-local F5 plan and F0 executable module from protected staging
 * secrets. Never print either artifact, and never read ZIP/call Worker here.
 */
import { lstat, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = code => { throw Error('F5_RUNNER_MOUNT_' + code); };
const names = Object.freeze({
  plan: 'f5-executor-plan.json',
  adapter: 'f5-provisioned-f0-adapter.mjs',
});
const hex64 = /^[a-f0-9]{64}$/;

function decodeSecret(value, maxBytes) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail('PROTECTED_SOURCE_MISSING_OR_NOT_CANONICAL_BASE64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) {
    fail('PRIVATE_FILE_SIZE_OR_ENCODING_INVALID');
  }
  return bytes;
}

export async function materializeF5RunnerArtifacts(env) {
  const temp = String(env?.RUNNER_TEMP ?? '');
  if (!temp || resolve(temp) === '/' || !temp.startsWith('/')) {
    fail('RUNNER_TEMP_INVALID');
  }
  const dir = await lstat(temp).catch(() => fail('RUNNER_TEMP_NOT_FOUND'));
  if (!dir.isDirectory() || dir.isSymbolicLink()) fail('RUNNER_TEMP_UNTRUSTED');
  // Validate both sources before creating either file.
  const plan = decodeSecret(env.F5_EXECUTOR_PLAN_B64, 128 * 1024);
  const adapter = decodeSecret(env.F5_F0_ADAPTER_B64, 2 * 1024 * 1024);
  if (!hex64.test(env.F5_F0_ADAPTER_SHA256 ?? '') ||
      createHash('sha256').update(adapter).digest('hex') !== env.F5_F0_ADAPTER_SHA256) {
    fail('PINNED_ADAPTER_SHA_MISMATCH');
  }
  const paths = [join(temp, names.plan), join(temp, names.adapter)];
  const handles = [];
  try {
    for (const [index, bytes] of [plan, adapter].entries()) {
      // Exclusive create rejects existing files/symlinks. Owner only, no logs.
      const handle = await open(paths[index], 'wx', 0o600);
      handles.push(handle);
      await handle.writeFile(bytes);
      await handle.close();
    }
    return { status: 'MOUNTED', scope: 'STAGING_RUNNER_ONLY',
      files: paths.length, adapterSha256: env.F5_F0_ADAPTER_SHA256,
      remoteWritesExecuted: false };
  } catch (error) {
    for (const handle of handles) await handle.close().catch(() => {});
    for (const path of paths) await unlink(path).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  materializeF5RunnerArtifacts(process.env).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
  }).catch(error => {
    const message = String(error?.message ?? '');
    process.stderr.write(/^F5_RUNNER_MOUNT_[A-Z0-9_]+$/.test(message)
      ? message + '\n' : 'F5_RUNNER_MOUNT_FAILED_CLOSED\n');
    process.exitCode = 2;
  });
}

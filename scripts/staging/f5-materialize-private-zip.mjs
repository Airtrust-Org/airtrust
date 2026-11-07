#!/usr/bin/env node
/**
 * F5 first-candidate private-source transport from protected staging secrets.
 * Secrets contain two chunks of the exact original ZIP, not a build or a
 * substitute. No D1/R2 calls, no activation, no stdout of source bytes.
 *
 * The caller MUST be a trusted-main staging environment job. The file exists
 * only in the ephemeral runner and is removed by workflow cleanup.
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX64 = /^[a-f0-9]{64}$/;
const safeFail = code => { throw new Error('F5_PRIVATE_SOURCE_' + code); };

function strictDecode(input) {
  if (typeof input !== 'string' || input.length < 4 ||
      input.length > 48000 || input.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) safeFail('CHUNK_INVALID');
  const bytes = Buffer.from(input, 'base64');
  if (!bytes.length || bytes.toString('base64') !== input) safeFail('CHUNK_INVALID');
  return bytes;
}

export async function materializePrivateF5Zip(config, env = process.env) {
  if (config?.environment !== 'staging' ||
      config?.ref !== 'refs/heads/main' ||
      config?.confirmation !== 'AIRTRUST_F5_PRIVATE_SOURCE_READONLY' &&
      config?.confirmation !== 'AIRTRUST_F5_STAGING_CANDIDATE' ||
      !HEX64.test(config?.expectedSha256 ?? '') ||
      !Number.isSafeInteger(config?.expectedBytes) ||
      config.expectedBytes < 22 || config.expectedBytes > 80000 ||
      !config?.outputPath ||
      !config?.runnerTemp ||
      !resolve(config.outputPath).startsWith(resolve(config.runnerTemp) + '/')) {
    safeFail('SCOPE_INVALID');
  }
  const first = strictDecode(env.F5_PRIVATE_ZIP_1_B64);
  const second = strictDecode(env.F5_PRIVATE_ZIP_2_B64);
  if (first.length + second.length !== config.expectedBytes) safeFail('SIZE_MISMATCH');
  const actualSha256 = createHash('sha256').update(first).update(second).digest('hex');
  if (actualSha256 !== config.expectedSha256) safeFail('SHA_MISMATCH');

  const target = resolve(config.outputPath);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const file = await open(target, 'wx', 0o600);
  try {
    await file.writeFile(first);
    await file.writeFile(second);
    await file.sync();
  } catch {
    await file.close().catch(() => undefined);
    await unlink(target).catch(() => undefined);
    safeFail('FILE_WRITE_FAILED');
  }
  await file.close();
  await chmod(target, 0o600);
  return { source: 'PROTECTED_STAGING_EPHEMERAL_SOURCE_V1',
    sha256: actualSha256, bytes: config.expectedBytes,
    activationAuthorized: false, certificationAuthorized: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const e = process.env;
  try {
    const proof = await materializePrivateF5Zip({
      environment: e.F5_ENVIRONMENT,
      ref: e.GITHUB_REF,
      confirmation: e.F5_CONFIRMATION,
      expectedSha256: e.F5_PACKAGE_SHA256,
      expectedBytes: Number(e.F5_ZIP_BYTES),
      outputPath: e.F5_PRIVATE_ZIP_PATH,
      runnerTemp: e.RUNNER_TEMP,
    });
    // Provenance metadata only; never output ZIP bytes or secret parts.
    process.stdout.write(JSON.stringify(proof) + '\n');
  } catch (error) {
    const msg = String(error?.message ?? '');
    process.stderr.write(/^F5_PRIVATE_SOURCE_[A-Z_]+$/.test(msg) ?
      msg + '\n' : 'F5_PRIVATE_SOURCE_FAILED_CLOSED\n');
    process.exitCode = 2;
  }
}

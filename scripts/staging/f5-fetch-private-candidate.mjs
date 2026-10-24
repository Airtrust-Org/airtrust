#!/usr/bin/env node
/**
 * Transfer exactly one approved private F5 ZIP to the ephemeral staging runner.
 * The URL is a protected environment secret, never a workflow input or log.
 * This is a read-only source transfer; the separate F0 grant, plan and SHA
 * checks remain mandatory before any staging mutation.
 */
import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX64 = /^[a-f0-9]{64}$/;
const MAX_BYTES = 80 * 1024 * 1024;
const fail = code => { throw Error('F5_PRIVATE_FETCH_' + code); };

export async function fetchF5PrivateCandidate(config, { fetchImpl = fetch } = {}) {
  if (config?.environment !== 'staging' ||
      config?.ref !== 'refs/heads/main' ||
      config?.confirmation !== 'AIRTRUST_F5_STAGING_CANDIDATE' ||
      !HEX64.test(config?.expectedSha256 ?? '') ||
      !Number.isSafeInteger(config?.expectedBytes) ||
      config.expectedBytes < 22 || config.expectedBytes > MAX_BYTES ||
      typeof config?.outputPath !== 'string' ||
      typeof config?.runnerTemp !== 'string' ||
      resolve(config.runnerTemp) === '/' ||
      resolve(config.outputPath) !== resolve(config.runnerTemp, 'f5-private-candidate.zip')) {
    fail('SCOPE_INVALID');
  }
  const host = config.allowedHost;
  if (typeof host !== 'string' || host.length > 253 ||
      !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) ||
      isIP(host) !== 0 || host.endsWith('.local') || host.endsWith('.internal')) {
    fail('SOURCE_HOST_INVALID');
  }
  let url;
  try { url = new URL(config.sourceUrl); }
  catch { fail('SOURCE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== host ||
      url.port !== '' || url.username || url.password || url.hash ||
      !url.pathname || url.pathname === '/') {
    fail('SOURCE_URL_INVALID');
  }

  let response;
  try {
    response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(120_000),
    });
  } catch { fail('TRANSFER_FAILED'); }
  if (response.status !== 200 || !response.body ||
      ![null, 'identity'].includes(response.headers.get('content-encoding'))) {
    await response.body?.cancel().catch(() => {});
    fail('RESPONSE_INVALID');
  }
  const advertised = response.headers.get('content-length');
  if (advertised !== null &&
      (!/^(0|[1-9][0-9]*)$/.test(advertised) || Number(advertised) !== config.expectedBytes)) {
    await response.body.cancel().catch(() => {});
    fail('LENGTH_MISMATCH');
  }
  const target = resolve(config.outputPath);
  let file;
  try { file = await open(target, 'wx', 0o600); }
  catch {
    await response.body.cancel().catch(() => {});
    fail('DESTINATION_UNAVAILABLE');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  let complete = false;
  try {
    for await (const chunk of response.body) {
      if (!(chunk instanceof Uint8Array) || bytes + chunk.byteLength > config.expectedBytes) {
        fail('LENGTH_MISMATCH');
      }
      bytes += chunk.byteLength;
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset);
        if (bytesWritten < 1) fail('TRANSFER_FAILED');
        offset += bytesWritten;
      }
    }
    if (bytes !== config.expectedBytes) fail('LENGTH_MISMATCH');
    if (hash.digest('hex') !== config.expectedSha256) fail('SHA_MISMATCH');
    await file.sync();
    await file.close();
    complete = true;
    return { status: 'PRIVATE_SOURCE_VERIFIED', sha256: config.expectedSha256,
      bytes, active: false, remoteWritesExecuted: false };
  } catch (error) {
    if (String(error?.message ?? '').startsWith('F5_PRIVATE_FETCH_')) throw error;
    fail('TRANSFER_FAILED');
  } finally {
    if (!complete) {
      await file.close().catch(() => {});
      await unlink(target).catch(() => {});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const e = process.env;
  try {
    const receipt = await fetchF5PrivateCandidate({
      environment: e.F5_ENVIRONMENT, ref: e.GITHUB_REF,
      confirmation: e.F5_CONFIRMATION,
      expectedSha256: e.F5_PACKAGE_SHA256, expectedBytes: Number(e.F5_ZIP_BYTES),
      runnerTemp: e.RUNNER_TEMP, outputPath: e.F5_PRIVATE_ZIP_PATH,
      sourceUrl: e.F5_PRIVATE_ZIP_DOWNLOAD_URL,
      allowedHost: e.F5_PRIVATE_ZIP_ALLOWED_HOST,
    });
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } catch (error) {
    const code = String(error?.message ?? '');
    process.stderr.write(/^F5_PRIVATE_FETCH_[A-Z_]+$/.test(code)
      ? code + '\n' : 'F5_PRIVATE_FETCH_FAILED_CLOSED\n');
    process.exitCode = 2;
  }
}

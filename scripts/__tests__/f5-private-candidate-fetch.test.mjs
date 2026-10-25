import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, lstat, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchF5PrivateCandidate, verifyF5SignedSourceLease } from '../staging/f5-fetch-private-candidate.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const payload = Buffer.from('Synthetic, unclassified ZIP transport test bytes.');
const makeResponse = (body = payload, options = {}) => new Response(body, {
  status: options.status ?? 200,
  headers: options.headers ?? { 'content-length': String(body.byteLength) },
});
const signedStamp = when => new Date(when).toISOString()
  .replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const signedSourceUrl = (when = Date.now(), isGoogle = false) => {
  const stamp = signedStamp(when);
  const url = new URL('https://private.example.org/one-use');
  const prefix = isGoogle ? 'X-Goog-' : 'X-Amz-';
  const credential = 'fixture/' + stamp.slice(0, 8) +
    '/auto/' + (isGoogle ? 'storage/goog4_request' : 's3/aws4_request');
  for (const [name, value] of Object.entries({
    Algorithm: isGoogle ? 'GOOG4-HMAC-SHA256' : 'AWS4-HMAC-SHA256',
    Credential: credential, Date: stamp, Expires: '600',
    SignedHeaders: 'host', Signature: 'a'.repeat(64),
  })) url.searchParams.set(prefix + name, value);
  return url.href;
};
const base = temp => ({ environment: 'staging', ref: 'refs/heads/main',
  confirmation: 'AIRTRUST_F5_STAGING_CANDIDATE', expectedSha256: sha(payload),
  expectedBytes: payload.byteLength, runnerTemp: temp,
  outputPath: join(temp, 'f5-private-candidate.zip'),
  sourceUrl: signedSourceUrl(),
  allowedHost: 'private.example.org' });

async function fixture(fn) {
  const temp = await mkdtemp(join(tmpdir(), 'f5-fetch-'));
  try { await fn(base(temp)); } finally { await rm(temp, { recursive: true, force: true }); }
}

test('streams exact private bytes with read-only receipt and 0600 ephemeral file', async () => fixture(async c => {
  let called = 0;
  const receipt = await fetchF5PrivateCandidate(c, { fetchImpl: async (url, init) => {
    called++;
    assert.equal(url, c.sourceUrl);
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'GET');
    return makeResponse();
  } });
  assert.equal(called, 1);
  assert.deepEqual(receipt, { status: 'PRIVATE_SOURCE_VERIFIED', sha256: sha(payload),
    bytes: payload.length, active: false, remoteWritesExecuted: false });
  assert.deepEqual(await readFile(c.outputPath), payload);
  assert.equal((await lstat(c.outputPath)).mode & 0o077, 0);
}));

test('fails closed before network on bad source, scope or untrusted URL', async () => fixture(async c => {
  const mutations = [
    { environment: 'production' }, { ref: 'refs/heads/dev' },
    { confirmation: 'anything' }, { expectedSha256: 'a' },
    { expectedBytes: 81 * 1024 * 1024 }, { outputPath: join(c.runnerTemp, 'other.zip') },
    { allowedHost: 'localhost' }, { allowedHost: '127.0.0.1' },
    { allowedHost: 'private.example.org.internal' },
    { sourceUrl: 'http://private.example.org/one-use' },
    { sourceUrl: 'https://evil.example.org/one-use' },
    { sourceUrl: 'https://private.example.org:8443/one-use' },
    { sourceUrl: 'https://user:password@private.example.org/one-use' },
    { sourceUrl: 'https://private.example.org/one-use#fragment' },
  ];
  for (const change of mutations) {
    await assert.rejects(fetchF5PrivateCandidate({ ...c, ...change }, {
      fetchImpl: () => { throw Error('NETWORK_MUST_NOT_BE_USED'); },
    }), /F5_PRIVATE_FETCH_(SCOPE_INVALID|SOURCE_HOST_INVALID|SOURCE_URL_INVALID)/);
  }
}));

test('rejects unexpected HTTP, encoding, length, digest and truncated transfer without leaving ZIP', async () => fixture(async c => {
  const cases = [
    { response: makeResponse(payload, { status: 404 }), error: /RESPONSE_INVALID/ },
    { response: makeResponse(payload, { headers: { 'content-encoding': 'gzip' } }), error: /RESPONSE_INVALID/ },
    { response: makeResponse(payload, { headers: { 'content-length': '999' } }), error: /LENGTH_MISMATCH/ },
    { response: makeResponse(Buffer.from('other same length'.padEnd(payload.length, '.'))), error: /SHA_MISMATCH/ },
    { response: makeResponse(payload.subarray(0, payload.length - 1)), error: /LENGTH_MISMATCH/ },
    { response: makeResponse(Buffer.concat([payload, Buffer.from('extra')])), error: /LENGTH_MISMATCH/ },
  ];
  for (const item of cases) {
    await assert.rejects(fetchF5PrivateCandidate(c, {
      fetchImpl: async () => item.response,
    }), item.error);
    await assert.rejects(lstat(c.outputPath), { code: 'ENOENT' });
  }
}));

test('rejects redirects and network failures without writing candidate', async () => fixture(async c => {
  for (const failure of [new Error('signed URL expired'), new TypeError('redirect blocked')]) {
    await assert.rejects(fetchF5PrivateCandidate(c, {
      fetchImpl: async () => { throw failure; },
    }), /F5_PRIVATE_FETCH_TRANSFER_FAILED/);
    await assert.rejects(lstat(c.outputPath), { code: 'ENOENT' });
  }
}));

test('exclusive create refuses preexisting file and symlink, preserving unrelated bytes', async () => fixture(async c => {
  const other = join(c.runnerTemp, 'unrelated.txt');
  await writeFile(other, 'untouched');
  await symlink(other, c.outputPath);
  await assert.rejects(fetchF5PrivateCandidate(c, {
    fetchImpl: async () => makeResponse(),
  }), /F5_PRIVATE_FETCH_DESTINATION_UNAVAILABLE/);
  assert.equal(await readFile(other, 'utf8'), 'untouched');
  assert.equal((await lstat(c.outputPath)).isSymbolicLink(), true);
}));

test('accepts only bounded signed S3/R2 or GCS lease metadata (not a one-use claim)', async () => fixture(async c => {
  assert.ok(Date.parse(verifyF5SignedSourceLease(new URL(c.sourceUrl)).expiresAt) > Date.now());
  assert.ok(Date.parse(verifyF5SignedSourceLease(new URL(signedSourceUrl(Date.now(), true))).expiresAt) > Date.now());
  const rejected = [
    'https://private.example.org/one-use',
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-Expires', '3600'); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-Signature', 'x'); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-SignedHeaders', 'accept'); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-Date', '20200101T000000Z'); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-Date', signedStamp(Date.now() + 120_000)); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.append('X-Amz-Signature', 'a'.repeat(64)); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Goog-Algorithm', 'GOOG4-HMAC-SHA256'); return u.href; })(),
    (() => { const u = new URL(c.sourceUrl); u.searchParams.set('X-Amz-Credential', 'other/20200101/auto/s3/aws4_request'); return u.href; })(),
  ];
  for (const sourceUrl of rejected) {
    let networkCalls = 0;
    await assert.rejects(fetchF5PrivateCandidate({ ...c, sourceUrl }, {
      fetchImpl: async () => { networkCalls++; return makeResponse(); },
    }), /F5_PRIVATE_FETCH_SOURCE_(LEASE_INVALID|SIGNED_LEASE_REQUIRED|LEASE_EXPIRED_OR_TOO_SHORT)/);
    assert.equal(networkCalls, 0, 'No network call permitted with invalid private lease');
    await assert.rejects(lstat(c.outputPath), { code: 'ENOENT' });
  }
  // The signed metadata must still be valid when the download starts.
  let calls = 0;
  await assert.rejects(fetchF5PrivateCandidate(c, {
    now: Date.now() + 700_000,
    fetchImpl: async () => { calls++; return makeResponse(); },
  }), /F5_PRIVATE_FETCH_SOURCE_LEASE_EXPIRED_OR_TOO_SHORT/);
  assert.equal(calls, 0);
}));

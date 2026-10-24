import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, lstat, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchF5PrivateCandidate } from '../staging/f5-fetch-private-candidate.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const payload = Buffer.from('Synthetic, unclassified ZIP transport test bytes.');
const makeResponse = (body = payload, options = {}) => new Response(body, {
  status: options.status ?? 200,
  headers: options.headers ?? { 'content-length': String(body.byteLength) },
});
const base = temp => ({ environment: 'staging', ref: 'refs/heads/main',
  confirmation: 'AIRTRUST_F5_STAGING_CANDIDATE', expectedSha256: sha(payload),
  expectedBytes: payload.byteLength, runnerTemp: temp,
  outputPath: join(temp, 'f5-private-candidate.zip'),
  sourceUrl: 'https://private.example.org/one-use?signature=not-for-logs',
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

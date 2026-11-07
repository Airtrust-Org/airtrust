import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { materializePrivateF5Zip } from '../staging/f5-materialize-private-zip.mjs';

const fixture = () => {
  const bytes = randomBytes(40644);
  const digest = createHash('sha256').update(bytes).digest('hex');
  return { bytes, digest, secrets: {
    F5_PRIVATE_ZIP_1_B64: bytes.subarray(0, 20322).toString('base64'),
    F5_PRIVATE_ZIP_2_B64: bytes.subarray(20322).toString('base64'),
  } };
};
const makeConfig = (dir, digest) => ({
  environment: 'staging', ref: 'refs/heads/main',
  confirmation: 'AIRTRUST_F5_PRIVATE_SOURCE_READONLY',
  expectedSha256: digest, expectedBytes: 40644, runnerTemp: dir,
  outputPath: join(dir, 'private', 'candidate.zip'),
});

test('materializes only exact-SHA private candidate in an ephemeral 0600 file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'airtrust-private-'));
  const f = fixture(), c = makeConfig(dir, f.digest);
  const receipt = await materializePrivateF5Zip(c, f.secrets);
  assert.deepEqual(await readFile(c.outputPath), f.bytes);
  assert.equal((await stat(c.outputPath)).mode & 0o777, 0o600);
  assert.equal(receipt.sha256, f.digest);
  assert.equal(receipt.bytes, 40644);
  assert.equal(receipt.activationAuthorized, false);
  assert.equal(receipt.certificationAuthorized, false);
  await assert.rejects(materializePrivateF5Zip(c, f.secrets), /EEXIST/,
    'a repeat execution must never overwrite the prior source');
});

test('rejects forged ZIP, truncated chunks, malformed base64 and missing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'airtrust-private-'));
  const f = fixture(), c = makeConfig(dir, f.digest);
  await assert.rejects(materializePrivateF5Zip(c, {
    ...f.secrets, F5_PRIVATE_ZIP_1_B64: randomBytes(20322).toString('base64'),
  }), /SHA_MISMATCH/);
  await assert.rejects(materializePrivateF5Zip(c, {
    ...f.secrets, F5_PRIVATE_ZIP_2_B64: f.secrets.F5_PRIVATE_ZIP_2_B64.slice(4),
  }), /SIZE_MISMATCH/);
  await assert.rejects(materializePrivateF5Zip(c, {
    ...f.secrets, F5_PRIVATE_ZIP_1_B64: 'not-base64-data',
  }), /CHUNK_INVALID/);
  await assert.rejects(materializePrivateF5Zip(c, {}), /CHUNK_INVALID/);
});

test('fails closed outside trusted staging main and refuses path escaping runner temp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'airtrust-private-'));
  const f = fixture(), c = makeConfig(dir, f.digest);
  for (const patch of [
    { environment: 'production' }, { ref: 'refs/heads/develop' },
    { confirmation: 'APPROVE_ALL' },
    { outputPath: join(dir, '..', 'candidate.zip') },
    { expectedSha256: '0'.repeat(64), expectedBytes: 0 },
  ]) {
    await assert.rejects(materializePrivateF5Zip({ ...c, ...patch }, f.secrets),
      /SCOPE_INVALID/);
  }
});

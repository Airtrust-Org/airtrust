import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildReleaseManifest } from '../lib/build-release-manifest.mjs';

// Synthetic, credential-free fixtures. The real deploy path can only run its
// dry-run validation in CI with Cloudflare secrets configured; these tests
// exercise the pure manifest/hash logic that both paths depend on.
const HEX40 = '0123456789abcdef0123456789abcdef01234567';
const TREE40 = 'fedcba9876543210fedcba9876543210fedcba98';
const HEX64 = 'a'.repeat(64);
const CONFIG64 = 'b'.repeat(64);

const base = () => ({
  repository: 'Airtrust-Org/airtrust',
  environment: 'production',
  appVersion: `2026-07-18T00:00:00Z-${HEX40.slice(0, 7)}`,
  sourceSha: HEX40,
  sourceTree: TREE40,
  workerBundleSha256: HEX64,
  wranglerConfigPreManifestSha256: CONFIG64,
  nodeVersion: 'v24.0.0',
  npmVersion: '10.0.0',
  wranglerVersion: '4.93.0',
  buildTimeUtc: '2026-07-18T00:00:00Z',
  dirty: false,
});

test('manifestSha256 hashes the exact manifest string that is returned', () => {
  const { manifest, manifestSha256 } = buildReleaseManifest(base());
  const recomputed = createHash('sha256').update(manifest).digest('hex');
  assert.equal(recomputed, manifestSha256);
});

test('serialization is deterministic regardless of input key order', () => {
  const a = buildReleaseManifest(base());
  const shuffled = Object.fromEntries(Object.entries(base()).reverse());
  const b = buildReleaseManifest(shuffled);
  assert.equal(a.manifest, b.manifest);
  assert.equal(a.manifestSha256, b.manifestSha256);
});

test('manifest string ends with a trailing newline and is 2-space indented', () => {
  const { manifest } = buildReleaseManifest(base());
  assert.ok(manifest.endsWith('}\n'));
  assert.match(manifest, /\n  "sourceSha":/);
});

test('workerVersionId defaults to null when absent (pre-deploy manifest)', () => {
  const { manifestObject } = buildReleaseManifest(base());
  assert.equal(manifestObject.workerVersionId, null);
});

test('workerVersionId is preserved when a real deploy supplies one', () => {
  const { manifestObject } = buildReleaseManifest({ ...base(), workerVersionId: 'abcd-1234-ef' });
  assert.equal(manifestObject.workerVersionId, 'abcd-1234-ef');
});

test('workerVersionId accepts an explicit null', () => {
  const { manifestObject } = buildReleaseManifest({ ...base(), workerVersionId: null });
  assert.equal(manifestObject.workerVersionId, null);
});

test('rejects the retired dry-run sentinel and other placeholder strings as workerVersionId', () => {
  for (const bad of ['unavailable-in-dry-run', 'unavailable', 'unknown', 'n/a', 'none', 'UNAVAILABLE-IN-DRY-RUN']) {
    assert.throws(
      () => buildReleaseManifest({ ...base(), workerVersionId: bad }),
      /refusing placeholder/,
    );
  }
});

test('serialized manifest contains a literal null workerVersionId, not a placeholder string', () => {
  const { manifest } = buildReleaseManifest(base());
  assert.match(manifest, /\n {2}"workerVersionId": null[,\n]/);
  assert.doesNotMatch(manifest, /unavailable-in-dry-run/);
});

test('rejects a floating APP_VERSION (must be SHA-derived)', () => {
  for (const bad of ['latest', 'main', 'dev-local', 'managed-by-script']) {
    assert.throws(() => buildReleaseManifest({ ...base(), appVersion: bad }), /SHA-derived|floating/i);
  }
});

test('rejects an APP_VERSION that does not embed the source short sha', () => {
  assert.throws(
    () => buildReleaseManifest({ ...base(), appVersion: '2026-07-18T00:00:00Z-deadbee' }),
    /does not embed source short sha/,
  );
});

test('rejects a non-hex source sha / tree', () => {
  assert.throws(() => buildReleaseManifest({ ...base(), sourceSha: 'not-a-sha' }), /40-hex/);
  assert.throws(() => buildReleaseManifest({ ...base(), sourceTree: 'nope' }), /40-hex/);
});

test('rejects a bundle / config hash that is not 64-hex', () => {
  assert.throws(() => buildReleaseManifest({ ...base(), workerBundleSha256: 'short' }), /64-hex/);
  assert.throws(() => buildReleaseManifest({ ...base(), wranglerConfigPreManifestSha256: 'short' }), /64-hex/);
});

test('rejects an unsupported environment', () => {
  assert.throws(() => buildReleaseManifest({ ...base(), environment: 'development' }), /unsupported environment/);
});

test('rejects missing required fields', () => {
  const { repository, ...withoutRepo } = base();
  assert.throws(() => buildReleaseManifest(withoutRepo), /repository/);
});

test('schema tag is stamped', () => {
  const { manifestObject } = buildReleaseManifest(base());
  assert.equal(manifestObject.schema, 'airtrust.release-manifest/v1');
});
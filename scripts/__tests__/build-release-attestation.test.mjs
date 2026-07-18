import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  buildReleaseAttestation,
  outcomeFlags,
} from '../lib/build-release-attestation.mjs';

const HEX40_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const HEX40_TREE = 'fedcba9876543210fedcba9876543210fedcba98';
const HEX64 = 'a'.repeat(64);
const FINAL64 = 'b'.repeat(64);
const MANIFEST64 = 'c'.repeat(64);

const base = (overrides = {}) => ({
  repository: 'airtrustsystem-alt/airtrust',
  environment: 'production',
  appVersion: `2026-07-18T00:00:00Z-${HEX40_COMMIT.slice(0, 7)}`,
  sourceSha: HEX40_COMMIT,
  sourceTree: HEX40_TREE,
  workerBundleSha256: HEX64,
  wranglerConfigFinalSha256: FINAL64,
  releaseManifestSha256: MANIFEST64,
  workerVersionId: null,
  deployAttempted: true,
  deploySucceeded: true,
  bundleComparisonExecuted: true,
  bundleComparisonPassed: true,
  smokeExecuted: true,
  smokePassed: true,
  timestampUtc: '2026-07-18T12:00:00.000Z',
  ...overrides,
});

test('outcomeFlags maps GitHub Actions step outcomes without hardcoding true', () => {
  assert.deepEqual(outcomeFlags('success'), { executed: true, passed: true });
  assert.deepEqual(outcomeFlags('failure'), { executed: true, passed: false });
  assert.deepEqual(outcomeFlags('cancelled'), { executed: true, passed: false });
  assert.deepEqual(outcomeFlags('skipped'), { executed: false, passed: false });
  assert.deepEqual(outcomeFlags(''), { executed: false, passed: false });
  assert.deepEqual(outcomeFlags(undefined), { executed: false, passed: false });
});

test('attestationSha256 hashes the exact attestation string', () => {
  const { attestation, attestationSha256 } = buildReleaseAttestation(base());
  assert.equal(createHash('sha256').update(attestation).digest('hex'), attestationSha256);
});

test('sourceTree must differ from sourceSha (guards commit-as-tree bug)', () => {
  assert.throws(
    () => buildReleaseAttestation(base({ sourceTree: HEX40_COMMIT, sourceSha: HEX40_COMMIT })),
    /sourceSha === sourceTree/,
  );
});

test('fixture with distinct commit and tree keeps sourceTree as the tree object', () => {
  const { attestationObject } = buildReleaseAttestation(base());
  assert.equal(attestationObject.sourceSha, HEX40_COMMIT);
  assert.equal(attestationObject.sourceTree, HEX40_TREE);
  assert.notEqual(attestationObject.sourceTree, attestationObject.sourceSha);
});

test('simulated smoke failure records smokePassed=false without masking deploy success', () => {
  const { attestationObject } = buildReleaseAttestation(
    base({
      smokeExecuted: true,
      smokePassed: false,
      workerVersionId: 'wv-real-123',
    }),
  );
  assert.equal(attestationObject.deployAttempted, true);
  assert.equal(attestationObject.deploySucceeded, true);
  assert.equal(attestationObject.bundleComparisonPassed, true);
  assert.equal(attestationObject.smokeExecuted, true);
  assert.equal(attestationObject.smokePassed, false);
  assert.equal(attestationObject.workerVersionId, 'wv-real-123');
  assert.equal(attestationObject.classification, 'pipeline-attested');
});

test('pre-deploy / dry-run style attestation keeps workerVersionId null', () => {
  const { attestationObject, attestation } = buildReleaseAttestation(
    base({
      workerVersionId: null,
      deployAttempted: false,
      deploySucceeded: false,
      bundleComparisonExecuted: false,
      bundleComparisonPassed: false,
      smokeExecuted: false,
      smokePassed: false,
    }),
  );
  assert.equal(attestationObject.workerVersionId, null);
  assert.match(attestation, /\n {2}"workerVersionId": null[,\n]/);
  assert.doesNotMatch(attestation, /unavailable-in-dry-run/);
});

test('rejects placeholder workerVersionId strings', () => {
  assert.throws(
    () => buildReleaseAttestation(base({ workerVersionId: 'unavailable-in-dry-run' })),
    /refusing placeholder/,
  );
});

test('rejects smokePassed=true when smoke was not executed', () => {
  assert.throws(
    () => buildReleaseAttestation(base({ smokeExecuted: false, smokePassed: true })),
    /smokePassed=true requires smokeExecuted=true/,
  );
});

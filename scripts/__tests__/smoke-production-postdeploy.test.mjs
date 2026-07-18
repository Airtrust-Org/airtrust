// source_reference: unit tests for the hardened production post-deploy smoke evaluator.
// operational_decision: pure evaluator only — no network, no deploy, no remote reads/writes.
// dry_run_required: every assertion runs against local fixtures.
// rollback_plan_required: no rollback needed; this file is read-only test code.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateProductionSmoke,
  isEdgePropagationOnly,
  MAINTENANCE_PROBE_PATH,
  PROTECTED_PROBE_PATH,
  LEGACY_LOCALHOST_PHRASE,
} from '../smoke-production-postdeploy.mjs';

const EXPECTED_VERSION = '2026-07-18T12:00:00Z-abcdef1';
const EXPECTED_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const WORKER_VERSION_ID = 'a1b2c3d4-0000-4444-8888-1234567890ab';
const BUNDLE_HASH = 'sha256:'.padEnd(71, 'b');
const MANIFEST_HASH = 'sha256:'.padEnd(71, 'c');

/**
 * Builds a fully-passing response set. Each negative test deep-clones and then
 * mutates exactly one facet, proving the evaluator flips to failure for that
 * facet alone.
 */
function makeHappyResponses() {
  const headers = {
    'X-AirTrust-Environment': 'production',
    'X-AirTrust-App-Version': EXPECTED_VERSION,
    'X-AirTrust-Worker-Version': WORKER_VERSION_ID,
    'X-AirTrust-Source-SHA': EXPECTED_SHA,
    'X-AirTrust-Worker-Bundle-SHA256': BUNDLE_HASH,
    'X-AirTrust-Release-Manifest-SHA256': MANIFEST_HASH,
  };
  const stats = {
    environment: 'production',
    version: EXPECTED_VERSION,
    workerVersionId: WORKER_VERSION_ID,
    sourceSha: EXPECTED_SHA,
    workerBundleSha256: BUNDLE_HASH,
    releaseManifestSha256: MANIFEST_HASH,
  };
  return {
    health: {
      status: 200,
      headers: { ...headers },
      json: { success: true, status: 'healthy', stats: { ...stats } },
      bodyText: JSON.stringify({ success: true, stats }),
    },
    version: {
      status: 200,
      headers: { ...headers },
      json: {
        success: true,
        data: {
          version: EXPECTED_VERSION,
          environment: 'production',
          workerVersionId: WORKER_VERSION_ID,
          sourceSha: EXPECTED_SHA,
          workerBundleSha256: BUNDLE_HASH,
          releaseManifestSha256: MANIFEST_HASH,
        },
      },
      bodyText: JSON.stringify({ success: true, data: { version: EXPECTED_VERSION } }),
    },
    protected: {
      status: 401,
      headers: {},
      json: { success: false, error: 'unauthorized' },
      bodyText: JSON.stringify({ success: false, error: 'unauthorized' }),
    },
    maintenance: {
      status: 404,
      headers: {},
      json: null,
      bodyText: 'Not Found',
    },
  };
}

function evaluate(responses) {
  return evaluateProductionSmoke({
    expectedVersion: EXPECTED_VERSION,
    expectedSha: EXPECTED_SHA,
    responses,
  });
}

function failureCodes(result) {
  return result.failures.map((f) => f.slice(1, f.indexOf(']')));
}

// ---------------------------------------------------------------------------
// Positive baseline
// ---------------------------------------------------------------------------

test('passes when every hardened invariant holds', () => {
  const result = evaluate(makeHappyResponses());
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.deepEqual(result.failures, []);
});

// ---------------------------------------------------------------------------
// Required negative scenarios (per task spec)
// ---------------------------------------------------------------------------

test('fails when workerVersionId is empty', () => {
  const responses = makeHappyResponses();
  responses.health.json.stats.workerVersionId = '';
  responses.version.json.data.workerVersionId = '';
  responses.health.headers['X-AirTrust-Worker-Version'] = '';
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('worker-version-id'));
});

test('fails when APP_VERSION diverges from the expected release version', () => {
  const responses = makeHappyResponses();
  const stale = '2026-07-01T00:00:00Z-0000000';
  responses.health.json.stats.version = stale;
  responses.version.json.data.version = stale;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('version-mismatch'));
});

test('fails when source SHA header diverges from the expected SHA', () => {
  const responses = makeHappyResponses();
  responses.health.headers['X-AirTrust-Source-SHA'] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('source-sha-mismatch'));
});

test('fails when bundle hash is absent from the response', () => {
  const responses = makeHappyResponses();
  delete responses.health.json.stats.workerBundleSha256;
  delete responses.version.json.data.workerBundleSha256;
  delete responses.health.headers['X-AirTrust-Worker-Bundle-SHA256'];
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('bundle-hash'));
});

for (const placeholder of ['latest', 'main', 'dev-local']) {
  test(`fails when the reported version is literally "${placeholder}"`, () => {
    const responses = makeHappyResponses();
    responses.health.json.stats.version = placeholder;
    responses.version.json.data.version = placeholder;
    const result = evaluate(responses);
    assert.equal(result.ok, false);
    const codes = failureCodes(result);
    assert.ok(codes.includes('version-placeholder'));
  });
}

test('fails when the maintenance route answers 403 instead of 404', () => {
  const responses = makeHappyResponses();
  responses.maintenance.status = 403;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const maintenanceFailure = result.failures.find((f) => f.startsWith('[maintenance-404]'));
  assert.ok(maintenanceFailure, 'expected a maintenance-404 failure');
  // The 403-specific hint must explain WHY 403 is worse than absence.
  assert.match(maintenanceFailure, /leaks that the maintenance route exists/);
  assert.match(maintenanceFailure, new RegExp(MAINTENANCE_PROBE_PATH));
});

test('fails when the Cloudflare version_metadata binding is absent (no id, no header)', () => {
  // Simulates the binding being missing/unconfigured: getWorkerVersionMetadata
  // returns id=null, so both stats.workerVersionId and the header disappear.
  const responses = makeHappyResponses();
  responses.health.json.stats.workerVersionId = null;
  responses.version.json.data.workerVersionId = null;
  delete responses.health.headers['X-AirTrust-Worker-Version'];
  responses.version.headers = {};
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const codes = failureCodes(result);
  // Must detect the missing binding via BOTH the id check and the header check —
  // not silently report success.
  assert.ok(codes.includes('worker-version-id'), 'missing binding must fail worker-version-id');
  assert.ok(codes.includes('worker-version-header'), 'missing binding must fail worker-version-header');
});

// ---------------------------------------------------------------------------
// Additional invariant coverage
// ---------------------------------------------------------------------------

test('fails when /api/health does not return 200', () => {
  const responses = makeHappyResponses();
  responses.health.status = 503;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('health-200'));
});

test('fails when the environment is staging rather than production', () => {
  const responses = makeHappyResponses();
  responses.health.json.stats.environment = 'staging';
  responses.health.headers['X-AirTrust-Environment'] = 'staging';
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('environment'));
});

test('fails when the protected route returns 200 instead of 401', () => {
  const responses = makeHappyResponses();
  responses.protected.status = 200;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const failure = result.failures.find((f) => f.startsWith('[protected-401]'));
  assert.ok(failure);
  assert.match(failure, new RegExp(PROTECTED_PROBE_PATH));
});

test('fails when the protected route returns 403 instead of 401', () => {
  const responses = makeHappyResponses();
  responses.protected.status = 403;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('protected-401'));
});

test('fails when the manifest hash is absent', () => {
  const responses = makeHappyResponses();
  delete responses.health.json.stats.releaseManifestSha256;
  delete responses.version.json.data.releaseManifestSha256;
  delete responses.health.headers['X-AirTrust-Release-Manifest-SHA256'];
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('manifest-hash'));
});

test('fails when the X-AirTrust-Source-SHA header is absent entirely', () => {
  const responses = makeHappyResponses();
  delete responses.health.headers['X-AirTrust-Source-SHA'];
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('source-sha-header'));
});

test('fails when the legacy localhost debug string leaks into a public body', () => {
  const responses = makeHappyResponses();
  responses.health.bodyText = `${responses.health.bodyText} ${LEGACY_LOCALHOST_PHRASE}`;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('legacy-localhost-leak'));
});

test('reports every broken invariant at once rather than short-circuiting', () => {
  const responses = makeHappyResponses();
  responses.health.status = 503;
  responses.maintenance.status = 403;
  responses.protected.status = 200;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const codes = failureCodes(result);
  assert.ok(codes.includes('health-200'));
  assert.ok(codes.includes('maintenance-404'));
  assert.ok(codes.includes('protected-401'));
});

test('works against a real Headers instance (production shape)', () => {
  const responses = makeHappyResponses();
  responses.health.headers = new Headers(responses.health.headers);
  responses.version.headers = new Headers(responses.version.headers);
  const result = evaluate(responses);
  assert.equal(result.ok, true, result.failures.join('\n'));
});

// ---------------------------------------------------------------------------
// Edge-propagation retry classification
// ---------------------------------------------------------------------------

test('treats stale-edge version + source-sha mismatch as propagation-only', () => {
  assert.equal(
    isEdgePropagationOnly([
      '[version-mismatch] version "old" != expected "new"',
      '[source-sha-mismatch] X-AirTrust-Source-SHA "aaa" != expected "bbb"',
    ]),
    true,
  );
});

test('treats missing provenance stamps from an older Worker as propagation-only', () => {
  assert.equal(
    isEdgePropagationOnly([
      '[version-mismatch] version "old" != expected "new"',
      '[source-sha-header] X-AirTrust-Source-SHA response header absent',
      '[bundle-hash] worker bundle SHA-256 absent from health/version response',
      '[manifest-hash] release manifest SHA-256 absent from health/version response',
    ]),
    true,
  );
});

test('does not retry when a security invariant fails alongside version mismatch', () => {
  assert.equal(
    isEdgePropagationOnly([
      '[version-mismatch] version "old" != expected "new"',
      '[maintenance-404] maintenance route returned 403 (expected 404)',
    ]),
    false,
  );
  assert.equal(
    isEdgePropagationOnly([
      '[version-mismatch] version "old" != expected "new"',
      '[protected-401] protected route returned 200 (expected 401)',
    ]),
    false,
  );
  assert.equal(isEdgePropagationOnly([]), false);
});

// source_reference: unit tests for the hardened production post-deploy smoke evaluator.
// operational_decision: pure evaluator only — no network, no deploy, no remote reads/writes.
// dry_run_required: every assertion runs against local fixtures.
// rollback_plan_required: no rollback needed; this file is read-only test code.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateProductionSmoke,
  isEdgePropagationOnly,
  runHardenedSmoke,
  STOP_REASONS,
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
      status: 401,
      headers: {},
      json: { success: false, error: 'unauthorized' },
      bodyText: JSON.stringify({ success: false, error: 'unauthorized' }),
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

test('fails when the maintenance route answers 200 instead of 401', () => {
  const responses = makeHappyResponses();
  responses.maintenance.status = 200;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const failure = result.failures.find((f) => f.startsWith('[maintenance-auth-401]'));
  assert.ok(failure, 'expected a maintenance-auth-401 failure');
  assert.match(failure, new RegExp(MAINTENANCE_PROBE_PATH));
});

test('fails when the maintenance route answers 403 instead of 401', () => {
  const responses = makeHappyResponses();
  responses.maintenance.status = 403;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const failure = result.failures.find((f) => f.startsWith('[maintenance-auth-401]'));
  assert.ok(failure, 'expected a maintenance-auth-401 failure');
  assert.match(failure, new RegExp(MAINTENANCE_PROBE_PATH));
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
  assert.ok(
    codes.includes('worker-version-header'),
    'missing binding must fail worker-version-header',
  );
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
  assert.ok(codes.includes('maintenance-auth-401'));
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
      '[maintenance-auth-401] maintenance route returned 403 (expected 401)',
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

// ---------------------------------------------------------------------------
// /api/version status check + network-error classification (new invariants)
// ---------------------------------------------------------------------------

test('fails when /api/version does not return 200', () => {
  const responses = makeHappyResponses();
  responses.version.status = 500;
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.ok(failureCodes(result).includes('version-200'));
});

test('classifies a connection-level failure as *-network-error, not the status-based code', () => {
  const responses = makeHappyResponses();
  responses.health.status = null;
  responses.health.networkError = 'timeout';
  responses.version.status = null;
  responses.version.networkError = 'network-error';
  responses.protected.status = null;
  responses.protected.networkError = 'timeout';
  responses.maintenance.status = null;
  responses.maintenance.networkError = 'network-error';
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  const codes = failureCodes(result);
  assert.ok(codes.includes('health-network-error'));
  assert.ok(codes.includes('version-network-error'));
  assert.ok(codes.includes('protected-network-error'));
  assert.ok(codes.includes('maintenance-network-error'));
  assert.ok(!codes.includes('health-200'));
  assert.ok(!codes.includes('protected-401'));
  assert.ok(!codes.includes('maintenance-auth-401'));
});

test('a pure connectivity failure across all probes is retry-eligible (propagation-only)', () => {
  const responses = makeHappyResponses();
  for (const key of ['health', 'version', 'protected', 'maintenance']) {
    responses[key].status = null;
    responses[key].networkError = 'connection refused';
  }
  const result = evaluate(responses);
  assert.equal(result.ok, false);
  assert.equal(isEdgePropagationOnly(result.failures), true);
});

test('an actual wrong status on the protected/maintenance routes is never retry-eligible, even alone', () => {
  assert.equal(
    isEdgePropagationOnly(['[protected-401] protected route returned 200 (expected 401)']),
    false,
  );
  assert.equal(
    isEdgePropagationOnly(['[maintenance-auth-401] maintenance route returned 200 (expected 401)']),
    false,
  );
});

test('a transient 503 on /api/health alone is retry-eligible', () => {
  assert.equal(
    isEdgePropagationOnly(['[health-200] /api/health returned 503 (expected 200)']),
    true,
  );
});

test('a transient 502 on /api/version alone is retry-eligible', () => {
  assert.equal(
    isEdgePropagationOnly(['[version-200] /api/version returned 502 (expected 200)']),
    true,
  );
});

// ---------------------------------------------------------------------------
// runHardenedSmoke — retry/backoff/time-budget state machine (spec items 1-14)
// ---------------------------------------------------------------------------

function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

function queueCollector(sequence) {
  let index = 0;
  return async () => {
    if (index >= sequence.length) {
      throw new Error(`queueCollector exhausted after ${sequence.length} response(s)`);
    }
    const responses = sequence[index];
    index += 1;
    return responses;
  };
}

function baseParams(overrides = {}) {
  return {
    expectedVersion: EXPECTED_VERSION,
    expectedSha: EXPECTED_SHA,
    maxRetries: 6,
    retryDelayMs: 1000,
    maxTotalMs: 120000,
    sleep: async () => {},
    ...overrides,
  };
}

// 1. Correct version and health on the first attempt.
test('runHardenedSmoke: passes on the first attempt when everything is already correct', async () => {
  const collectResponses = queueCollector([makeHappyResponses()]);
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, true);
  assert.equal(run.attemptsUsed, 1);
  assert.equal(run.stopReason, STOP_REASONS.PASSED);
});

// 2. Stale version in the first attempts, correct SHA/version afterwards.
test('runHardenedSmoke: recovers from a stale version once the edge catches up', async () => {
  const stale = makeHappyResponses();
  stale.version.json.data.version = 'stale-version';
  stale.health.json.stats.version = 'stale-version';
  const collectResponses = queueCollector([stale, stale, makeHappyResponses()]);
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, true);
  assert.equal(run.attemptsUsed, 3);
});

// 3. Health transiently unavailable, then healthy.
test('runHardenedSmoke: recovers from a transiently unavailable /api/health', async () => {
  const down = makeHappyResponses();
  down.health.status = 503;
  down.health.json = { success: false, status: 'unhealthy' };
  const collectResponses = queueCollector([down, makeHappyResponses()]);
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, true);
  assert.equal(run.attemptsUsed, 2);
});

// 4. 502/503/504 transient, then recovery.
for (const status of [502, 503, 504]) {
  test(`runHardenedSmoke: recovers from a transient ${status} on /api/health`, async () => {
    const down = makeHappyResponses();
    down.health.status = status;
    const collectResponses = queueCollector([down, makeHappyResponses()]);
    const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
    assert.equal(run.ok, true);
    assert.equal(run.attemptsUsed, 2);
  });
}

// 5. Transient timeout, then recovery.
test('runHardenedSmoke: recovers from a transient request timeout', async () => {
  const timedOut = makeHappyResponses();
  timedOut.health.status = null;
  timedOut.health.networkError = 'timeout';
  const collectResponses = queueCollector([timedOut, makeHappyResponses()]);
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, true);
  assert.equal(run.attemptsUsed, 2);
});

// 6. SHA permanently incorrect — must never become a PASS, even after exhausting retries.
test('runHardenedSmoke: fails definitively when the source SHA never matches', async () => {
  const wrongSha = makeHappyResponses();
  wrongSha.health.headers['X-AirTrust-Source-SHA'] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const collectResponses = queueCollector(Array.from({ length: 6 }, () => wrongSha));
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 6 }), collectResponses });
  assert.equal(run.ok, false);
  assert.equal(run.attemptsUsed, 6);
  assert.equal(run.stopReason, STOP_REASONS.MAX_RETRIES_EXHAUSTED);
  assert.ok(run.result.failures.some((f) => f.startsWith('[source-sha-mismatch]')));
});

// 7. Health permanently degraded (persistent 503) — never becomes a PASS.
test('runHardenedSmoke: fails definitively when /api/health stays degraded', async () => {
  const degraded = makeHappyResponses();
  degraded.health.status = 503;
  degraded.health.json = { success: false, status: 'unhealthy' };
  const collectResponses = queueCollector(Array.from({ length: 3 }, () => degraded));
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 3 }), collectResponses });
  assert.equal(run.ok, false);
  assert.equal(run.attemptsUsed, 3);
  assert.equal(run.stopReason, STOP_REASONS.MAX_RETRIES_EXHAUSTED);
});

// 8. Persistent HTTP 500 on /api/health — never becomes a PASS.
test('runHardenedSmoke: fails definitively on a persistent 500', async () => {
  const broken = makeHappyResponses();
  broken.health.status = 500;
  const collectResponses = queueCollector(Array.from({ length: 6 }, () => broken));
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, false);
  assert.equal(run.stopReason, STOP_REASONS.MAX_RETRIES_EXHAUSTED);
});

// 9. Invalid JSON body — never becomes a PASS.
test('runHardenedSmoke: fails definitively when the version response body is not valid JSON', async () => {
  const brokenJson = makeHappyResponses();
  brokenJson.version.json = null;
  brokenJson.version.bodyText = '<html>not json</html>';
  const collectResponses = queueCollector(Array.from({ length: 6 }, () => brokenJson));
  const run = await runHardenedSmoke({ ...baseParams(), collectResponses });
  assert.equal(run.ok, false);
});

// 10. 401/403/404 on a route that must not answer that way — immediate, not retried.
test('runHardenedSmoke: stops immediately (does not burn retries) on a security-invariant violation', async () => {
  const leaked = makeHappyResponses();
  leaked.protected.status = 200; // should have been 401
  leaked.protected.json = { success: true, data: [] };
  const collectResponses = queueCollector([leaked, leaked, leaked, leaked, leaked, leaked]);
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 6 }), collectResponses });
  assert.equal(run.ok, false);
  assert.equal(run.attemptsUsed, 1, 'must not retry a security-invariant violation');
  assert.equal(run.stopReason, STOP_REASONS.NON_RETRYABLE_FAILURE);
});

// 11. Maximum retry count is enforced exactly.
test('runHardenedSmoke: never exceeds maxRetries attempts', async () => {
  const stillStale = makeHappyResponses();
  stillStale.version.json.data.version = 'still-stale';
  stillStale.health.json.stats.version = 'still-stale';
  const collectResponses = queueCollector(Array.from({ length: 4 }, () => stillStale));
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 4 }), collectResponses });
  assert.equal(run.ok, false);
  assert.equal(run.attemptsUsed, 4);
  assert.equal(run.stopReason, STOP_REASONS.MAX_RETRIES_EXHAUSTED);
});

// 12. Total time budget is enforced even when attempts remain.
test('runHardenedSmoke: stops for time-budget exhaustion before maxRetries when the clock runs out', async () => {
  const stillStale = makeHappyResponses();
  stillStale.version.json.data.version = 'still-stale';
  stillStale.health.json.stats.version = 'still-stale';
  const collectResponses = queueCollector(Array.from({ length: 20 }, () => stillStale));
  const clock = fakeClock();
  const run = await runHardenedSmoke({
    ...baseParams({
      maxRetries: 20,
      retryDelayMs: 1000,
      maxTotalMs: 2500,
      now: clock.now,
      sleep: async (ms) => clock.advance(ms),
    }),
    collectResponses,
  });
  assert.equal(run.ok, false);
  assert.equal(run.stopReason, STOP_REASONS.TIME_BUDGET_EXHAUSTED);
  assert.ok(run.attemptsUsed < 20, 'must stop before exhausting all 20 configured retries');
});

// 13. Logs stay sanitized — onAttempt never receives raw headers/body/secrets,
//     only the structured failure strings which are built from non-secret
//     identity fields (status codes, SHAs, version strings).
test('runHardenedSmoke: onAttempt callback never surfaces headers or raw response bodies', async () => {
  const responses = makeHappyResponses();
  responses.health.status = 503;
  const collectResponses = queueCollector([responses, makeHappyResponses()]);
  const seenNotes = [];
  await runHardenedSmoke({
    ...baseParams(),
    collectResponses,
    onAttempt: (attempt, result, note) => {
      seenNotes.push({ attempt, note, failures: result.failures });
      const serialized = JSON.stringify(result.failures);
      assert.ok(!serialized.includes('Authorization'));
      assert.ok(!serialized.includes('Bearer '));
      assert.ok(!serialized.includes('cookie'));
    },
  });
  assert.equal(seenNotes.length, 2);
  assert.equal(seenNotes[0].note, 'retry-transient');
  assert.equal(seenNotes[1].note, STOP_REASONS.PASSED);
});

// 14. PASS requires /api/version AND /api/health to both be valid in the SAME attempt.
test('runHardenedSmoke: does not pass when health is healthy but version lags behind', async () => {
  const mixed = makeHappyResponses();
  mixed.version.json.data.version = 'lagging-version';
  // health already reports the new version, but version endpoint has not
  // caught up yet — must not be treated as a PASS.
  const collectResponses = queueCollector([mixed]);
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 1 }), collectResponses });
  assert.equal(run.ok, false);
  assert.ok(
    run.result.failures.some(
      (f) => f.includes('version-disagree') || f.includes('version-mismatch'),
    ),
  );
});

test('runHardenedSmoke: does not pass when version is healthy but /api/health is down', async () => {
  const mixed = makeHappyResponses();
  mixed.health.status = 503;
  const collectResponses = queueCollector([mixed]);
  const run = await runHardenedSmoke({ ...baseParams({ maxRetries: 1 }), collectResponses });
  assert.equal(run.ok, false);
  assert.ok(run.result.failures.some((f) => f.startsWith('[health-200]')));
});

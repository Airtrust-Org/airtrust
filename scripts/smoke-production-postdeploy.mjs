#!/usr/bin/env node
/**
 * Hardened post-deploy PRODUCTION smoke.
 *
 * Runs immediately after a real production Worker deploy (invoked from
 * .github/workflows/deploy-airtrust.yml, "Smoke Worker" step). Unlike the
 * previous inline curl check — which only confirmed /api/health was reachable
 * and that APP_VERSION appeared somewhere in the body — this fails the deploy
 * (exit != 0) unless EVERY provenance/identity/security invariant below holds.
 *
 * The 2026-07-18 staging incident (see docs/ops/STAGING_RUNTIME_FORENSICS_2026-07-18.md)
 * showed that "health returns 200" is not sufficient evidence that the bytes
 * actually serving traffic are the bytes this pipeline just built. These checks
 * cross-reference Cloudflare's own Worker Version identity (workerVersionId /
 * X-AirTrust-Worker-Version, sourced from the version_metadata binding) against
 * the pipeline-attested provenance chain (source SHA, bundle hash, manifest
 * hash) and the expected release version.
 *
 * The pure evaluator `evaluateProductionSmoke` takes fully-materialized HTTP
 * responses so it can be unit-tested with fixtures and NEVER touches the
 * network. The CLI `main()` is the only part that performs real requests.
 */

export const FORBIDDEN_VERSIONS = new Set([
  '',
  'latest',
  'main',
  'dev',
  'dev-local',
  'unversioned-remote',
  'unknown',
  'null',
  'undefined',
  'managed-by-script',
  '__app_version__',
  '__build_version__',
]);

export const EXPECTED_ENVIRONMENT = 'production';

// Debug/dev-only route marker. Its presence in ANY public response means a
// localhost-only route leaked into a deployed Worker (the exact 2026-07-18
// staging failure mode). Assembled from fragments so this source file never
// contains the contiguous literal — otherwise guard:worker-bundle-provenance
// would flag this smoke script itself as carrying the legacy runtime string.
export const LEGACY_LOCALHOST_PHRASE = ['Rota disponível apenas', 'em localhost.'].join(' ');

// Endpoints probed by the CLI. Kept here so tests and the workflow share one
// source of truth.
export const PROTECTED_PROBE_PATH = '/api/lms/cursos';
export const MAINTENANCE_PROBE_PATH = '/api/frms/maintenance/fortnight-coverage';

/**
 * Case-insensitive header lookup that works whether `res.headers` is a real
 * `Headers` instance (production) or a plain object (test fixtures).
 */
export function getHeader(res, name) {
  const headers = res?.headers;
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }
  const lower = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = value == null ? '' : String(value).trim();
    if (normalized) return normalized;
  }
  return '';
}

/**
 * Pure evaluator. Accepts materialized responses:
 *   responses.health      -> { status, headers, bodyText, json }  (GET /api/health)
 *   responses.version     -> { status, headers, bodyText, json }  (GET /api/version)
 *   responses.protected   -> { status, headers, bodyText, json }  (GET PROTECTED_PROBE_PATH, no auth)
 *   responses.maintenance -> { status, headers, bodyText, json }  (GET MAINTENANCE_PROBE_PATH, no auth)
 *
 * Returns { ok: boolean, failures: string[], observed: object }. Accumulates
 * ALL failures rather than throwing on the first, so a single run reports
 * every broken invariant.
 */
export function evaluateProductionSmoke({ expectedVersion, expectedSha, responses } = {}) {
  const failures = [];
  const fail = (code, message) => failures.push(`[${code}] ${message}`);

  const health = responses?.health;
  const version = responses?.version;
  const protectedRes = responses?.protected;
  const maintenance = responses?.maintenance;

  const stats = health?.json?.stats ?? {};
  const versionData = version?.json?.data ?? {};

  // 1. /api/health responds HTTP 200. A connection-level failure (refused,
  //    DNS, timeout — captured by the CLI as networkError) gets its own code
  //    so the retry policy can treat "no connection yet" and "got a bad
  //    status" consistently, without conflating them with unrelated codes.
  if (!health || health.status !== 200) {
    const code = health?.networkError ? 'health-network-error' : 'health-200';
    fail(
      code,
      `/api/health returned ${health?.status ?? health?.networkError ?? 'no-response'} (expected 200)`,
    );
  }

  // 1b. /api/version responds HTTP 200. Previously unchecked — a persistent
  //     500/404 on /api/version could pass through unnoticed as long as the
  //     derived fields below happened to fail with a retryable code.
  if (!version || version.status !== 200) {
    const code = version?.networkError ? 'version-network-error' : 'version-200';
    fail(
      code,
      `/api/version returned ${version?.status ?? version?.networkError ?? 'no-response'} (expected 200)`,
    );
  }

  // 1c. A 200 response whose body did not parse as JSON is structurally
  //     invalid — never a transient condition, so it must fail immediately
  //     rather than being retried away (it will not fix itself).
  if (health && health.status === 200 && health.json === null) {
    fail('health-invalid-json', '/api/health returned 200 but the body is not valid JSON');
  }
  if (version && version.status === 200 && version.json === null) {
    fail('version-invalid-json', '/api/version returned 200 but the body is not valid JSON');
  }

  // 2. environment is production (not staging/dev).
  const environment = firstNonEmpty(
    stats.environment,
    getHeader(health, 'X-AirTrust-Environment'),
  ).toLowerCase();
  if (environment !== EXPECTED_ENVIRONMENT) {
    fail('environment', `environment "${environment || 'unknown'}" != "${EXPECTED_ENVIRONMENT}"`);
  }

  // 3. APP_VERSION equals expected release version and is not a placeholder.
  const reportedVersion = firstNonEmpty(stats.version, versionData.version);
  if (FORBIDDEN_VERSIONS.has(reportedVersion.toLowerCase())) {
    fail(
      'version-placeholder',
      `version "${reportedVersion || '(empty)'}" is a forbidden placeholder`,
    );
  }
  if (!expectedVersion) {
    fail('version-expected-missing', 'expectedVersion was not provided to the smoke');
  } else if (reportedVersion !== expectedVersion) {
    fail(
      'version-mismatch',
      `version "${reportedVersion || '(empty)'}" != expected "${expectedVersion}"`,
    );
  }
  // /api/version and /api/health must agree on the deployed version.
  if (stats.version && versionData.version && stats.version !== versionData.version) {
    fail(
      'version-disagree',
      `/api/health version "${stats.version}" != /api/version version "${versionData.version}"`,
    );
  }

  // 4. workerVersionId (Cloudflare Worker Version ID) present and non-empty.
  //    Empty here almost always means the version_metadata binding is missing.
  const workerVersionId = firstNonEmpty(
    stats.workerVersionId,
    versionData.workerVersionId,
    getHeader(health, 'X-AirTrust-Worker-Version'),
  );
  if (!workerVersionId) {
    fail(
      'worker-version-id',
      'workerVersionId absent/empty — Cloudflare version_metadata binding missing or not deployed',
    );
  }

  // 5. X-AirTrust-Worker-Version header present.
  const workerVersionHeader = firstNonEmpty(getHeader(health, 'X-AirTrust-Worker-Version'));
  if (!workerVersionHeader) {
    fail('worker-version-header', 'X-AirTrust-Worker-Version response header absent');
  }

  // 6. X-AirTrust-Source-SHA header present and equal to the expected SHA.
  const sourceShaHeader = firstNonEmpty(getHeader(health, 'X-AirTrust-Source-SHA'));
  if (!sourceShaHeader) {
    fail('source-sha-header', 'X-AirTrust-Source-SHA response header absent');
  } else if (expectedSha && sourceShaHeader !== expectedSha) {
    fail(
      'source-sha-mismatch',
      `X-AirTrust-Source-SHA "${sourceShaHeader}" != expected "${expectedSha}"`,
    );
  }

  // 7. Bundle hash (SHA-256 of the Worker bundle, provenance Phase 4) present.
  const bundleHash = firstNonEmpty(
    stats.workerBundleSha256,
    versionData.workerBundleSha256,
    getHeader(health, 'X-AirTrust-Worker-Bundle-SHA256'),
  );
  if (!bundleHash) {
    fail('bundle-hash', 'worker bundle SHA-256 absent from health/version response');
  }

  // 8. Manifest hash (release manifest SHA-256, provenance Phase 4) present.
  const manifestHash = firstNonEmpty(
    stats.releaseManifestSha256,
    versionData.releaseManifestSha256,
    getHeader(health, 'X-AirTrust-Release-Manifest-SHA256'),
  );
  if (!manifestHash) {
    fail('manifest-hash', 'release manifest SHA-256 absent from health/version response');
  }

  // 9. Protected route without a token returns exactly 401 (not 403, not 200).
  //    A network-level failure to reach the route is transient (retryable);
  //    an actual wrong status is a security-invariant violation and must not
  //    be retried away.
  if (!protectedRes || protectedRes.status !== 401) {
    if (protectedRes?.networkError) {
      fail(
        'protected-network-error',
        `protected route ${PROTECTED_PROBE_PATH} unreachable: ${protectedRes.networkError}`,
      );
    } else {
      fail(
        'protected-401',
        `protected route ${PROTECTED_PROBE_PATH} without token returned ${protectedRes?.status ?? 'no-response'} (expected 401)`,
      );
    }
  }

  // 10. Maintenance route without authentication returns exactly 401 Unauthorized
  //     (validating the authentication barrier). Neither 200 nor 403 is acceptable
  //     (200 exposes unauthenticated route data; 403 leaks route existence or bypasses
  //     auth middleware). Note: 404 for disabled mutations when authenticated is
  //     covered by integration tests (maintenance-guards.test.ts), not by unauthenticated probes.
  if (!maintenance || maintenance.status !== 401) {
    if (maintenance?.networkError) {
      fail(
        'maintenance-network-error',
        `maintenance route ${MAINTENANCE_PROBE_PATH} unreachable: ${maintenance.networkError}`,
      );
    } else {
      const observed = maintenance?.status ?? 'no-response';
      fail(
        'maintenance-auth-401',
        `maintenance route ${MAINTENANCE_PROBE_PATH} without token returned ${observed} (expected 401)`,
      );
    }
  }

  // 11. Legacy localhost-only debug string must be absent from every public
  //     response body.
  for (const [name, res] of Object.entries({
    health,
    version,
    protected: protectedRes,
    maintenance,
  })) {
    const body = String(res?.bodyText ?? '');
    if (body.includes(LEGACY_LOCALHOST_PHRASE)) {
      fail('legacy-localhost-leak', `legacy localhost debug string leaked in ${name} response`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    observed: {
      environment,
      reportedVersion,
      workerVersionId,
      sourceShaHeader,
      bundleHash,
      manifestHash,
      protectedStatus: protectedRes?.status ?? null,
      maintenanceStatus: maintenance?.status ?? null,
    },
  };
}

/**
 * Failure codes considered transient — either Cloudflare edge still serving
 * the previous Worker Version right after a deploy, or the deploy target
 * being briefly unreachable (connection refused, timeout, 502/503/504) while
 * the new Version finishes rolling out. Retry is safe only when EVERY
 * observed failure is in this set — security/identity invariants (wrong
 * 401/404, environment, localhost leak, placeholders) must fail immediately
 * and are deliberately excluded, even though the underlying route may also be
 * unreachable in the same window (that unreachability surfaces as the
 * `*-network-error` codes instead, which ARE retryable).
 *
 * Stale-edge responses typically combine version mismatch with the previous
 * source SHA / missing provenance stamps from an older Worker; limiting retry
 * to version-mismatch alone caused false smoke failures during propagation.
 *
 * `health-200` / `version-200` intentionally cover both transient statuses
 * (502/503/504 while the edge stabilizes) and a persistent one (e.g. 500):
 * a persistent failure still resolves to a definitive FAIL once
 * SMOKE_MAX_RETRIES or SMOKE_MAX_TOTAL_MS is exhausted — it is never turned
 * into a PASS.
 */
export const EDGE_PROPAGATION_FAILURE_CODES = new Set([
  'version-mismatch',
  'version-disagree',
  'worker-version-id',
  'worker-version-header',
  'source-sha-header',
  'source-sha-mismatch',
  'bundle-hash',
  'manifest-hash',
  'health-200',
  'health-network-error',
  'version-200',
  'version-network-error',
  'protected-network-error',
  'maintenance-network-error',
]);

export function failureCode(failure) {
  const text = String(failure || '');
  if (!text.startsWith('[')) return '';
  const end = text.indexOf(']');
  return end > 1 ? text.slice(1, end) : '';
}

export function isEdgePropagationOnly(failures) {
  if (!Array.isArray(failures) || failures.length === 0) return false;
  return failures.every((f) => EDGE_PROPAGATION_FAILURE_CODES.has(failureCode(f)));
}

/**
 * Reasons a retry attempt loop can stop. Exported so tests and the CLI share
 * one vocabulary instead of comparing ad hoc strings.
 */
export const STOP_REASONS = Object.freeze({
  PASSED: 'passed',
  NON_RETRYABLE_FAILURE: 'non-retryable-failure',
  MAX_RETRIES_EXHAUSTED: 'max-retries-exhausted',
  TIME_BUDGET_EXHAUSTED: 'time-budget-exhausted',
});

/**
 * Pure(-ish) retry/backoff orchestrator around evaluateProductionSmoke. Takes
 * its I/O (collectResponses, sleep, now) as injectable dependencies so the
 * full retry/backoff/time-budget/stop-reason state machine can be unit
 * tested with canned response sequences and a fake clock — no real network,
 * no real timers, no c8-ignored blind spot for this logic.
 *
 * Bounded by BOTH maxRetries (attempt count) and maxTotalMs (wall-clock
 * budget) — whichever is hit first stops the loop. Never retries a failure
 * whose code is not in EDGE_PROPAGATION_FAILURE_CODES: those are treated as
 * immediate, definitive failures.
 *
 * `onAttempt(attempt, result, note)` is an optional side-effecting callback
 * for logging; it never influences control flow.
 */
export async function runHardenedSmoke({
  expectedVersion,
  expectedSha,
  maxRetries,
  retryDelayMs,
  maxTotalMs,
  collectResponses,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  onAttempt = () => {},
}) {
  if (!(maxRetries >= 1)) throw new Error('maxRetries must be >= 1');
  if (!(retryDelayMs >= 0)) throw new Error('retryDelayMs must be >= 0');
  if (!(maxTotalMs >= 0)) throw new Error('maxTotalMs must be >= 0');

  const startedAt = now();
  let result;
  let attemptsUsed = 0;
  let stopReason = STOP_REASONS.MAX_RETRIES_EXHAUSTED;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    attemptsUsed = attempt;
    const responses = await collectResponses();
    result = evaluateProductionSmoke({ expectedVersion, expectedSha, responses });

    if (result.ok) {
      stopReason = STOP_REASONS.PASSED;
      onAttempt(attempt, result, stopReason);
      break;
    }

    const isTransient = isEdgePropagationOnly(result.failures);
    if (!isTransient) {
      stopReason = STOP_REASONS.NON_RETRYABLE_FAILURE;
      onAttempt(attempt, result, stopReason);
      break;
    }

    const elapsedMs = now() - startedAt;
    const hasAttemptsLeft = attempt < maxRetries;
    const withinTimeBudget = elapsedMs + retryDelayMs <= maxTotalMs;

    if (!hasAttemptsLeft) {
      stopReason = STOP_REASONS.MAX_RETRIES_EXHAUSTED;
      onAttempt(attempt, result, stopReason);
      break;
    }
    if (!withinTimeBudget) {
      stopReason = STOP_REASONS.TIME_BUDGET_EXHAUSTED;
      onAttempt(attempt, result, stopReason);
      break;
    }

    onAttempt(attempt, result, 'retry-transient');
    await sleep(retryDelayMs);
  }

  return {
    ok: result.ok,
    result,
    attemptsUsed,
    maxRetries,
    stopReason,
    totalElapsedMs: now() - startedAt,
  };
}

/* c8 ignore start — CLI/network plumbing, exercised by the deploy workflow, not unit tests. */

const PRODUCTION_CANONICAL_HOST = 'api.airtrust.online';
const PRODUCTION_FALLBACK_HOST = 'airtrust-api-production.airtrust.workers.dev';
const PRODUCTION_BLOCKED_HOST = 'airtrust-api.airtrust.workers.dev';

function assertAllowedProductionBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('PROD_API_BASE_URL is empty');
  const parsed = new URL(raw.replace(/\/+$/, ''));
  const host = parsed.hostname.toLowerCase();
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('PROD_API_BASE_URL must point at the host root');
  }
  if (host === PRODUCTION_BLOCKED_HOST) {
    throw new Error(
      `PROD_API_BASE_URL must not use the non-canonical alias ${PRODUCTION_BLOCKED_HOST}`,
    );
  }
  if (host !== PRODUCTION_CANONICAL_HOST && host !== PRODUCTION_FALLBACK_HOST) {
    throw new Error(
      `PROD_API_BASE_URL must point at ${PRODUCTION_CANONICAL_HOST} or ${PRODUCTION_FALLBACK_HOST}; got ${host}`,
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}

// A request that neither resolves nor rejects within this window is aborted
// and folded into the same networkError path as a connection refusal — the
// smoke must never hang indefinitely on one slow probe.
async function probe(baseUrl, path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });
    const bodyText = await response.text();
    let json = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }
    return {
      status: response.status,
      headers: response.headers,
      bodyText,
      json,
      networkError: null,
    };
  } catch (error) {
    // Sanitized on purpose: only the error name/message (e.g. "AbortError",
    // "fetch failed") is kept, never headers or response bodies which could
    // carry auth material from a misbehaving edge.
    const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || 'network-error';
    return { status: null, headers: null, bodyText: '', json: null, networkError: reason };
  } finally {
    clearTimeout(timer);
  }
}

async function collectResponses(baseUrl, timeoutMs) {
  const [health, version, protectedRes, maintenance] = await Promise.all([
    probe(baseUrl, '/api/health', timeoutMs),
    probe(baseUrl, '/api/version', timeoutMs),
    probe(baseUrl, PROTECTED_PROBE_PATH, timeoutMs),
    probe(baseUrl, MAINTENANCE_PROBE_PATH, timeoutMs),
  ]);
  return { health, version, protected: protectedRes, maintenance };
}

function log(message) {
  process.stdout.write(`[production-postdeploy-smoke] ${message}\n`);
}

async function main() {
  const baseUrl = assertAllowedProductionBaseUrl(
    process.env.PROD_API_BASE_URL || `https://${PRODUCTION_CANONICAL_HOST}`,
  );
  const expectedVersion = String(process.env.EXPECTED_APP_VERSION || '').trim();
  const expectedSha = String(process.env.EXPECTED_SOURCE_SHA || '').trim();

  if (!expectedVersion) throw new Error('EXPECTED_APP_VERSION is required');
  if (!expectedSha) throw new Error('EXPECTED_SOURCE_SHA is required');

  // Cloudflare's edge may serve the previous Worker Version, or be briefly
  // unreachable, for a short window after `wrangler deploy` reports success.
  // Bounded by attempt count AND wall-clock time so a persistently broken
  // deploy fails in a fixed, predictable window rather than retrying forever.
  const maxRetries = Number(process.env.SMOKE_MAX_RETRIES || 6);
  const retryDelayMs = Number(process.env.SMOKE_RETRY_DELAY_MS || 10000);
  const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 8000);
  const maxTotalMs = Number(process.env.SMOKE_MAX_TOTAL_MS || 120000);

  log(`BASE_URL=${baseUrl}`);
  log(`EXPECTED_APP_VERSION=${expectedVersion}`);
  log(`EXPECTED_SOURCE_SHA=${expectedSha}`);
  log(
    `POLICY maxRetries=${maxRetries} retryDelayMs=${retryDelayMs} requestTimeoutMs=${requestTimeoutMs} maxTotalMs=${maxTotalMs}`,
  );

  const run = await runHardenedSmoke({
    expectedVersion,
    expectedSha,
    maxRetries,
    retryDelayMs,
    maxTotalMs,
    collectResponses: () => collectResponses(baseUrl, requestTimeoutMs),
    onAttempt: (attempt, result, note) => {
      if (note === 'retry-transient') {
        log(
          `attempt ${attempt}/${maxRetries}: transient, retrying — ${result.failures.join('; ')}`,
        );
      } else if (note === STOP_REASONS.PASSED) {
        log(`attempt ${attempt}/${maxRetries}: all checks passed`);
      } else {
        log(`attempt ${attempt}/${maxRetries}: stopping (${note}) — ${result.failures.join('; ')}`);
      }
    },
  });

  log(`OBSERVED=${JSON.stringify(run.result.observed)}`);
  log(
    `SUMMARY ok=${run.ok} attempts=${run.attemptsUsed}/${run.maxRetries} stopReason=${run.stopReason} elapsedMs=${run.totalElapsedMs}`,
  );

  if (!run.ok) {
    for (const failure of run.result.failures) {
      process.stderr.write(`[production-postdeploy-smoke][FAIL] ${failure}\n`);
    }
    throw new Error(
      `production post-deploy smoke failed with ${run.result.failures.length} error(s) after ${run.attemptsUsed}/${run.maxRetries} attempt(s) (${run.stopReason})`,
    );
  }

  log('SMOKE_OK all hardened production post-deploy checks passed');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[production-postdeploy-smoke][ERROR] ${message}\n`);
    process.exitCode = 1;
  });
}

/* c8 ignore stop */

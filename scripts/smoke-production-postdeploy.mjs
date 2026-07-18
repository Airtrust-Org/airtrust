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

  // 1. /api/health responds HTTP 200.
  if (!health || health.status !== 200) {
    fail('health-200', `/api/health returned ${health?.status ?? 'no-response'} (expected 200)`);
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
    fail('version-placeholder', `version "${reportedVersion || '(empty)'}" is a forbidden placeholder`);
  }
  if (!expectedVersion) {
    fail('version-expected-missing', 'expectedVersion was not provided to the smoke');
  } else if (reportedVersion !== expectedVersion) {
    fail('version-mismatch', `version "${reportedVersion || '(empty)'}" != expected "${expectedVersion}"`);
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
    fail('source-sha-mismatch', `X-AirTrust-Source-SHA "${sourceShaHeader}" != expected "${expectedSha}"`);
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
  if (!protectedRes || protectedRes.status !== 401) {
    fail(
      'protected-401',
      `protected route ${PROTECTED_PROBE_PATH} without token returned ${protectedRes?.status ?? 'no-response'} (expected 401)`,
    );
  }

  // 10. Maintenance route returns 404 Not Found when maintenance mode is not
  //     active. A 403 would signal the route exists but is blocked — it must
  //     instead look non-existent.
  if (!maintenance || maintenance.status !== 404) {
    const observed = maintenance?.status ?? 'no-response';
    const hint = observed === 403 ? ' — 403 leaks that the maintenance route exists' : '';
    fail(
      'maintenance-404',
      `maintenance route ${MAINTENANCE_PROBE_PATH} returned ${observed} (expected 404)${hint}`,
    );
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
 * Failure codes that indicate Cloudflare edge may still be serving the previous
 * Worker Version after a successful deploy. Retry is safe only when EVERY
 * observed failure is in this set — security/identity invariants (401/404,
 * environment, localhost leak, placeholders) must fail immediately.
 *
 * Stale-edge responses typically combine version mismatch with the previous
 * source SHA / missing provenance stamps from an older Worker; limiting retry
 * to version-mismatch alone caused false smoke failures during propagation.
 */
export const EDGE_PROPAGATION_FAILURE_CODES = new Set([
  'version-mismatch',
  'worker-version-id',
  'worker-version-header',
  'source-sha-header',
  'source-sha-mismatch',
  'bundle-hash',
  'manifest-hash',
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
    throw new Error(`PROD_API_BASE_URL must not use the non-canonical alias ${PRODUCTION_BLOCKED_HOST}`);
  }
  if (host !== PRODUCTION_CANONICAL_HOST && host !== PRODUCTION_FALLBACK_HOST) {
    throw new Error(
      `PROD_API_BASE_URL must point at ${PRODUCTION_CANONICAL_HOST} or ${PRODUCTION_FALLBACK_HOST}; got ${host}`,
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}

async function probe(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  const bodyText = await response.text();
  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, bodyText, json };
}

async function collectResponses(baseUrl) {
  const [health, version, protectedRes, maintenance] = await Promise.all([
    probe(baseUrl, '/api/health'),
    probe(baseUrl, '/api/version'),
    probe(baseUrl, PROTECTED_PROBE_PATH),
    probe(baseUrl, MAINTENANCE_PROBE_PATH),
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

  log(`BASE_URL=${baseUrl}`);
  log(`EXPECTED_APP_VERSION=${expectedVersion}`);
  log(`EXPECTED_SOURCE_SHA=${expectedSha}`);

  // Cloudflare's edge may serve the previous Worker Version for several seconds
  // after `wrangler deploy` reports success. Retry the whole probe set until the
  // deployed version matches, then evaluate every invariant on the final set.
  const maxRetries = Number(process.env.SMOKE_MAX_RETRIES || 6);
  const retryDelayMs = Number(process.env.SMOKE_RETRY_DELAY_MS || 10000);

  let result;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const responses = await collectResponses(baseUrl);
    result = evaluateProductionSmoke({ expectedVersion, expectedSha, responses });

    if (result.ok) {
      log(`attempt ${attempt}/${maxRetries}: all checks passed`);
      break;
    }

    if (attempt < maxRetries && isEdgePropagationOnly(result.failures)) {
      log(`attempt ${attempt}/${maxRetries}: awaiting edge propagation — ${result.failures.join('; ')}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }

    break;
  }

  log(`OBSERVED=${JSON.stringify(result.observed)}`);

  if (!result.ok) {
    for (const failure of result.failures) {
      process.stderr.write(`[production-postdeploy-smoke][FAIL] ${failure}\n`);
    }
    throw new Error(`production post-deploy smoke failed with ${result.failures.length} error(s)`);
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

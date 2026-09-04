#!/usr/bin/env node
/**
 * Provenance guard for the "Staging Frontend PR UI QA" workflow.
 *
 * This module is the ONLY code that decides whether an authenticated, read-only
 * browser QA run against the staging *frontend* of an open PR is allowed. It is
 * checked out and executed exclusively from trusted `main`; it never runs code
 * from the PR under test. `release_sha` is used only to:
 *   - look the PR up on the GitHub API,
 *   - confirm the open PR head matches it,
 *   - verify the 8 canonical release gates for that SHA,
 *   - confirm the published staging frontend was built from that SHA.
 *
 * The key difference from the official release / audit-201 guards: the staging
 * Worker is NOT required to be on the same SHA. A frontend-only PR is a
 * first-class case here. The Worker must merely (a) answer as staging and
 * (b) not be production. No other guard is weakened.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { verifyReleaseGatePayloads } from './verify-release-gates.mjs';

export const REQUIRED_CONFIRMATION = 'AIRTRUST_STAGING_FRONTEND_PR_QA';
export const TRUSTED_REPOSITORY = 'Airtrust-Org/airtrust';
export const TRUSTED_REF = 'refs/heads/main';
export const SUPPORTED_AUDIT_PROFILES = Object.freeze(['destructive-actions']);
export const ALLOWED_ACTOR_PERMISSIONS = Object.freeze(['write', 'push', 'maintain', 'admin']);

export const STAGING_FRONTEND_ORIGIN = 'https://staging.airtrust.pages.dev';
export const STAGING_WORKER_ORIGIN = 'https://airtrust-api-staging.airtrust.workers.dev';

// Any of these appearing in a host/URL we are about to touch is fail-closed.
const PRODUCTION_HOST_PATTERNS = Object.freeze([
  /(^|\.)airtrust\.online$/i,
  /^airtrust-api\.airtrust\.workers\.dev$/i,
  /^airtrust-api-production\.airtrust\.workers\.dev$/i,
  /^airtrust\.pages\.dev$/i,
]);

// Canonical staging targets for THIS workflow. `main.airtrust.pages.dev` is
// deliberately excluded — staging means staging here (BLOCKER 10).
const STAGING_HOST_ALLOWLIST = Object.freeze([
  'staging.airtrust.pages.dev',
  'airtrust-api-staging.airtrust.workers.dev',
]);

export function assertRunningOnMain(ref) {
  if (ref !== TRUSTED_REF) {
    throw new Error(`WORKFLOW_REF_NOT_MAIN:${ref || 'missing'}`);
  }
  return true;
}

export function assertConfirmation(value) {
  if (value !== REQUIRED_CONFIRMATION) {
    throw new Error('CONFIRMATION_REJECTED');
  }
  return true;
}

export function parsePrNumber(value) {
  const raw = String(value ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`PR_NUMBER_INVALID:${raw || 'missing'}`);
  }
  return Number(raw);
}

export function normalizeReleaseSha(value) {
  const raw = String(value ?? '').trim();
  if (!/^[0-9a-f]{40}$/i.test(raw)) {
    throw new Error(`RELEASE_SHA_INVALID:${raw || 'missing'}`);
  }
  return raw.toLowerCase();
}

export function assertAuditProfile(value) {
  if (!SUPPORTED_AUDIT_PROFILES.includes(value)) {
    throw new Error(`AUDIT_PROFILE_UNSUPPORTED:${value || 'missing'}`);
  }
  return value;
}

/**
 * Reject a production host/URL before any credential is exposed or any browser
 * navigation happens. Accepts a bare hostname or a full URL string.
 */
export function assertNotProductionTarget(candidate) {
  const raw = String(candidate ?? '').trim();
  if (!raw) throw new Error('TARGET_HOST_MISSING');

  let hostname = raw;
  try {
    hostname = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    throw new Error(`TARGET_HOST_UNPARSEABLE:${raw}`);
  }

  const lowered = hostname.toLowerCase();
  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(lowered)) {
      throw new Error(`PRODUCTION_TARGET_REJECTED:${lowered}`);
    }
  }
  return lowered;
}

export function assertStagingTarget(candidate) {
  const hostname = assertNotProductionTarget(candidate);
  if (!STAGING_HOST_ALLOWLIST.includes(hostname)) {
    throw new Error(`NON_STAGING_TARGET_REJECTED:${hostname}`);
  }
  return hostname;
}

/**
 * Pure evaluation of the PR shape. `pr` is the GitHub REST pulls/:number body.
 */
export function evaluateOpenFrontendPr({ pr, releaseSha, prNumber }) {
  if (!pr || typeof pr !== 'object') throw new Error('PR_PAYLOAD_UNAVAILABLE');

  const normalizedSha = normalizeReleaseSha(releaseSha);

  if (typeof prNumber === 'number' && pr.number !== prNumber) {
    throw new Error(`PR_NUMBER_MISMATCH:${pr.number}!=${prNumber}`);
  }
  if (pr.state !== 'open') {
    throw new Error(`PR_NOT_OPEN:${pr.state || 'unknown'}`);
  }
  if (pr.draft === true) {
    // A draft is allowed to run frontend QA, but flag it in provenance.
  }
  if (pr.base?.ref !== 'main') {
    throw new Error(`PR_BASE_NOT_MAIN:${pr.base?.ref || 'unknown'}`);
  }
  const headRepo = pr.head?.repo?.full_name;
  if (headRepo !== TRUSTED_REPOSITORY) {
    throw new Error(`PR_HEAD_REPO_UNTRUSTED:${headRepo || 'unknown'}`);
  }
  if (pr.head?.repo?.fork === true) {
    throw new Error('PR_FROM_FORK_REJECTED');
  }
  const headSha = String(pr.head?.sha ?? '').toLowerCase();
  if (headSha !== normalizedSha) {
    throw new Error(`OPEN_PR_HEAD_MISMATCH:${headSha || 'missing'}`);
  }

  return {
    prNumber: pr.number,
    releaseSha: normalizedSha,
    releaseShortSha: normalizedSha.slice(0, 7),
    draft: pr.draft === true,
    baseRef: pr.base.ref,
    headRef: pr.head?.ref ?? null,
  };
}

export function assertActorPermission(permission) {
  if (!ALLOWED_ACTOR_PERMISSIONS.includes(permission)) {
    throw new Error(`ACTOR_PERMISSION_INSUFFICIENT:${permission || 'none'}`);
  }
  return permission;
}

/**
 * Confirm the published staging frontend HTML was built from `release_sha`.
 * Mirrors scripts/stamp-build-version.sh output:
 *   <meta name="build-version" content="staging-<iso>-<shortsha>">
 */
export function verifyFrontendBuildVersion({ html, expectedShortSha }) {
  const shortSha = String(expectedShortSha ?? '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(shortSha)) {
    throw new Error('EXPECTED_SHORT_SHA_INVALID');
  }
  const text = String(html ?? '');
  const match = text.match(/<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i);
  if (!match) {
    throw new Error('STAGING_FRONTEND_BUILD_VERSION_META_MISSING');
  }
  const buildVersion = match[1].trim();
  if (!buildVersion.toLowerCase().includes(shortSha.slice(0, 7))) {
    throw new Error(`STAGING_FRONTEND_SHA_MISMATCH:${buildVersion}`);
  }
  return buildVersion;
}

/**
 * The staging Worker must answer *as staging* and must not be production.
 * It is explicitly NOT required to match `release_sha` — this is the
 * frontend-only PR contract.
 */
export function assertStagingWorkerUsable({ versionJson }) {
  if (!versionJson || typeof versionJson !== 'object') {
    throw new Error('STAGING_WORKER_VERSION_UNAVAILABLE');
  }
  const data =
    versionJson.data && typeof versionJson.data === 'object' ? versionJson.data : versionJson;
  const environment = String(data.environment ?? '').toLowerCase();

  // BLOCKER 6 — strict: the Worker MUST self-report environment "staging".
  // Missing / unknown / development / production all fail closed. A divergent
  // Worker source SHA is still fine (frontend-only contract).
  if (environment === 'production') {
    throw new Error('STAGING_WORKER_IS_PRODUCTION');
  }
  if (environment !== 'staging') {
    throw new Error(`STAGING_WORKER_ENVIRONMENT_NOT_STAGING:${environment || 'missing'}`);
  }

  const sourceSha = String(data.sourceSha ?? '').toLowerCase();
  return {
    environment,
    workerSha: sourceSha || null,
    workerShaMatchRequired: false,
  };
}

async function githubGet(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GITHUB_API_${response.status}:${pathname}`);
  }
  return response.json();
}

export async function runProvenanceGuard(env = process.env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const ghGet = deps.githubGet ?? ((p) => githubGet(p, env.GITHUB_TOKEN));

  assertRunningOnMain(env.GITHUB_REF);
  assertConfirmation(env.CONFIRMATION);
  const prNumber = parsePrNumber(env.PR_NUMBER);
  const releaseSha = normalizeReleaseSha(env.RELEASE_SHA);
  const auditProfile = assertAuditProfile(env.AUDIT_PROFILE);

  if (env.GITHUB_REPOSITORY !== TRUSTED_REPOSITORY) {
    throw new Error(`WORKFLOW_REPOSITORY_UNTRUSTED:${env.GITHUB_REPOSITORY || 'missing'}`);
  }
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN_MISSING');
  if (!env.GITHUB_ACTOR) throw new Error('GITHUB_ACTOR_MISSING');

  // Frontend + Worker origins are hard-coded staging; still assert.
  assertStagingTarget(STAGING_FRONTEND_ORIGIN);
  assertStagingTarget(STAGING_WORKER_ORIGIN);

  const pr = await ghGet(`/repos/${TRUSTED_REPOSITORY}/pulls/${prNumber}`);
  const prShape = evaluateOpenFrontendPr({ pr, releaseSha, prNumber });

  const commit = await ghGet(`/repos/${TRUSTED_REPOSITORY}/git/commits/${releaseSha}`);
  if (!commit?.sha || commit.sha.toLowerCase() !== releaseSha) {
    throw new Error('RELEASE_SHA_NOT_IN_REPOSITORY');
  }

  const permissionPayload = await ghGet(
    `/repos/${TRUSTED_REPOSITORY}/collaborators/${env.GITHUB_ACTOR}/permission`,
  );
  assertActorPermission(permissionPayload.permission);

  const [checksPayload, statusPayload] = await Promise.all([
    ghGet(`/repos/${TRUSTED_REPOSITORY}/commits/${releaseSha}/check-runs?per_page=100`),
    ghGet(`/repos/${TRUSTED_REPOSITORY}/commits/${releaseSha}/status`),
  ]);
  const gates = verifyReleaseGatePayloads({
    checkRuns: checksPayload.check_runs,
    statuses: statusPayload.statuses,
  });

  // Frontend provenance — released SHA must be the one publicly served.
  const frontendResponse = await fetchImpl(`${STAGING_FRONTEND_ORIGIN}/`, {
    headers: { Accept: 'text/html' },
  });
  if (!frontendResponse.ok) {
    throw new Error(`STAGING_FRONTEND_HTTP_${frontendResponse.status}`);
  }
  const frontendHtml = await frontendResponse.text();
  const frontendBuildVersion = verifyFrontendBuildVersion({
    html: frontendHtml,
    expectedShortSha: prShape.releaseShortSha,
  });

  // Worker only needs to be staging + reachable; SHA parity NOT required.
  const workerResponse = await fetchImpl(`${STAGING_WORKER_ORIGIN}/api/version`, {
    headers: { Accept: 'application/json' },
  });
  if (!workerResponse.ok) {
    throw new Error(`STAGING_WORKER_HTTP_${workerResponse.status}`);
  }
  const workerVersion = await workerResponse.json();
  const workerState = assertStagingWorkerUsable({ versionJson: workerVersion });

  return {
    status: 'PROVENANCE_OK',
    prNumber: prShape.prNumber,
    draft: prShape.draft,
    releaseSha,
    releaseShortSha: prShape.releaseShortSha,
    auditProfile,
    actorPermission: permissionPayload.permission,
    gates,
    frontendBuildVersion,
    worker: workerState,
    frontendOrigin: STAGING_FRONTEND_ORIGIN,
    workerOrigin: STAGING_WORKER_ORIGIN,
  };
}

async function main() {
  const result = await runProvenanceGuard();
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `[frontend-pr-qa] PASS pr=#${result.prNumber} sha=${result.releaseShortSha} ` +
      `frontend="${result.frontendBuildVersion}" worker.env=${result.worker.environment} ` +
      `worker_sha_match_required=${result.worker.workerShaMatchRequired}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[frontend-pr-qa] FAIL: ${error.message}`);
    process.exit(1);
  });
}

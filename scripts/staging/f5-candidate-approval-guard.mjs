#!/usr/bin/env node
/**
 * Read-only F5 staging grant verifier. It authorizes one inactive candidate
 * operation only; it does not call Cloudflare or mutate staging.
 */
import { pathToFileURL } from 'node:url';

export const REPO = 'Airtrust-Org/airtrust';
export const PR = 1696;
export const LOCK = 'airtrust-staging-mutations-and-scorm-qa';
export const MAX_ZIP_BYTES = 80 * 1024 * 1024;
const hex40 = /^[a-f0-9]{40}$/;
const hex64 = /^[a-f0-9]{64}$/;
const positive = /^[1-9][0-9]{0,15}$/;
const uuid = /^[0-9a-f-]{36}$/i;
const prefix = 'AIRTRUST_F5_STAGING_CANDIDATE_V1\n';

export function assertConfig(v) {
  if (v.repo !== REPO || v.ref !== 'refs/heads/main' ||
      v.event !== 'workflow_dispatch' ||
      v.confirmation !== 'AIRTRUST_F5_STAGING_CANDIDATE' ||
      !hex40.test(v.sha ?? '') || !positive.test(v.grantId ?? '') ||
      !positive.test(v.tenantId ?? '') || !positive.test(v.courseId ?? '') ||
      !hex64.test(v.packageSha256 ?? '') ||
      !/^[1-9][0-9]{1,8}$/.test(v.zipBytes ?? '') ||
      Number(v.zipBytes) < 22 || Number(v.zipBytes) > MAX_ZIP_BYTES ||
      !uuid.test(v.operationId ?? '')) {
    throw Error('F5_EXACT_MAIN_SHA_AND_SINGLE_CANDIDATE_SCOPE_REQUIRED');
  }
}

export function expectedGrant(v) {
  return {
    schema: 'AIRTRUST_F5_STAGING_CANDIDATE_V1',
    repository: REPO,
    pr: PR,
    release_sha: v.sha,
    environment: 'staging',
    tenant_id: Number(v.tenantId),
    course_id: Number(v.courseId),
    package_sha256: v.packageSha256,
    zip_bytes: Number(v.zipBytes),
    operation_id: v.operationId,
    candidate_count: 1,
    candidate_status: 'INACTIVE',
    activation: 'PROHIBITED',
    external_assessment_approval: 'PROHIBITED',
    certification: 'PROHIBITED',
    lock: LOCK,
    enrollment: 'SYNTHETIC_ONLY',
    recovery: 'D1_TIME_TRAVEL_AND_R2_COMPENSATION_REQUIRED',
    cleanup: 'PRODUCT_API_AND_R2_READBACK_REQUIRED'
  };
}

export function checkGrantBody(body, v) {
  if (typeof body !== 'string' || !body.startsWith(prefix)) {
    throw Error('F5_EXACT_F0_GRANT_MARKER_REQUIRED');
  }
  let parsed;
  try { parsed = JSON.parse(body.slice(prefix.length)); }
  catch { throw Error('F5_F0_GRANT_JSON_INVALID'); }
  const expected = expectedGrant(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join('|') !== Object.keys(expected).sort().join('|') ||
      Object.entries(expected).some(([key, value]) => parsed[key] !== value)) {
    throw Error('F5_F0_GRANT_SCOPE_OR_SHA_MISMATCH');
  }
}

export function checkReleaseChecks(runs, sha) {
  const required = new Set([
    'lint', 'build-content-gates', 'worker-typecheck', 'frontend-coverage',
    'worker-tests-1', 'worker-tests-2', 'lms-smoke', 'public-e2e', '🧪 Check PR'
  ]);
  if (!Array.isArray(runs)) throw Error('F5_RELEASE_GATES_UNAVAILABLE');
  for (const run of runs) {
    if (run.head_sha === sha && run.status === 'completed' && run.conclusion === 'success') {
      required.delete(run.name);
    }
  }
  if (required.size) throw Error('F5_EIGHT_RELEASE_GATES_AND_PR_CHECK_NOT_GREEN');
}

export async function verify(v, token, get, now = Date.now()) {
  assertConfig(v);
  if (!token) throw Error('F5_GITHUB_READ_TOKEN_REQUIRED');
  const pr = await get(`pulls/${PR}`);
  const isReviewedOpenHead = pr.state === 'open' && !pr.draft && pr.head?.sha === v.sha;
  const isMergedPr = pr.state === 'closed' && pr.merged === true &&
    hex40.test(pr.merge_commit_sha ?? '');
  if ((!isReviewedOpenHead && !isMergedPr) || pr.base?.ref !== 'main' ||
      pr.head?.repo?.full_name !== REPO || pr.head?.repo?.fork === true) {
    throw Error('F5_PR_HEAD_CHANGED_DRAFT_OR_FORKED');
  }
  // Later protected main merges retain the original F5 code. Require proof
  // that the exact release SHA descends from this PR's merge commit instead
  // of pinning all future staging runs to the historical merge SHA.
  if (isMergedPr && pr.merge_commit_sha !== v.sha) {
    const ancestry = await get(`compare/${pr.merge_commit_sha}...${v.sha}`);
    if (ancestry.status !== 'ahead' || ancestry.behind_by !== 0 ||
        ancestry.base_commit?.sha !== pr.merge_commit_sha ||
        ancestry.merge_base_commit?.sha !== pr.merge_commit_sha) {
      throw Error('F5_RELEASE_NOT_DESCENDANT_OF_MERGED_PR');
    }
  }
  // GitHub attaches PR checks to the reviewed head, not the merge commit.
  // Check these gates here; the trusted-main workflow independently requires
  // the release SHA to be on main and to have all eight release gates.
  const checkedSha = pr.head.sha;
  if (!hex40.test(checkedSha ?? '')) throw Error('F5_PR_HEAD_SHA_UNAVAILABLE');
  const checks = await get(`commits/${checkedSha}/check-runs?per_page=100`);
  checkReleaseChecks(checks.check_runs, checkedSha);
  const grant = await get(`issues/comments/${v.grantId}`);
  if (grant.issue_url !== `https://api.github.com/repos/${REPO}/issues/776` ||
      grant.created_at !== grant.updated_at) {
    throw Error('F5_F0_GRANT_EDITED_OR_WRONG_ISSUE');
  }
  const age = now - Date.parse(grant.created_at);
  if (!Number.isFinite(age) || age < 0 || age > 12 * 60 * 60 * 1000) {
    throw Error('F5_F0_GRANT_EXPIRED');
  }
  checkGrantBody(grant.body, v);
  for (const login of new Set([grant.user?.login, v.actor])) {
    if (!login || !/^[a-zA-Z0-9-]{1,39}$/.test(login)) {
      throw Error('F5_ADMIN_IDENTITY_REQUIRED');
    }
    const permission = await get(`collaborators/${login}/permission`);
    if (permission.permission !== 'admin') throw Error('F5_REPOSITORY_ADMIN_REQUIRED');
  }
  return true;
}

async function main() {
  const e = process.env;
  const v = {
    repo: e.GITHUB_REPOSITORY, ref: e.GITHUB_REF, event: e.GITHUB_EVENT_NAME,
    actor: e.GITHUB_ACTOR, confirmation: e.F5_CONFIRMATION,
    sha: e.F5_RELEASE_SHA, grantId: e.F5_GRANT_ID,
    tenantId: e.F5_TENANT_ID, courseId: e.F5_COURSE_ID,
    packageSha256: e.F5_PACKAGE_SHA256, zipBytes: e.F5_ZIP_BYTES,
    operationId: e.F5_OPERATION_ID
  };
  const token = e.GITHUB_TOKEN;
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error('F5_GITHUB_API_ACCESS_DENIED');
    return response.json();
  };
  await verify(v, token, get);
  console.log('F5_SINGLE_INACTIVE_CANDIDATE_GRANT_VERIFIED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.message?.startsWith('F5_') ? error.message : 'F5_GUARD_FAILED_CLOSED');
    process.exitCode = 1;
  });
}

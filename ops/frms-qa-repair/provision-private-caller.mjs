/**
 * FRMS F0 staging-only provisioner for the private queue caller Worker.
 * Deploys airtrust-frms-qa-caller-staging-private with no public HTTP route.
 * Existing Worker API bearer lives ONLY in the protected Actions runner.
 * No implicit grant from user text, successful GETs, or previous grants.
 */
import {createHash, createPublicKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {githubPrepareReadOnlyApi} from './verify-prepare-admin-grant.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';

export const REPO = 'Airtrust-Org/airtrust';
export const WORKFLOW = '.github/workflows/staging-frms-qa-private-caller.yml';
export const REF = REPO + '/' + WORKFLOW + '@refs/heads/main';
export const SCHEMA = 'AIRTRUST_FRMS_QA_CALLER_PROVISION_V1';
export const EXPECTED_CALLER_WORKER = 'airtrust-frms-qa-caller-staging-private';
export const EXPECTED_REPAIR_WORKER = 'airtrust-frms-qa-repair-staging-private';
export const MUTEX = 'airtrust-staging-mutations-and-scorm-qa';

const SHA = /^[a-f0-9]{40}$/;
const HEX32 = /^[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const NUM = /^[1-9][0-9]{0,15}$/;
const RUN = /^[1-9][0-9]{7,13}$/;
const USER = /^[a-zA-Z0-9-]{1,39}$/;

const fail = (code) => {
  throw Error(code || 'FRMS_QA_CALLER_PROVISION_DENIED');
};
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function exactCallerProvisionPlan({ sha, accountId, callerConfig } = {}) {
  if (
    !SHA.test(sha || '') ||
    !HEX32.test(accountId || '') ||
    typeof callerConfig !== 'string' ||
    callerConfig.length < 150 ||
    !callerConfig.includes('workers_dev = false') ||
    !callerConfig.includes('preview_urls = false') ||
    !callerConfig.includes(EXPECTED_CALLER_WORKER) ||
    !callerConfig.includes(EXPECTED_REPAIR_WORKER)
  ) {
    fail('FRMS_QA_CALLER_CONFIG_INVALID');
  }

  return Object.freeze({
    schema: SCHEMA,
    repository: REPO,
    coordination_issue: 776,
    frms_issue: 1426,
    phase: 'caller',
    release_sha: sha,
    environment: 'staging',
    account_id: accountId,
    tenant_id: 999013,
    d1_uuid: TARGET.db_id,
    caller_worker: EXPECTED_CALLER_WORKER,
    caller_config_sha256: digest(callerConfig),
    service_binding: EXPECTED_REPAIR_WORKER,
    credential_mode: 'existing_staging_worker_deploy_only',
    global_mutex: MUTEX,
    workflow_path: WORKFLOW,
    production_authorized: false,
    d1_writes_authorized: 0,
    r2_writes_authorized: 0,
    apply_authorized: false,
  });
}

export async function verifyCallerProvisionAdminGrant({
  env = {},
  callerConfig,
  fetcher = fetch,
  now = Date.now(),
} = {}) {
  const sha = env.GITHUB_SHA;
  const grantId = String(env.FRMS_QA_CALLER_GRANT_ID || '');
  const runId = String(env.GITHUB_RUN_ID || '');
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);

  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== REPO ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_WORKFLOW_REF !== REF ||
    env.FRMS_QA_CALLER_CONFIRM !== 'AIRTRUST_FRMS_QA_CALLER_WORKER_STAGING_DEPLOY' ||
    env.FRMS_QA_CALLER_EXPECTED_SHA !== sha ||
    !SHA.test(sha || '') ||
    !NUM.test(grantId) ||
    !RUN.test(runId) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !USER.test(env.GITHUB_ACTOR || '') ||
    !Number.isFinite(now) ||
    typeof env.GITHUB_TOKEN !== 'string' ||
    !env.GITHUB_TOKEN.trim() ||
    typeof fetcher !== 'function'
  ) {
    fail('FRMS_QA_CALLER_DISPATCH_INVALID');
  }

  const plan = exactCallerProvisionPlan({
    sha,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    callerConfig,
  });

  const api = githubPrepareReadOnlyApi({ token: env.GITHUB_TOKEN, fetcher });
  let main, run, comment;
  try {
    [main, run, comment] = await Promise.all([
      api('repos/' + REPO + '/branches/main'),
      api('repos/' + REPO + '/actions/runs/' + runId),
      api('repos/' + REPO + '/issues/comments/' + grantId),
    ]);
  } catch {
    fail('FRMS_QA_CALLER_GITHUB_LOOKUP_FAILED');
  }

  if (
    main?.commit?.sha !== sha ||
    run?.id !== Number(runId) ||
    run?.head_sha !== sha ||
    run?.head_branch !== 'main' ||
    run?.event !== 'workflow_dispatch' ||
    run?.path !== WORKFLOW ||
    run?.run_attempt !== attempt ||
    run?.actor?.login !== env.GITHUB_ACTOR ||
    !['in_progress', 'queued', 'waiting', 'requested'].includes(run?.status) ||
    comment?.id !== Number(grantId) ||
    !USER.test(comment?.user?.login || '') ||
    comment?.issue_url !== 'https://api.github.com/repos/' + REPO + '/issues/776'
  ) {
    fail('FRMS_QA_CALLER_GRANT_SOURCE_MISMATCH');
  }

  const creator = await api(
    'repos/' + REPO + '/collaborators/' + encodeURIComponent(comment.user.login) + '/permission',
  );
  if (!['admin'].includes(creator?.permission || '')) {
    fail('FRMS_QA_CALLER_ADMIN_REQUIRED');
  }

  const prefix = SCHEMA + '\n';
  const body = String(comment?.body || '');
  if (!body.startsWith(prefix)) fail('FRMS_QA_CALLER_GRANT_SCHEMA_MISMATCH');

  let payload;
  try {
    payload = JSON.parse(body.slice(prefix.length));
  } catch {
    fail('FRMS_QA_CALLER_GRANT_JSON_INVALID');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).sort().join('|') !== Object.keys(plan).sort().join('|') ||
    Object.entries(plan).some(([k, v]) => JSON.stringify(payload[k]) !== JSON.stringify(v))
  ) {
    fail('FRMS_QA_CALLER_GRANT_NOT_EXACT');
  }

  const createdAt = Date.parse(comment?.created_at || '');
  const updatedAt = Date.parse(comment?.updated_at || '');
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt) ||
    createdAt !== updatedAt ||
    now - createdAt > 2 * 3600000 ||
    now < createdAt - 60000
  ) {
    fail('FRMS_QA_CALLER_GRANT_STALE_OR_EDITED');
  }

  return Object.freeze({
    status: 'CALLER_PROVISION_ADMIN_GRANT_VERIFIED',
    sha,
    grantId,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    callerWorker: EXPECTED_CALLER_WORKER,
  });
}

export function buildCallerRuntimeSecrets({ env = {}, sha } = {}) {
  if (!HEX64.test(env.FRMS_QA_CALLER_KEY_HEX || '')) {
    fail('FRMS_QA_CALLER_KEY_HEX_REQUIRED');
  }
  const callerSha = createHash('sha256').update(env.FRMS_QA_CALLER_KEY_HEX).digest('hex');
  return Object.freeze({
    ENVIRONMENT: 'staging',
    D1_ID: TARGET.db_id,
    RELEASE_SHA: sha,
    CALLER_KEY_HEX: env.FRMS_QA_CALLER_KEY_HEX,
    CALLER_KEY_SHA256: callerSha,
  });
}

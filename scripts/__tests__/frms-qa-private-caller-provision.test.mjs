import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REPO,
  WORKFLOW,
  SCHEMA,
  EXPECTED_CALLER_WORKER,
  EXPECTED_REPAIR_WORKER,
  exactCallerProvisionPlan,
  verifyCallerProvisionAdminGrant,
  buildCallerRuntimeSecrets,
} from '../../ops/frms-qa-repair/provision-private-caller.mjs';

const sha = 'c'.repeat(40);
const accountId = 'a'.repeat(32);
const callerKey = 'f'.repeat(64);

test('exactCallerProvisionPlan constructs immutable, bounded caller plan', async () => {
  const callerConfig = await readFile(
    new URL('../../ops/frms-qa-repair/wrangler.caller.staging.toml', import.meta.url),
    'utf8',
  );
  const plan = exactCallerProvisionPlan({ sha, accountId, callerConfig });

  assert.equal(plan.schema, SCHEMA);
  assert.equal(plan.caller_worker, EXPECTED_CALLER_WORKER);
  assert.equal(plan.service_binding, EXPECTED_REPAIR_WORKER);
  assert.equal(plan.phase, 'caller');
  assert.equal(plan.environment, 'staging');
  assert.equal(plan.d1_writes_authorized, 0);
  assert.equal(plan.r2_writes_authorized, 0);
  assert.equal(plan.production_authorized, false);
});

test('exactCallerProvisionPlan rejects modified or insecure wrangler config', () => {
  assert.throws(
    () =>
      exactCallerProvisionPlan({
        sha,
        accountId,
        callerConfig: 'workers_dev = true\npreview_urls = true',
      }),
    /FRMS_QA_CALLER_CONFIG_INVALID/,
  );
});

test('verifyCallerProvisionAdminGrant enforces exact F0 admin comment and fresh TTL', async () => {
  const callerConfig = await readFile(
    new URL('../../ops/frms-qa-repair/wrangler.caller.staging.toml', import.meta.url),
    'utf8',
  );
  const plan = exactCallerProvisionPlan({ sha, accountId, callerConfig });
  const now = Date.parse('2026-10-24T12:00:00Z');
  const grantId = '1234567';
  const runId = '987654321';

  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: REPO,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: REPO + '/' + WORKFLOW + '@refs/heads/main',
    GITHUB_SHA: sha,
    GITHUB_ACTOR: 'admin-user',
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_TOKEN: 'mock-token',
    CLOUDFLARE_ACCOUNT_ID: accountId,
    FRMS_QA_CALLER_CONFIRM: 'AIRTRUST_FRMS_QA_CALLER_WORKER_STAGING_DEPLOY',
    FRMS_QA_CALLER_EXPECTED_SHA: sha,
    FRMS_QA_CALLER_GRANT_ID: grantId,
  };

  const fetcher = async (url) => {
    const path = String(url).replace('https://api.github.com/', '');
    if (path === 'repos/' + REPO + '/branches/main') {
      return { status: 200, redirected: false, ok: true, json: async () => ({ commit: { sha } }) };
    }
    if (path === 'repos/' + REPO + '/actions/runs/' + runId) {
      return {
        status: 200,
        redirected: false,
        ok: true,
        json: async () => ({
          id: Number(runId),
          head_sha: sha,
          head_branch: 'main',
          event: 'workflow_dispatch',
          path: WORKFLOW,
          run_attempt: 1,
          actor: { login: 'admin-user' },
          status: 'in_progress',
        }),
      };
    }
    if (path === 'repos/' + REPO + '/issues/comments/' + grantId) {
      return {
        status: 200,
        redirected: false,
        ok: true,
        json: async () => ({
          id: Number(grantId),
          issue_url: 'https://api.github.com/repos/' + REPO + '/issues/776',
          user: { login: 'admin-user' },
          created_at: new Date(now - 300000).toISOString(),
          updated_at: new Date(now - 300000).toISOString(),
          body: SCHEMA + '\n' + JSON.stringify(plan),
        }),
      };
    }
    if (path === 'repos/' + REPO + '/collaborators/admin-user/permission') {
      return { status: 200, redirected: false, ok: true, json: async () => ({ permission: 'admin' }) };
    }
    throw new Error('Unexpected URL: ' + path);
  };

  const verified = await verifyCallerProvisionAdminGrant({
    env,
    callerConfig,
    fetcher,
    now,
  });

  assert.equal(verified.status, 'CALLER_PROVISION_ADMIN_GRANT_VERIFIED');
  assert.equal(verified.callerWorker, EXPECTED_CALLER_WORKER);
});

test('buildCallerRuntimeSecrets constructs deterministic hashes without logging', () => {
  const secrets = buildCallerRuntimeSecrets({
    env: { FRMS_QA_CALLER_KEY_HEX: callerKey },
    sha,
  });

  assert.equal(secrets.ENVIRONMENT, 'staging');
  assert.equal(secrets.RELEASE_SHA, sha);
  assert.equal(secrets.CALLER_KEY_HEX, callerKey);
  assert.equal(secrets.CALLER_KEY_SHA256.length, 64);
  assert.equal(Object.hasOwn(secrets, 'CLOUDFLARE_API_TOKEN'), false);
});

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
  assert.equal(plan.credential_mode, 'existing_staging_worker_deploy_only');
  const dedicated = exactCallerProvisionPlan({ sha, accountId, callerConfig,
    credentialMode: 'dedicated' });
  assert.equal(dedicated.credential_mode, 'dedicated');
  assert.throws(() => exactCallerProvisionPlan({ sha, accountId, callerConfig,
    credentialMode: 'unapproved_mode' }), /FRMS_QA_CALLER_CONFIG_INVALID/);
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
    FRMS_QA_CREDENTIAL_MODE: 'existing_staging_worker_deploy_only',
  };

  let blockedGate = null;
  let revokedActor = false;
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
      return { status: 200, redirected: false, ok: true,
        json: async () => ({ permission: revokedActor ? 'write' : 'admin' }) };
    }
    if (path.startsWith('repos/' + REPO + '/commits/' + sha + '/check-runs?')) {
      const name = new URL(String(url)).searchParams.get('check_name');
      return { status: 200, redirected: false, ok: true,
        json: async () => ({ check_runs: name === blockedGate ? [] : [{
          name, head_sha: sha, status: 'completed', conclusion: 'success',
          app: { slug: 'github-actions' },
        }] }) };
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
  blockedGate = 'frontend-coverage';
  await assert.rejects(verifyCallerProvisionAdminGrant({
    env, callerConfig, fetcher, now,
  }), /FRMS_QA_CALLER_ADMIN_OR_GATES_REQUIRED/);
  blockedGate = null;
  revokedActor = true;
  await assert.rejects(verifyCallerProvisionAdminGrant({
    env, callerConfig, fetcher, now,
  }), /FRMS_QA_CALLER_ADMIN_OR_GATES_REQUIRED/);
  revokedActor = false;
  await assert.rejects(verifyCallerProvisionAdminGrant({
    env: { ...env, FRMS_QA_CREDENTIAL_MODE: 'dedicated' }, callerConfig, fetcher, now,
  }), /FRMS_QA_CALLER_GRANT_NOT_EXACT/);
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

test('protected caller workflow authenticates the grant and never invokes bare Wrangler deploy', async () => {
  const source = await readFile(new URL('../../.github/workflows/staging-frms-qa-private-caller.yml',
    import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../ops/frms-qa-repair/run-private-caller-provision.mjs',
    import.meta.url), 'utf8');
  const queues = await readFile(new URL('../../ops/frms-qa-repair/run-private-queue-provision.mjs',
    import.meta.url), 'utf8');
  assert.match(source, /Verify actual F0 administrator grant, actor and eight official gates/);
  assert.match(source, /verifyCallerProvisionAdminGrant/);
  assert.match(source, /run: node ops\\/frms-qa-repair\\/run-private-caller-provision\\.mjs/);
  assert.doesNotMatch(source, /run: \\|\\s*set -euo pipefail\\s*npx wrangler deploy --config/);
  assert.match(runner, /FRMS_QA_CALLER_PARTIAL_DEPLOYMENT_RECONCILIATION_REQUIRED/);
  assert.match(runner, /await verifyCallerProvisionAdminGrant/);
  assert.match(runner, /getOnly=async/);
  assert.match(runner, /secret','bulk/);
  assert.match(runner, /secret','list/);
  assert.match(queues, /FRMS_QA_PRIVATE_QUEUES_PROVISION_FAILED_CLOSED_PHASE_/);
  assert.doesNotMatch(queues, /console\\.error\\(.*error\\.message/);
});

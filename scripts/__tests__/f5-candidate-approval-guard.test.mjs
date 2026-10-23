import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  REPO, PR, LOCK, MAX_ZIP_BYTES, assertConfig, expectedGrant,
  checkGrantBody, checkReleaseChecks, verify
} from '../staging/f5-candidate-approval-guard.mjs';

const sha = 'a'.repeat(40);
const zipSha = 'b'.repeat(64);
const base = {
  repo: REPO, ref: 'refs/heads/main', event: 'workflow_dispatch',
  actor: 'owner-user', confirmation: 'AIRTRUST_F5_STAGING_CANDIDATE',
  sha, grantId: '12345', tenantId: '9001', courseId: '7101',
  packageSha256: zipSha, zipBytes: '1000', operationId: '123e4567-e89b-12d3-a456-426614174000'
};
const grantBody = v => 'AIRTRUST_F5_STAGING_CANDIDATE_V1\n' + JSON.stringify(expectedGrant(v));

test('accepts only exact, single inactive candidate scope within streamed ZIP limits', () => {
  assert.doesNotThrow(() => assertConfig(base));
  const expected = expectedGrant(base);
  assert.equal(expected.pr, PR);
  assert.equal(expected.lock, LOCK);
  assert.equal(expected.candidate_count, 1);
  assert.equal(expected.candidate_status, 'INACTIVE');
  assert.equal(expected.activation, 'PROHIBITED');
  assert.equal(expected.external_assessment_approval, 'PROHIBITED');
  assert.equal(expected.certification, 'PROHIBITED');
  assert.equal(expected.zip_bytes, 1000);
  assert.ok(MAX_ZIP_BYTES > expected.zip_bytes);
  assert.doesNotThrow(() => checkGrantBody(grantBody(base), base));
});

test('rejects changed SHA/scope, extra grants, and missing confirmation fail-closed', () => {
  for (const patch of [
    { sha: 'bad' }, { tenantId: '0' }, { courseId: 'bad' },
    { packageSha256: 'bad' }, { zipBytes: String(MAX_ZIP_BYTES + 1) },
    { operationId: 'not-a-uuid' }, { confirmation: '' }
  ]) assert.throws(() => assertConfig({ ...base, ...patch }));
  for (const change of [
    { release_sha: 'c'.repeat(40) }, { tenant_id: 9002 }, { course_id: 7102 },
    { package_sha256: 'd'.repeat(64) }, { zip_bytes: 2000 },
    { candidate_count: 43 }, { activation: 'ALLOWED' }
  ]) {
    const parsed = { ...expectedGrant(base), ...change };
    assert.throws(() => checkGrantBody('AIRTRUST_F5_STAGING_CANDIDATE_V1\n' + JSON.stringify(parsed), base),
      /F5_F0_GRANT_SCOPE_OR_SHA_MISMATCH/);
  }
});

test('requires all official release gates on the exact candidate SHA', () => {
  const names = ['lint','build-content-gates','worker-typecheck','frontend-coverage',
    'worker-tests-1','worker-tests-2','lms-smoke','public-e2e','🧪 Check PR'];
  const runs = names.map(name => ({ name, head_sha: sha, status: 'completed', conclusion: 'success' }));
  assert.doesNotThrow(() => checkReleaseChecks(runs, sha));
  assert.throws(() => checkReleaseChecks(runs.map(x => ({ ...x, head_sha: 'c'.repeat(40) })), sha),
    /F5_EIGHT_RELEASE_GATES_AND_PR_CHECK_NOT_GREEN/);
  assert.throws(() => checkReleaseChecks(runs.slice(1), sha),
    /F5_EIGHT_RELEASE_GATES_AND_PR_CHECK_NOT_GREEN/);
});

test('verifies open exact PR, fresh immutable issue grant and both repository admins using GET-only adapter', async () => {
  const now = Date.now();
  const comment = {
    issue_url: `https://api.github.com/repos/${REPO}/issues/776`,
    created_at: new Date(now - 1000).toISOString(), updated_at: new Date(now - 1000).toISOString(),
    body: grantBody(base), user: { login: 'owner-user' }
  };
  const names = ['lint','build-content-gates','worker-typecheck','frontend-coverage',
    'worker-tests-1','worker-tests-2','lms-smoke','public-e2e','🧪 Check PR'];
  const calls = [];
  const get = async path => {
    calls.push(path);
    if (path === `pulls/${PR}`) return {
      state: 'open', draft: false, base: { ref: 'main' },
      head: { sha, repo: { full_name: REPO, fork: false } }
    };
    if (path.startsWith(`commits/${sha}/check-runs`)) return { check_runs: names.map(name =>
      ({ name, head_sha: sha, status: 'completed', conclusion: 'success' })) };
    if (path === 'issues/comments/12345') return comment;
    if (path.startsWith('collaborators/')) return { permission: 'admin' };
    throw new Error('unexpected request');
  };
  assert.equal(await verify(base, 'read-token', get, now), true);
  assert.deepEqual(calls.slice(-2), ['issues/comments/12345', 'collaborators/owner-user/permission']);
});

test('rejects edited/wrong issue, stale authorization, draft PR and non-admin actor', async () => {
  const now = Date.now();
  const setup = overrides => async path => {
    if (path === `pulls/${PR}`) return {
      state: 'open', draft: false, base: { ref: 'main' },
      head: { sha, repo: { full_name: REPO, fork: false } }, ...overrides.pr
    };
    if (path.startsWith(`commits/${sha}/check-runs`)) return { check_runs: [
      'lint','build-content-gates','worker-typecheck','frontend-coverage',
      'worker-tests-1','worker-tests-2','lms-smoke','public-e2e','🧪 Check PR'
    ].map(name => ({ name, head_sha: sha, status: 'completed', conclusion: 'success' })) };
    if (path === 'issues/comments/12345') return {
      issue_url: `https://api.github.com/repos/${REPO}/issues/776`,
      created_at: new Date(now - 1000).toISOString(), updated_at: new Date(now - 1000).toISOString(),
      body: grantBody(base), user: { login: 'owner-user' }, ...overrides.comment
    };
    if (path.startsWith('collaborators/')) return { permission: overrides.permission ?? 'admin' };
    throw new Error('unexpected request');
  };
  await assert.rejects(verify(base, 'token', setup({ pr: { draft: true } }), now), /F5_PR_HEAD_CHANGED_DRAFT_OR_FORKED/);
  await assert.rejects(verify(base, 'token', setup({ comment: { updated_at: new Date(now).toISOString() } }), now), /F5_F0_GRANT_EDITED_OR_WRONG_ISSUE/);
  await assert.rejects(verify(base, 'token', setup({ comment: { created_at: new Date(now - 13 * 3600000).toISOString(), updated_at: new Date(now - 13 * 3600000).toISOString() } }), now), /F5_F0_GRANT_EXPIRED/);
  await assert.rejects(verify(base, 'token', setup({ permission: 'write' }), now), /F5_REPOSITORY_ADMIN_REQUIRED/);
});

test('readiness workflow requires the scoped grant before its explicit non-pass blocker', () => {
  const workflow = readFileSync('.github/workflows/staging-scorm-f5-readiness.yml', 'utf8');
  for (const required of ['grant_id:', 'tenant_id:', 'course_id:', 'package_sha256:',
    'zip_bytes:', 'operation_id:', 'f5-candidate-approval-guard.mjs',
    'F5_INCONCLUSIVE:', 'candidate upload', 'recovery/cleanup receipt']) {
    assert.ok(workflow.includes(required), `missing workflow contract: ${required}`);
  }
  assert.match(workflow, /Type AIRTRUST_F5_STAGING_CANDIDATE/);
  assert.match(workflow, /issues: read/);
  assert.ok(workflow.indexOf('f5-candidate-approval-guard.mjs') <
    workflow.indexOf('Keep F5 blocked until governed intake'));
  assert.match(workflow, /group: airtrust-staging-mutations-and-scorm-qa/);
});

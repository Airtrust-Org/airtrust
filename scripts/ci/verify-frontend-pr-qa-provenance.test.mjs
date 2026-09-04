import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertActorPermission,
  assertAuditProfile,
  assertConfirmation,
  assertNotProductionTarget,
  assertRunningOnMain,
  assertStagingTarget,
  assertStagingWorkerUsable,
  evaluateOpenFrontendPr,
  normalizeReleaseSha,
  parsePrNumber,
  runProvenanceGuard,
  verifyFrontendBuildVersion,
} from './verify-frontend-pr-qa-provenance.mjs';

const SHA = 'd8507b3229bb16a5ff8b74c1ff6664924b9f8831';
const SHORT = 'd8507b3';

function greenCheckRuns() {
  return [
    'lint',
    'build-content-gates',
    'worker-typecheck',
    'frontend-coverage',
    'worker-tests-1',
    'worker-tests-2',
    'lms-smoke',
    'public-e2e',
  ].map((name) => ({ name, status: 'completed', conclusion: 'success' }));
}

function openPr(overrides = {}) {
  return {
    number: 282,
    state: 'open',
    draft: false,
    base: { ref: 'main' },
    head: {
      ref: 'fix/simuladores-cadastros-fichas-p0',
      sha: SHA,
      repo: { full_name: 'Airtrust-Org/airtrust', fork: false },
    },
    ...overrides,
  };
}

test('assertRunningOnMain rejects non-main refs', () => {
  assert.equal(assertRunningOnMain('refs/heads/main'), true);
  assert.throws(() => assertRunningOnMain('refs/heads/ci/x'), /WORKFLOW_REF_NOT_MAIN/);
  assert.throws(() => assertRunningOnMain('refs/pull/282/merge'), /WORKFLOW_REF_NOT_MAIN/);
});

test('assertConfirmation requires the exact token', () => {
  assert.equal(assertConfirmation('AIRTRUST_STAGING_FRONTEND_PR_QA'), true);
  assert.throws(() => assertConfirmation('AIRTRUST_STAGING'), /CONFIRMATION_REJECTED/);
  assert.throws(() => assertConfirmation(''), /CONFIRMATION_REJECTED/);
});

test('parsePrNumber accepts positive integers only', () => {
  assert.equal(parsePrNumber('282'), 282);
  assert.throws(() => parsePrNumber('0'), /PR_NUMBER_INVALID/);
  assert.throws(() => parsePrNumber('-3'), /PR_NUMBER_INVALID/);
  assert.throws(() => parsePrNumber('12a'), /PR_NUMBER_INVALID/);
});

test('normalizeReleaseSha requires a full 40-char hex sha', () => {
  assert.equal(normalizeReleaseSha(SHA.toUpperCase()), SHA);
  assert.throws(() => normalizeReleaseSha(SHORT), /RELEASE_SHA_INVALID/);
  assert.throws(() => normalizeReleaseSha(`${SHA}z`), /RELEASE_SHA_INVALID/);
});

test('assertAuditProfile only accepts destructive-actions initially', () => {
  assert.equal(assertAuditProfile('destructive-actions'), 'destructive-actions');
  assert.throws(() => assertAuditProfile('documents'), /AUDIT_PROFILE_UNSUPPORTED/);
  assert.throws(() => assertAuditProfile(''), /AUDIT_PROFILE_UNSUPPORTED/);
});

test('production hosts are rejected, staging hosts pass', () => {
  for (const host of [
    'https://airtrust.online',
    'app.airtrust.online',
    'https://airtrust-api.airtrust.workers.dev/api/version',
    'airtrust-api-production.airtrust.workers.dev',
    'https://airtrust.pages.dev/',
  ]) {
    assert.throws(() => assertNotProductionTarget(host), /PRODUCTION_TARGET_REJECTED/, host);
  }
  assert.equal(
    assertStagingTarget('https://staging.airtrust.pages.dev/'),
    'staging.airtrust.pages.dev',
  );
  assert.equal(
    assertStagingTarget('https://airtrust-api-staging.airtrust.workers.dev/api/version'),
    'airtrust-api-staging.airtrust.workers.dev',
  );
  assert.throws(() => assertStagingTarget('https://example.com'), /NON_STAGING_TARGET_REJECTED/);
});

test('evaluateOpenFrontendPr accepts a well-formed open same-repo PR', () => {
  const shape = evaluateOpenFrontendPr({ pr: openPr(), releaseSha: SHA, prNumber: 282 });
  assert.equal(shape.prNumber, 282);
  assert.equal(shape.releaseSha, SHA);
  assert.equal(shape.releaseShortSha, SHORT);
  assert.equal(shape.draft, false);
});

test('evaluateOpenFrontendPr rejects the wrong PR number', () => {
  assert.throws(
    () => evaluateOpenFrontendPr({ pr: openPr({ number: 999 }), releaseSha: SHA, prNumber: 282 }),
    /PR_NUMBER_MISMATCH/,
  );
});

test('evaluateOpenFrontendPr rejects a mismatched head SHA', () => {
  const pr = openPr({ head: { ...openPr().head, sha: 'a'.repeat(40) } });
  assert.throws(
    () => evaluateOpenFrontendPr({ pr, releaseSha: SHA, prNumber: 282 }),
    /OPEN_PR_HEAD_MISMATCH/,
  );
});

test('evaluateOpenFrontendPr rejects a fork head', () => {
  const pr = openPr({
    head: { ...openPr().head, repo: { full_name: 'someone/airtrust', fork: true } },
  });
  assert.throws(
    () => evaluateOpenFrontendPr({ pr, releaseSha: SHA, prNumber: 282 }),
    /PR_HEAD_REPO_UNTRUSTED|PR_FROM_FORK_REJECTED/,
  );
});

test('evaluateOpenFrontendPr rejects a closed PR', () => {
  assert.throws(
    () =>
      evaluateOpenFrontendPr({ pr: openPr({ state: 'closed' }), releaseSha: SHA, prNumber: 282 }),
    /PR_NOT_OPEN/,
  );
});

test('evaluateOpenFrontendPr rejects a base other than main', () => {
  assert.throws(
    () =>
      evaluateOpenFrontendPr({
        pr: openPr({ base: { ref: 'release/next' } }),
        releaseSha: SHA,
        prNumber: 282,
      }),
    /PR_BASE_NOT_MAIN/,
  );
});

test('assertActorPermission mirrors deploy-staging.yml', () => {
  for (const p of ['write', 'push', 'maintain', 'admin']) {
    assert.equal(assertActorPermission(p), p);
  }
  assert.throws(() => assertActorPermission('read'), /ACTOR_PERMISSION_INSUFFICIENT/);
  assert.throws(() => assertActorPermission('none'), /ACTOR_PERMISSION_INSUFFICIENT/);
});

test('verifyFrontendBuildVersion enforces the short SHA in the build-version meta', () => {
  const html = `<html><head><meta name="build-version" content="staging-2026-09-03T23:32:38Z-${SHORT}"></head></html>`;
  assert.equal(
    verifyFrontendBuildVersion({ html, expectedShortSha: SHORT }),
    `staging-2026-09-03T23:32:38Z-${SHORT}`,
  );
  assert.throws(
    () =>
      verifyFrontendBuildVersion({
        html: '<meta name="build-version" content="staging-2026-09-03T00:00:00Z-deadbee">',
        expectedShortSha: SHORT,
      }),
    /STAGING_FRONTEND_SHA_MISMATCH/,
  );
  assert.throws(
    () => verifyFrontendBuildVersion({ html: '<html></html>', expectedShortSha: SHORT }),
    /BUILD_VERSION_META_MISSING/,
  );
});

test('assertStagingWorkerUsable accepts a different Worker SHA (frontend-only contract)', () => {
  const state = assertStagingWorkerUsable({
    versionJson: { environment: 'staging', sourceSha: 'f'.repeat(40) },
  });
  assert.equal(state.environment, 'staging');
  assert.equal(state.workerShaMatchRequired, false);
  assert.equal(state.workerSha, 'f'.repeat(40));
});

test('assertStagingWorkerUsable rejects a production Worker', () => {
  assert.throws(
    () => assertStagingWorkerUsable({ versionJson: { environment: 'production' } }),
    /STAGING_WORKER_IS_PRODUCTION/,
  );
});

// ---- Integration-style tests of runProvenanceGuard with injected deps --------

function baseEnv(overrides = {}) {
  return {
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'Airtrust-Org/airtrust',
    GITHUB_TOKEN: 'x',
    GITHUB_ACTOR: 'filipe',
    CONFIRMATION: 'AIRTRUST_STAGING_FRONTEND_PR_QA',
    PR_NUMBER: '282',
    RELEASE_SHA: SHA,
    AUDIT_PROFILE: 'destructive-actions',
    ...overrides,
  };
}

function makeDeps({
  pr = openPr(),
  checkRuns = greenCheckRuns(),
  statuses = [],
  permission = 'admin',
  frontendHtml = `<meta name="build-version" content="staging-2026-09-03T23:32:38Z-${SHORT}">`,
  frontendStatus = 200,
  workerJson = { environment: 'staging', sourceSha: 'f'.repeat(40) },
  workerStatus = 200,
} = {}) {
  const githubGet = async (pathname) => {
    if (pathname.endsWith(`/pulls/282`)) return pr;
    if (pathname.includes('/git/commits/')) return { sha: SHA };
    if (pathname.includes('/collaborators/')) return { permission };
    if (pathname.includes('/check-runs')) return { check_runs: checkRuns };
    if (pathname.endsWith('/status')) return { statuses };
    throw new Error(`unexpected path ${pathname}`);
  };
  const fetchImpl = async (url) => {
    if (url.includes('staging.airtrust.pages.dev')) {
      return { ok: frontendStatus === 200, status: frontendStatus, text: async () => frontendHtml };
    }
    if (url.includes('airtrust-api-staging')) {
      return { ok: workerStatus === 200, status: workerStatus, json: async () => workerJson };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { githubGet, fetch: fetchImpl };
}

test('runProvenanceGuard passes for a frontend-only PR with a divergent Worker SHA', async () => {
  const result = await runProvenanceGuard(baseEnv(), makeDeps());
  assert.equal(result.status, 'PROVENANCE_OK');
  assert.equal(result.prNumber, 282);
  assert.equal(result.releaseShortSha, SHORT);
  assert.equal(result.worker.workerShaMatchRequired, false);
  assert.notEqual(result.worker.workerSha, SHA);
});

test('runProvenanceGuard fails closed on missing release gates', async () => {
  const deps = makeDeps({ checkRuns: greenCheckRuns().filter((c) => c.name !== 'public-e2e') });
  await assert.rejects(runProvenanceGuard(baseEnv(), deps), /RELEASE_GATES_NOT_GREEN/);
});

test('runProvenanceGuard fails closed on a frontend SHA mismatch', async () => {
  const deps = makeDeps({
    frontendHtml: '<meta name="build-version" content="staging-2026-09-03T00:00:00Z-0000000">',
  });
  await assert.rejects(runProvenanceGuard(baseEnv(), deps), /STAGING_FRONTEND_SHA_MISMATCH/);
});

test('runProvenanceGuard rejects a production Worker environment', async () => {
  const deps = makeDeps({ workerJson: { environment: 'production' } });
  await assert.rejects(runProvenanceGuard(baseEnv(), deps), /STAGING_WORKER_IS_PRODUCTION/);
});

test('runProvenanceGuard rejects a fork PR', async () => {
  const deps = makeDeps({
    pr: openPr({ head: { ...openPr().head, repo: { full_name: 'evil/airtrust', fork: true } } }),
  });
  await assert.rejects(
    runProvenanceGuard(baseEnv(), deps),
    /PR_HEAD_REPO_UNTRUSTED|PR_FROM_FORK_REJECTED/,
  );
});

test('runProvenanceGuard rejects a closed PR', async () => {
  const deps = makeDeps({ pr: openPr({ state: 'closed' }) });
  await assert.rejects(runProvenanceGuard(baseEnv(), deps), /PR_NOT_OPEN/);
});

test('runProvenanceGuard rejects a base other than main', async () => {
  const deps = makeDeps({ pr: openPr({ base: { ref: 'dev' } }) });
  await assert.rejects(runProvenanceGuard(baseEnv(), deps), /PR_BASE_NOT_MAIN/);
});

test('runProvenanceGuard rejects an insufficient actor permission', async () => {
  await assert.rejects(
    runProvenanceGuard(baseEnv(), makeDeps({ permission: 'read' })),
    /ACTOR_PERMISSION_INSUFFICIENT/,
  );
});

test('runProvenanceGuard rejects a non-main workflow ref', async () => {
  await assert.rejects(
    runProvenanceGuard(
      baseEnv({ GITHUB_REF: 'refs/heads/ci/staging-frontend-pr-ui-qa' }),
      makeDeps(),
    ),
    /WORKFLOW_REF_NOT_MAIN/,
  );
});

test('runProvenanceGuard rejects a wrong confirmation', async () => {
  await assert.rejects(
    runProvenanceGuard(baseEnv({ CONFIRMATION: 'nope' }), makeDeps()),
    /CONFIRMATION_REJECTED/,
  );
});

test('runProvenanceGuard rejects an unsupported audit profile', async () => {
  await assert.rejects(
    runProvenanceGuard(baseEnv({ AUDIT_PROFILE: 'licencas' }), makeDeps()),
    /AUDIT_PROFILE_UNSUPPORTED/,
  );
});

test('runProvenanceGuard rejects a release_sha absent from the repository', async () => {
  const deps = makeDeps();
  const inner = deps.githubGet;
  deps.githubGet = async (p) => {
    if (p.includes('/git/commits/')) throw new Error('GITHUB_API_422:/git/commits');
    return inner(p);
  };
  await assert.rejects(
    runProvenanceGuard(baseEnv(), deps),
    /GITHUB_API_422|RELEASE_SHA_NOT_IN_REPOSITORY/,
  );
});

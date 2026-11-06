import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAllCommitCheckRuns, githubGet, verifyReleaseGatePayloads } from './verify-release-gates.mjs';

const greenChecks = [
  { name: 'lint', status: 'completed', conclusion: 'success' },
  { name: 'build-content-gates', status: 'completed', conclusion: 'success' },
  { name: 'worker-typecheck', status: 'completed', conclusion: 'success' },
  { name: 'frontend-coverage', status: 'completed', conclusion: 'success' },
  { name: 'worker-tests-1', status: 'completed', conclusion: 'success' },
  { name: 'worker-tests-2', status: 'completed', conclusion: 'success' },
  { name: 'lms-smoke', status: 'completed', conclusion: 'success' },
  { name: 'public-e2e', status: 'completed', conclusion: 'success' },
];

test('accepts the eight official GitHub Actions gates and ignores optional noise', () => {
  assert.deepEqual(
    verifyReleaseGatePayloads({
      checkRuns: [
        ...greenChecks,
        { name: 'airtrust-gcb', status: 'completed', conclusion: 'failure' },
        { name: 'optional-experiment', status: 'completed', conclusion: 'failure' },
      ],
      statuses: [],
    }),
    {
      githubActions: [
        'lint',
        'build-content-gates',
        'worker-typecheck',
        'frontend-coverage',
        'worker-tests-1',
        'worker-tests-2',
        'lms-smoke',
        'public-e2e',
      ],
      gcbStatus: 'airtrust-gcb',
    },
  );
});

test('fails when any official gate is missing', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.filter((check) => check.name !== 'worker-tests-2'),
        statuses: [],
      }),
    /worker-tests-2:missing/,
  );
});

test('fails when an official gate is not green', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks.map((check) =>
          check.name === 'public-e2e' ? { ...check, conclusion: 'failure' } : check,
        ),
        statuses: [],
      }),
    /public-e2e:not-success/,
  );
});

test('legacy aggregate cannot substitute for a missing heavy gate', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: [
          ...greenChecks.filter((check) => check.name !== 'frontend-coverage'),
          { name: 'airtrust-gcb', status: 'completed', conclusion: 'success' },
        ],
        statuses: [],
      }),
    /frontend-coverage:missing/,
  );
});


test('fails closed when a classic airtrust-gcb status exists and is red', () => {
  assert.throws(
    () =>
      verifyReleaseGatePayloads({
        checkRuns: greenChecks,
        statuses: [{ context: 'airtrust-gcb', state: 'failure' }],
      }),
    /airtrust-gcb:not-success/,
  );
});

test('accepts a green classic airtrust-gcb status when present', () => {
  assert.doesNotThrow(() =>
    verifyReleaseGatePayloads({
      checkRuns: greenChecks,
      statuses: [{ context: 'airtrust-gcb', state: 'success' }],
    }),
  );
});

test('paginates beyond 100 unrelated checks before validating all eight required gates', async () => {
  const noise = Array.from({ length: 110 }, (_, i) => ({
    name: `optional-${i}`, status: 'completed', conclusion: 'success',
  }));
  const all = [...noise, ...greenChecks];
  const requestedPages = [];
  const checkRuns = await fetchAllCommitCheckRuns({
    repository: 'Airtrust-Org/airtrust',
    sha: 'a'.repeat(40),
    token: 'test-token',
    get: async (pathname, token) => {
      assert.equal(token, 'test-token');
      requestedPages.push(pathname);
      const page = Number(new URL(pathname, 'https://api.github.com').searchParams.get('page'));
      return { total_count: all.length, check_runs: all.slice((page - 1) * 100, page * 100) };
    },
  });
  assert.equal(requestedPages.length, 2);
  assert.equal(checkRuns.length, 118);
  assert.doesNotThrow(() => verifyReleaseGatePayloads({ checkRuns, statuses: [] }));
});

test('fails closed when GitHub claims additional check runs but the next page is empty', async () => {
  await assert.rejects(
    fetchAllCommitCheckRuns({
      repository: 'Airtrust-Org/airtrust',
      sha: 'b'.repeat(40),
      token: 'test-token',
      get: async (pathname) => ({
        total_count: 118,
        check_runs: new URL(pathname, 'https://api.github.com').searchParams.get('page') === '1'
          ? Array.from({ length: 100 }, (_, i) => ({ name: `optional-${i}` }))
          : [],
      }),
    }),
    /RELEASE_CHECK_RUNS_INCOMPLETE/,
  );
});


test('retries only bounded transient GitHub API 5xx and preserves the exact request', async () => {
  const attempts = [];
  const sleeps = [];
  const result = await githubGet('/repos/example/repo/commits/a/check-runs', 'secret-test', {
    request: async (url, opts) => {
      attempts.push({ url, authorization: opts.headers.authorization });
      if (attempts.length < 3) return { ok: false, status: 500 };
      return { ok: true, json: async () => ({ total_count: 0, check_runs: [] }) };
    },
    sleep: async (ms) => sleeps.push(ms),
  });
  assert.equal(attempts.length, 3);
  assert.deepEqual(sleeps, [250, 500]);
  assert.ok(attempts.every((item) => item.url === 'https://api.github.com/repos/example/repo/commits/a/check-runs'));
  assert.ok(attempts.every((item) => item.authorization === 'Bearer secret-test'));
  assert.deepEqual(result, { total_count: 0, check_runs: [] });
});

test('persistent GitHub API 5xx exhausts retry and fails closed', async () => {
  let attempts = 0;
  await assert.rejects(
    githubGet('/repos/example/repo/status', 'token', {
      request: async () => { attempts += 1; return { ok: false, status: 503 }; },
      sleep: async () => {},
    }),
    /returned HTTP 503/,
  );
  assert.equal(attempts, 3);
});

test('nontransient authorization failures are not retried or treated as green', async () => {
  let attempts = 0;
  await assert.rejects(
    githubGet('/repos/example/repo/status', 'token', {
      request: async () => { attempts += 1; return { ok: false, status: 403 }; },
      sleep: async () => { throw new Error('unexpected retry'); },
    }),
    /returned HTTP 403/,
  );
  assert.equal(attempts, 1);
});

test('transient transport error gets one bounded retry before strict validation', async () => {
  let attempts = 0;
  const payload = await githubGet('/repos/example/repo/status', 'token', {
    request: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('network reset');
      return { ok: true, json: async () => ({ statuses: [] }) };
    },
    sleep: async () => {},
  });
  assert.equal(attempts, 2);
  assert.deepEqual(payload, { statuses: [] });
  await assert.rejects(
    githubGet('/repos/example/repo/status', 'token', {
      request: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
      sleep: async () => { throw new Error('unexpected retry'); },
    }),
    /invalid JSON/,
  );
});

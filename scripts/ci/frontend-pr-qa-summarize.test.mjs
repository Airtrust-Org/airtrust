import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFinalSummary } from './frontend-pr-qa-summarize.mjs';

const provOk = {
  status: 'PROVENANCE_OK',
  prNumber: 282,
  releaseSha: 'd8507b3229bb16a5ff8b74c1ff6664924b9f8831',
  frontendBuildVersion: 'staging-2026-09-03T23:32:38Z-d8507b3',
};

const qaGreen = {
  status: 'PASS',
  mutations_detected: 0,
  desktop: 'PASS',
  mobile_390: 'PASS',
  mobile_375: 'PASS',
  light: 'PASS',
  dark: 'PASS',
  documents: 'FIXTURE_NOT_AVAILABLE',
};

test('all-green provenance + QA yields PASS and never requires worker SHA match', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen, prNumber: 282 });
  assert.equal(s.status, 'PASS');
  assert.equal(s.worker_sha_match_required, false);
  assert.equal(s.pr_number, 282);
  assert.equal(s.authentication, 'REAL_STAGING');
  assert.equal(s.frontend_build_version, 'staging-2026-09-03T23:32:38Z-d8507b3');
});

test('any detected mutation forces FAIL', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: { ...qaGreen, mutations_detected: 1 },
  });
  assert.equal(s.status, 'FAIL');
  assert.equal(s.mutations_detected, 1);
});

test('a failed viewport forces FAIL', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: { ...qaGreen, mobile_375: 'FAIL' } });
  assert.equal(s.status, 'FAIL');
});

test('a failed provenance forces BLOCKED regardless of QA', () => {
  const s = buildFinalSummary({ provenance: { status: 'FAIL' }, qa: qaGreen });
  assert.equal(s.status, 'BLOCKED');
});

test('missing QA summary is treated as BLOCKED, not silently PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: null });
  assert.equal(s.status, 'FAIL');
  assert.equal(s.desktop, 'FAIL');
});

test('only allowlisted primitive fields are emitted (no secret passthrough)', () => {
  const s = buildFinalSummary({
    provenance: { ...provOk, token: 'super-secret', cookies: 'x' },
    qa: { ...qaGreen, email: 'someone@example.com', headers: { authorization: 'Bearer x' } },
  });
  assert.deepEqual(Object.keys(s).sort(), [
    'authentication',
    'dark',
    'desktop',
    'documents',
    'frontend_build_version',
    'light',
    'mobile_375',
    'mobile_390',
    'mutations_detected',
    'pr_number',
    'release_sha',
    'status',
    'worker_sha_match_required',
  ]);
});

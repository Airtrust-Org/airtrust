import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFinalSummary } from './frontend-pr-qa-summarize.mjs';

const provOk = {
  status: 'PROVENANCE_OK',
  prNumber: 282,
  releaseSha: 'd8507b3229bb16a5ff8b74c1ff6664924b9f8831',
  frontendBuildVersion: 'staging-2026-09-03T23:32:38Z-d8507b3',
  worker: { environment: 'staging' },
};

// A run that genuinely exercised the ListaDocumentos RowActionsMenu surface.
const qaGreen = {
  audit_profile: 'destructive-actions',
  mutations_detected: 0,
  real_surfaces_exercised: 1,
  funcionario_fixture: 'SYNTHETIC_FIXTURE_CONFIRMED',
  documents: 'PASS',
  desktop: 'PASS',
  mobile_390: 'PASS',
  mobile_375: 'PASS',
  light: 'PASS',
  dark: 'PASS',
};

test('a real surface + green matrix + PASS documents yields PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen, prNumber: 282 });
  assert.equal(s.status, 'PASS');
  assert.equal(s.worker_sha_match_required, false);
  assert.equal(s.real_surfaces_exercised, 1);
});

test('no synthetic funcionário fixture confirmed => BLOCKED (BLOCKER C)', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: {
      ...qaGreen,
      funcionario_fixture: 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE',
      real_surfaces_exercised: 0,
      documents: 'FIXTURE_NOT_AVAILABLE',
    },
  });
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.funcionario_fixture, 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE');
});

test('funcionario_fixture defaults to NOT_AVAILABLE when the spec did not report it', () => {
  const { funcionario_fixture: _drop, ...qaNoField } = qaGreen;
  const s = buildFinalSummary({ provenance: provOk, qa: qaNoField });
  assert.equal(s.funcionario_fixture, 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE');
  assert.equal(s.status, 'BLOCKED');
});

test('zero real #282 surfaces exercised => BLOCKED even with a green matrix', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: { ...qaGreen, real_surfaces_exercised: 0, documents: 'FIXTURE_NOT_AVAILABLE' },
  });
  assert.equal(s.status, 'BLOCKED');
});

test('documents fixture not available => BLOCKED (Documentos is a #282 surface)', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: { ...qaGreen, real_surfaces_exercised: 1, documents: 'FIXTURE_NOT_AVAILABLE' },
  });
  assert.equal(s.status, 'BLOCKED');
});

test('any detected mutation forces FAIL (overrides BLOCKED)', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: { ...qaGreen, mutations_detected: 1, real_surfaces_exercised: 0 },
  });
  assert.equal(s.status, 'FAIL');
});

test('a failed viewport forces FAIL', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: { ...qaGreen, mobile_375: 'FAIL' } });
  assert.equal(s.status, 'FAIL');
});

test('a failed theme forces FAIL', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: { ...qaGreen, dark: 'FAIL' } });
  assert.equal(s.status, 'FAIL');
});

test('failed provenance forces BLOCKED regardless of QA', () => {
  const s = buildFinalSummary({ provenance: { status: 'FAIL' }, qa: qaGreen });
  assert.equal(s.status, 'BLOCKED');
});

test('missing QA summary is BLOCKED, never silently PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: null });
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.desktop, 'FAIL');
  assert.equal(s.real_surfaces_exercised, 0);
});

test('only allowlisted primitive fields are emitted (no secret passthrough)', () => {
  const s = buildFinalSummary({
    provenance: { ...provOk, token: 'super-secret', cookies: 'x' },
    qa: { ...qaGreen, email: 'someone@example.com', headers: { authorization: 'Bearer x' } },
  });
  assert.deepEqual(Object.keys(s).sort(), [
    'audit_profile',
    'authentication',
    'dark',
    'datatable_runtime',
    'desktop',
    'documents',
    'frontend_build_version',
    'funcionario_fixture',
    'light',
    'mobile_375',
    'mobile_390',
    'mutations_detected',
    'pr_number',
    'real_surfaces_exercised',
    'release_sha',
    'status',
    'worker_environment',
    'worker_sha_match_required',
  ]);
});

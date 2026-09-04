import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFinalSummary,
  MATRIX_CELL_KEYS,
  normalizeMatrixCells,
  normalizeA11yStatus,
} from './frontend-pr-qa-summarize.mjs';

const provOk = {
  status: 'PROVENANCE_OK',
  prNumber: 282,
  releaseSha: 'd8507b3229bb16a5ff8b74c1ff6664924b9f8831',
  frontendBuildVersion: 'staging-2026-09-03T23:32:38Z-d8507b3',
  worker: { environment: 'staging' },
};

function cells(overrides = {}) {
  const base = Object.fromEntries(MATRIX_CELL_KEYS.map((k) => [k, 'PASS']));
  return { ...base, ...overrides };
}

// A run that genuinely exercised every matrix cell + the a11y contract.
function qaGreen(overrides = {}) {
  return {
    audit_profile: 'destructive-actions',
    authentication: 'REAL_STAGING',
    mutations_detected: 0,
    real_surfaces_exercised: 6,
    funcionario_fixture: 'SYNTHETIC_FIXTURE_CONFIRMED',
    matrix_cells: cells(),
    a11y_status: 'PASS',
    ...overrides,
  };
}

test('1. six PASS cells + a11y PASS => global PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen(), prNumber: 282 });
  assert.equal(s.status, 'PASS');
  assert.equal(s.worker_sha_match_required, false);
  assert.equal(s.a11y_status, 'PASS');
  assert.equal(s.documents, 'PASS');
});

test('2. five PASS + one BLOCKED => global BLOCKED', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({ matrix_cells: cells({ mobile_390_dark: 'BLOCKED' }) }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('3. five PASS + one NOT_RUN => global BLOCKED', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({ matrix_cells: cells({ mobile_375_light: 'NOT_RUN' }) }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('4. five PASS + one FAIL => global FAIL', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({ matrix_cells: cells({ desktop_dark: 'FAIL' }) }),
  });
  assert.equal(s.status, 'FAIL');
  assert.equal(s.documents, 'FAIL');
});

test('5. a BLOCKED cell is not rescued by other PASS cells', () => {
  // desktop_light PASS "after" mobile_390_dark BLOCKED — order irrelevant.
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({
      matrix_cells: cells({ mobile_390_dark: 'BLOCKED', desktop_light: 'PASS' }),
    }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('6. desktop PASS, mobile_390 BLOCKED => BLOCKED', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({
      matrix_cells: cells({ mobile_390_light: 'BLOCKED', mobile_390_dark: 'BLOCKED' }),
    }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('7. light PASS, dark BLOCKED => BLOCKED', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({
      matrix_cells: cells({
        desktop_dark: 'BLOCKED',
        mobile_390_dark: 'BLOCKED',
        mobile_375_dark: 'BLOCKED',
      }),
    }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('8. all cells PASS + a11y BLOCKED => BLOCKED', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ a11y_status: 'BLOCKED' }) });
  assert.equal(s.status, 'BLOCKED');
});

test('9. all cells PASS + a11y NOT_RUN => BLOCKED', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ a11y_status: 'NOT_RUN' }) });
  assert.equal(s.status, 'BLOCKED');
});

test('10. all cells PASS + a11y FAIL => FAIL', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ a11y_status: 'FAIL' }) });
  assert.equal(s.status, 'FAIL');
});

test('11. all cells PASS + a11y PASS + mutation > 0 => FAIL', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ mutations_detected: 1 }) });
  assert.equal(s.status, 'FAIL');
});

test('12. summary without matrix_cells => BLOCKED', () => {
  const { matrix_cells: _drop, ...noMatrix } = qaGreen();
  const s = buildFinalSummary({ provenance: provOk, qa: noMatrix });
  assert.equal(s.status, 'BLOCKED');
  // and every derived cell fails closed to BLOCKED
  for (const k of MATRIX_CELL_KEYS) assert.equal(s.matrix_cells[k], 'BLOCKED');
});

test('13. a missing cell key => BLOCKED (fail closed)', () => {
  const partial = cells();
  delete partial.mobile_375_dark;
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ matrix_cells: partial }) });
  assert.equal(s.matrix_cells.mobile_375_dark, 'BLOCKED');
  assert.equal(s.status, 'BLOCKED');
});

test('14. an unknown value in a cell => BLOCKED (fail closed)', () => {
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({ matrix_cells: cells({ desktop_light: 'MAYBE' }) }),
  });
  assert.equal(s.matrix_cells.desktop_light, 'BLOCKED');
  assert.equal(s.status, 'BLOCKED');
});

test('15. one cell cannot overwrite another — only its own key is read', () => {
  const raw = cells({ desktop_light: 'FAIL' });
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ matrix_cells: raw }) });
  assert.equal(s.matrix_cells.desktop_light, 'FAIL');
  for (const k of MATRIX_CELL_KEYS.filter((x) => x !== 'desktop_light')) {
    assert.equal(s.matrix_cells[k], 'PASS');
  }
  assert.equal(s.status, 'FAIL');
});

test('failed provenance forces BLOCKED regardless of a green matrix', () => {
  const s = buildFinalSummary({ provenance: { status: 'FAIL' }, qa: qaGreen() });
  assert.equal(s.status, 'BLOCKED');
});

test('missing QA summary is BLOCKED, never silently PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: null });
  assert.equal(s.status, 'BLOCKED');
  for (const k of MATRIX_CELL_KEYS) assert.equal(s.matrix_cells[k], 'BLOCKED');
  assert.equal(s.a11y_status, 'NOT_RUN');
  assert.equal(s.real_surfaces_exercised, 0);
});

test('a non-staging worker environment blocks a global PASS', () => {
  const s = buildFinalSummary({
    provenance: { ...provOk, worker: { environment: 'development' } },
    qa: qaGreen(),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('authentication that is not REAL_STAGING blocks a global PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ authentication: 'FAKE' }) });
  assert.equal(s.status, 'BLOCKED');
});

test('BLOCKER J.1 — auth REAL_STAGING + everything else green => PASS', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen() });
  assert.equal(s.status, 'PASS');
  assert.equal(s.authentication, 'REAL_STAGING');
});

test('BLOCKER J.2 — missing authentication field => BLOCKED, never defaulted', () => {
  const { authentication: _drop, ...qaNoAuth } = qaGreen();
  const s = buildFinalSummary({ provenance: provOk, qa: qaNoAuth });
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.authentication, '');
  assert.notEqual(s.authentication, 'REAL_STAGING');
});

test('BLOCKER J.3 — empty-string authentication => BLOCKED', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ authentication: '' }) });
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.authentication, '');
});

test('BLOCKER J.4 — authentication "MOCK" => BLOCKED', () => {
  const s = buildFinalSummary({ provenance: provOk, qa: qaGreen({ authentication: 'MOCK' }) });
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.authentication, 'MOCK');
});

test('BLOCKER J.5 — the final summary never reports REAL_STAGING when the input carries no such evidence', () => {
  for (const badAuth of [undefined, null, '', 'MOCK', 42, {}, ['REAL_STAGING']]) {
    const { authentication: _drop, ...base } = qaGreen();
    const qa = badAuth === undefined ? base : { ...base, authentication: badAuth };
    const s = buildFinalSummary({ provenance: provOk, qa });
    assert.notEqual(s.authentication, 'REAL_STAGING', `input=${JSON.stringify(badAuth)}`);
    assert.equal(s.status, 'BLOCKED', `input=${JSON.stringify(badAuth)}`);
  }
});

test('real_surfaces_exercised is informational only, not a sufficient gate', () => {
  // 6 surfaces exercised but a cell is BLOCKED -> still BLOCKED.
  const s = buildFinalSummary({
    provenance: provOk,
    qa: qaGreen({ real_surfaces_exercised: 6, matrix_cells: cells({ desktop_dark: 'BLOCKED' }) }),
  });
  assert.equal(s.status, 'BLOCKED');
});

test('normalizeMatrixCells / normalizeA11yStatus fail closed', () => {
  assert.deepEqual(normalizeMatrixCells(null).matrixObjectPresent, false);
  assert.equal(normalizeMatrixCells({}).cells.desktop_light, 'BLOCKED');
  assert.equal(normalizeMatrixCells([]).matrixObjectPresent, false);
  assert.equal(normalizeMatrixCells({ desktop_light: 'PASS' }).cells.desktop_light, 'PASS');
  assert.equal(normalizeA11yStatus(undefined), 'NOT_RUN');
  assert.equal(normalizeA11yStatus('weird'), 'BLOCKED');
  assert.equal(normalizeA11yStatus('PASS'), 'PASS');
});

test('only allowlisted primitive fields are emitted (no secret passthrough)', () => {
  const s = buildFinalSummary({
    provenance: { ...provOk, token: 'super-secret', cookies: 'x' },
    qa: { ...qaGreen(), email: 'someone@example.com', headers: { authorization: 'Bearer x' } },
  });
  assert.deepEqual(Object.keys(s).sort(), [
    'a11y_status',
    'audit_profile',
    'authentication',
    'datatable_runtime',
    'documents',
    'frontend_build_version',
    'funcionario_fixture',
    'matrix_cells',
    'mutations_detected',
    'pr_number',
    'real_surfaces_exercised',
    'release_sha',
    'status',
    'worker_environment',
    'worker_sha_match_required',
  ]);
  assert.deepEqual(Object.keys(s.matrix_cells).sort(), [...MATRIX_CELL_KEYS].sort());
});

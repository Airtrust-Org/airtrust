import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRiskTestCoverage,
  evaluateRiskTestCoverage,
  resolveBaseRef,
} from '../guard-risk-test-delta.mjs';

test('passes when no protected runtime boundary changed', () => {
  assert.deepEqual(evaluateRiskTestCoverage(['docs/README.md']), []);
});

test('requires a focused auth or tenant regression test', () => {
  assert.throws(
    () => assertRiskTestCoverage(['worker-airtrust/src/middleware/tenant.ts']),
    /auth-tenant-boundary/,
  );
  assert.throws(
    () =>
      assertRiskTestCoverage([
        'worker-airtrust/src/middleware/tenant.ts',
        'worker-airtrust/src/__tests__/routes/health.test.ts',
      ]),
    /auth-tenant-boundary/,
  );

  const result = assertRiskTestCoverage([
    'worker-airtrust/src/middleware/tenant.ts',
    'worker-airtrust/src/__tests__/middleware/tenant-isolation.test.ts',
  ]);
  assert.equal(result[0].covered, true);
});

test('requires certificate-specific tests instead of an unrelated test', () => {
  assert.throws(
    () =>
      assertRiskTestCoverage([
        'worker-airtrust/src/routes/certificados.ts',
        'worker-airtrust/src/__tests__/middleware/auth.test.ts',
      ]),
    /certificate-compliance/,
  );

  assert.doesNotThrow(() =>
    assertRiskTestCoverage([
      'worker-airtrust/src/routes/certificados.ts',
      'worker-airtrust/src/routes/__tests__/certificados-auth.test.ts',
    ]),
  );
});

test('accepts focused LMS and EdApp tests for historical LMS changes', () => {
  assert.doesNotThrow(() =>
    assertRiskTestCoverage([
      'worker-airtrust/src/routes/lms-edapp-legado.ts',
      'worker-airtrust/src/routes/__tests__/lms-edapp-readonly-contract.test.ts',
    ]),
  );
});

test('requires a focused release safety test or smoke', () => {
  assert.throws(() => assertRiskTestCoverage(['scripts/deploy-worker-only.sh']), /release-safety/);
  assert.throws(
    () =>
      assertRiskTestCoverage([
        'scripts/deploy-worker-only.sh',
        'scripts/__tests__/package-references.test.mjs',
      ]),
    /release-safety/,
  );

  assert.doesNotThrow(() =>
    assertRiskTestCoverage([
      'scripts/deploy-worker-only.sh',
      'scripts/__tests__/deploy-worker-only.test.mjs',
    ]),
  );
});

test('classifies protected release workflows as release-safety changes', () => {
  assert.throws(
    () => assertRiskTestCoverage(['.github/workflows/deploy-production.yml']),
    /release-safety/,
  );

  assert.doesNotThrow(() =>
    assertRiskTestCoverage([
      '.github/workflows/deploy-production.yml',
      'scripts/__tests__/deploy-production.test.mjs',
    ]),
  );
});

test('resolves explicit, environment and GitHub base refs in priority order', () => {
  assert.equal(resolveBaseRef({ GITHUB_BASE_REF: 'release' }, 'origin/custom'), 'origin/custom');
  assert.equal(
    resolveBaseRef(
      { GUARD_RISK_TEST_BASE_REF: 'origin/develop', GITHUB_BASE_REF: 'main' },
      undefined,
    ),
    'origin/develop',
  );
  assert.equal(resolveBaseRef({ GITHUB_BASE_REF: 'release' }, undefined), 'origin/release');
  assert.equal(resolveBaseRef({}, undefined), 'origin/main');
});
